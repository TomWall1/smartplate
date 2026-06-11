/**
 * services/matchEdgeService.js
 *
 * Persisted ingredient↔deal match verdicts ("edges").
 *
 * Replaces the old weekly AI matching in recipeService (per-recipe pick-best
 * calls + a separate verification pass), which re-purchased the same
 * (ingredient, product) judgments from Claude every single week. Here every
 * judgment is made ONCE, persisted in match_edges, and reused forever:
 *
 *   candidates (recipeMatcher text/PI) → edge lookup → only never-seen pairs
 *   go to Claude (batched) → verdicts persisted → invalid pairs dropped.
 *
 * Marginal weekly cost decays toward zero as the edge store saturates
 * (deal names recur week to week; the recipe library is static), and
 * verdicts are consistent across weeks instead of re-rolled.
 *
 * Edge keys use lib/normalize.normalizeName, which strips brands/sizes but
 * KEEPS form words (marinated, crumbed, smoked...), so products differing in
 * preparation never share a verdict.
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { normalizeName } = require('../lib/normalize');
const { mapWithConcurrency, withRetry } = require('../lib/concurrency');
const db = require('../database/db');

// Default set from the golden-set eval (scripts/eval/evalMatchModels.js).
// Override with MATCH_EDGE_MODEL.
const JUDGE_MODEL       = process.env.MATCH_EDGE_MODEL || 'claude-sonnet-4-6';
const JUDGE_BATCH_SIZE  = 30;
const JUDGE_CONCURRENCY = 3;
const AI_RETRY = { retries: 2, shouldRetry: (err) => err?.status === 429 || err?.status >= 500 };

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

const pairKey = (ingredientNorm, dealNorm) => `${ingredientNorm}||${dealNorm}`;

/**
 * Build the pair-verdict prompt. Exported so the model eval harness judges
 * with EXACTLY the prompt production uses.
 * @param {Array<{ingredient: string, dealName: string}>} pairs
 */
function buildJudgePrompt(pairs) {
  const pairLines = pairs.map((p, i) =>
    `${i + 1}. Ingredient: "${p.ingredient}" ↔ Deal: "${p.dealName}"`
  ).join('\n');

  return `You are a strict quality checker for an Australian meal-planning app. For each proposed pairing below, decide whether the supermarket deal product genuinely IS the recipe ingredient (or a direct substitute a home cook would buy for it).

PAIRINGS:
${pairLines}

RULES:
- VALID only if the deal product IS the ingredient or a direct raw substitute
- Different products never match: "coconut water" ≠ "coconut milk"; "cream" ≠ "ice cream" or "moisturising cream"; prawns ≠ fish ≠ salmon ≠ tuna
- Pre-prepared products do NOT match raw-ingredient requests: marinated, BBQ, crumbed, battered, seasoned, stuffed, glazed, schnitzel, kiev, nuggets, tenders, "ready to cook", frozen meals all FAIL against a plain raw protein
- Exception: smoked salmon IS acceptable for salmon
- Generic ingredients CAN match specific raw cuts ("chicken" → "chicken thigh fillet"); varietal names CAN match the generic ("banana prawns" ARE prawns)
- Non-food products never match food ingredients
- When in doubt, mark invalid — a wrong match shown to a shopper is worse than a missed one

Return ONLY a JSON array (no markdown, no commentary), one entry per pairing, in the same order:
[{"index": 1, "valid": true, "reason": "brief"}, {"index": 2, "valid": false, "reason": "brief"}]`;
}

/**
 * Judge a batch of pairs with Claude. Returns array of {valid, reason} by
 * batch position, or null entries where the response was unusable.
 */
async function judgePairsBatch(pairs, model) {
  const client = getClient();
  const response = await client.messages.create({
    model,
    max_tokens: 2048,
    messages: [{ role: 'user', content: buildJudgePrompt(pairs) }],
  });

  const textBlock = response.content.find(b => b.type === 'text');
  const text = (textBlock?.text ?? '').trim();
  const json = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
  let parsed;
  try {
    parsed = JSON.parse(json);
  } catch {
    console.warn('[matchEdge] Unparsable judge response:', text.slice(0, 200));
    return pairs.map(() => null);
  }
  if (!Array.isArray(parsed)) return pairs.map(() => null);

  const results = pairs.map(() => null);
  for (const entry of parsed) {
    if (entry && typeof entry.index === 'number' && typeof entry.valid === 'boolean') {
      const i = entry.index - 1;
      if (i >= 0 && i < pairs.length) {
        results[i] = { valid: entry.valid, reason: entry.reason || '' };
      }
    }
  }
  return { results, usage: response.usage };
}

/**
 * Filter every recipe's matchedDeals through the edge store.
 *
 * - Pairs with a stored verdict are kept/dropped instantly (no tokens).
 * - Never-seen pairs are judged in batches, persisted, then applied.
 * - Pairs whose judging failed (API error / unparsable) are KEPT and not
 *   persisted — fail-open, same behavior as the old verification pass.
 *
 * Mutates each recipe's matchedDeals (filtered copy) and returns stats.
 *
 * @param {Array} recipes - recipes with matchedDeals [{ingredient, dealName, ...}]
 * @param {object} [opts] - {model}
 */
async function filterRecipesByEdges(recipes, opts = {}) {
  const model = opts.model || JUDGE_MODEL;

  // 1. Collect unique pairs across all recipes
  const uniquePairs = new Map(); // key → {ingredient, dealName, ingredientNorm, dealNorm}
  for (const recipe of recipes) {
    for (const md of recipe.matchedDeals || []) {
      if (!md.ingredient || !md.dealName) continue;
      const ingredientNorm = normalizeName(md.ingredient);
      const dealNorm       = normalizeName(md.dealName);
      if (!ingredientNorm || !dealNorm) continue;
      const key = pairKey(ingredientNorm, dealNorm);
      if (!uniquePairs.has(key)) {
        uniquePairs.set(key, { ingredient: md.ingredient, dealName: md.dealName, ingredientNorm, dealNorm });
      }
    }
  }

  const allPairs = [...uniquePairs.values()];
  const verdicts = new Map(); // key → boolean

  // 2. Bulk edge lookup
  let stored = new Map();
  try {
    stored = await db.getMatchEdges(allPairs);
  } catch (err) {
    console.warn('[matchEdge] Edge lookup failed — judging all pairs fresh:', err.message);
  }
  for (const p of allPairs) {
    const hit = stored.get(`${p.ingredientNorm} ${p.dealNorm}`);
    if (hit) verdicts.set(pairKey(p.ingredientNorm, p.dealNorm), !!hit.verdict);
  }

  // 3. Judge novel pairs in batches
  const novel = allPairs.filter(p => !verdicts.has(pairKey(p.ingredientNorm, p.dealNorm)));
  const batches = [];
  for (let i = 0; i < novel.length; i += JUDGE_BATCH_SIZE) {
    batches.push(novel.slice(i, i + JUDGE_BATCH_SIZE));
  }

  let judged = 0, failed = 0, calls = 0;
  let inputTokens = 0, outputTokens = 0;
  const toPersist = [];

  await mapWithConcurrency(batches, JUDGE_CONCURRENCY, async (batch) => {
    let outcome;
    try {
      outcome = await withRetry(() => judgePairsBatch(batch, model), AI_RETRY);
      calls++;
    } catch (err) {
      console.warn(`[matchEdge] Judge batch failed (${batch.length} pairs): ${err.message}`);
      failed += batch.length;
      return;
    }
    const results = outcome.results ?? outcome; // judgePairsBatch returns {results, usage} on success
    if (outcome.usage) {
      inputTokens  += outcome.usage.input_tokens  ?? 0;
      outputTokens += outcome.usage.output_tokens ?? 0;
    }
    batch.forEach((p, i) => {
      const r = results[i];
      if (!r) { failed++; return; }
      judged++;
      verdicts.set(pairKey(p.ingredientNorm, p.dealNorm), r.valid);
      toPersist.push({
        ingredientNorm: p.ingredientNorm,
        dealNorm:       p.dealNorm,
        verdict:        r.valid,
        reason:         r.reason,
        model,
      });
    });
  });

  // 4. Persist new verdicts
  if (toPersist.length) {
    try {
      await db.saveMatchEdges(toPersist);
    } catch (err) {
      console.warn('[matchEdge] Persisting edges failed (verdicts still applied this run):', err.message);
    }
  }

  // 5. Apply verdicts — drop invalid pairs; keep valid and undecided
  let dropped = 0;
  for (const recipe of recipes) {
    if (!recipe.matchedDeals?.length) continue;
    recipe.matchedDeals = recipe.matchedDeals.filter(md => {
      const key = pairKey(normalizeName(md.ingredient || ''), normalizeName(md.dealName || ''));
      const verdict = verdicts.get(key);
      if (verdict === false) { dropped++; return false; }
      return true;
    });
  }

  const stats = {
    uniquePairs: allPairs.length,
    cacheHits:   allPairs.length - novel.length,
    judged,
    failed,
    calls,
    dropped,
    inputTokens,
    outputTokens,
    model,
  };
  console.log(
    `[matchEdge] ${stats.uniquePairs} pairs — ${stats.cacheHits} from edge store, ` +
    `${stats.judged} judged fresh (${stats.calls} calls, ${inputTokens}in/${outputTokens}out tokens), ` +
    `${stats.failed} undecided, ${stats.dropped} deal matches dropped`
  );
  return stats;
}

module.exports = { filterRecipesByEdges, buildJudgePrompt, judgePairsBatch, JUDGE_MODEL };
