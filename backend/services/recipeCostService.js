/**
 * services/recipeCostService.js
 *
 * Durable per-recipe total-cost estimates.
 *
 * The old weekly Sonnet "enrichment" step asked Claude to re-estimate
 * totalEstimatedCost for the same recipes every week (and to do sums and
 * string formatting, now done in code). The recipe library is static, so a
 * cost estimate is a ONE-TIME judgment: estimate once, persist in
 * recipe_meta, reuse forever. First run costs ~150 estimates; after that
 * only never-before-matched recipes trickle in.
 *
 * Failures are non-fatal: a recipe without an estimate gets cost 0 and the
 * frontend hides the price chip (RecipeCard renders it only when > 0).
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');
const { mapWithConcurrency, withRetry } = require('../lib/concurrency');
const db = require('../database/db');

const COST_MODEL       = process.env.RECIPE_COST_MODEL || 'claude-sonnet-4-6';
const COST_BATCH_SIZE  = 25;
const COST_CONCURRENCY = 2;
const AI_RETRY = { retries: 2, shouldRetry: (err) => err?.status === 429 || err?.status >= 500 };

let _client = null;
function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not configured');
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

/** Stable identity for a library recipe across weekly runs. */
function recipeKey(recipe) {
  const source = (recipe.source || 'unknown').toLowerCase().trim();
  const title  = (recipe.title  || '').toLowerCase().trim();
  return `${source}:${title}`;
}

async function estimateBatch(recipes) {
  const client = getClient();
  const summary = recipes.map((r, i) => ({
    id: i + 1,
    title: r.title,
    ingredients: (r.ingredients || []).map(ing => ing.raw || ing.name || ing).filter(Boolean).slice(0, 30),
  }));

  const prompt = `You are an Australian grocery-price expert. For each recipe below, estimate the realistic TOTAL cost in AUD of all its ingredients for a home cook shopping at a major Australian supermarket (Woolworths/Coles, 2026 prices). Assume common pantry staples (oil, salt, pepper, basic spices, flour, sugar) are already owned and cost nothing.

RECIPES:
${JSON.stringify(summary, null, 1)}

Return ONLY a JSON array (no markdown), one entry per recipe, same order:
[{"id": 1, "cost": 18.50}, {"id": 2, "cost": 24.00}]`;

  const response = await client.messages.create({
    model: COST_MODEL,
    max_tokens: 2048,
    messages: [{ role: 'user', content: prompt }],
  });

  const text = (response.content[0]?.text ?? '').trim();
  const json = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
  const parsed = JSON.parse(json);
  if (!Array.isArray(parsed)) throw new Error('cost estimator returned non-array');

  const costs = recipes.map(() => null);
  for (const entry of parsed) {
    if (entry && typeof entry.id === 'number' && typeof entry.cost === 'number') {
      const i = entry.id - 1;
      if (i >= 0 && i < recipes.length && entry.cost >= 0) costs[i] = +entry.cost.toFixed(2);
    }
  }
  return costs;
}

/**
 * Return a Map recipeKey → totalEstimatedCost for the given recipes.
 * Stored estimates are reused; missing ones are estimated once and persisted.
 * Never throws — recipes that could not be estimated are simply absent.
 */
async function getCosts(recipes) {
  const keys = [...new Set(recipes.map(recipeKey))];
  let costMap = new Map();
  try {
    costMap = await db.getRecipeCosts(keys);
  } catch (err) {
    console.warn('[recipeCost] Stored-cost lookup failed:', err.message);
  }

  const missing = [];
  const seen = new Set();
  for (const r of recipes) {
    const key = recipeKey(r);
    if (!costMap.has(key) && !seen.has(key)) { seen.add(key); missing.push(r); }
  }
  if (!missing.length) {
    console.log(`[recipeCost] All ${keys.length} recipe costs served from recipe_meta`);
    return costMap;
  }

  const batches = [];
  for (let i = 0; i < missing.length; i += COST_BATCH_SIZE) {
    batches.push(missing.slice(i, i + COST_BATCH_SIZE));
  }

  let estimated = 0;
  const toPersist = [];
  await mapWithConcurrency(batches, COST_CONCURRENCY, async (batch) => {
    let costs;
    try {
      costs = await withRetry(() => estimateBatch(batch), AI_RETRY);
    } catch (err) {
      console.warn(`[recipeCost] Estimate batch failed (${batch.length} recipes): ${err.message}`);
      return;
    }
    batch.forEach((r, i) => {
      if (costs[i] == null) return;
      const key = recipeKey(r);
      costMap.set(key, costs[i]);
      toPersist.push({ recipeKey: key, cost: costs[i], model: COST_MODEL });
      estimated++;
    });
  });

  if (toPersist.length) {
    try {
      await db.saveRecipeCosts(toPersist);
    } catch (err) {
      console.warn('[recipeCost] Persisting cost estimates failed:', err.message);
    }
  }

  console.log(`[recipeCost] ${costMap.size - estimated} costs from recipe_meta, ${estimated} estimated fresh (one-time)`);
  return costMap;
}

module.exports = { getCosts, recipeKey };
