/**
 * services/aiMatcher.js
 * AI-powered ingredient-to-deal matching using Claude.
 *
 * Runs ONCE per week during recipe generation (not on user requests).
 * Results are cached in weekly-recipes.json for the entire week.
 *
 * Cost controls:
 *   - Batches up to 20 ingredients per API call
 *   - 500ms delay between calls
 *   - Uses Claude Haiku (cheapest model)
 *   - Tracks total calls, ingredients, and estimated cost
 */

require('dotenv').config();
const Anthropic = require('@anthropic-ai/sdk');

let _client = null;

function getClient() {
  if (!_client) {
    if (!process.env.ANTHROPIC_API_KEY) {
      throw new Error('ANTHROPIC_API_KEY not configured');
    }
    _client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return _client;
}

// ── Cost tracking ──────────────────────────────────────────────────────────────

let matchStats = {
  totalCalls: 0,
  totalIngredients: 0,
  totalDeals: 0,
  estimatedCost: 0,
  lastRunAt: null,
};

// ── Core batch matcher ────────────────────────────────────────────────────────

/**
 * Match a batch of up to 20 ingredients against available deals using Claude.
 *
 * @param {string[]} ingredients - Recipe ingredient names (max 20)
 * @param {object[]} deals       - Enriched food deal objects from dealService
 * @returns {object} Map of ingredientName → { deal, confidence, reason } | null
 */
async function matchIngredientBatch(ingredients, deals) {
  const client = getClient();

  // Build a concise deal list for the prompt
  const dealLines = deals.map((d, i) => {
    const price = d.price != null ? ` $${d.price.toFixed(2)}` : '';
    const saving = (d.originalPrice && d.price)
      ? ` (save $${(d.originalPrice - d.price).toFixed(2)})`
      : '';
    return `[${i}] ${d.name}${price}${saving} — ${d.store || 'store'}`;
  });

  const ingLines = ingredients.map((ing, i) => `${i + 1}. ${ing}`).join('\n');

  const prompt = `You are an expert ingredient matcher for an Australian meal planning app.

RECIPE INGREDIENTS TO MATCH:
${ingLines}

AVAILABLE SUPERMARKET DEALS:
${dealLines.join('\n')}

STRICT MATCHING RULES:
- ONLY match if the deal product IS the ingredient or a direct raw substitute
- "coconut water" ≠ "coconut milk" — they are completely different products
- "beef mince" ≠ "bacon rashers" — different products, never match
- "chicken thighs" ≠ "marinated chicken kebabs" — raw cuts ≠ pre-marinated/prepared
- "frozen peas" ≠ "prawns" — completely different ingredients
- "banana prawns" = "prawns" — banana prawns ARE prawns, this is a valid match
- Generic cuts (e.g. "chicken") CAN match specific raw cuts (e.g. "chicken thigh fillet")
- Different seafood types do NOT match each other (prawns ≠ fish ≠ salmon)
- If no deal is a good match, use null for dealIndex
- When in doubt, prefer no match over a wrong match

AUTOMATIC DISQUALIFIERS — if a deal name contains ANY of these words, it CANNOT match a plain raw protein ingredient:
- "BBQ", "marinated", "crumbed", "battered", "seasoned", "pre-seasoned", "stuffed", "flavoured", "glazed", "smoked" (for fresh chicken/pork/beef — smoked salmon IS acceptable for salmon)
- "nibble", "nugget", "tender", "strip", "schnitzel", "kiev", "ready to cook", "frozen meal"
- "cracker", "crumbed", "battered", "lemon pepper" (for seafood)
EXAMPLE: "free-range chicken wings" recipe ingredient — "Woolworths BBQ Marinated Chicken Wing Nibble" FAILS because it contains "BBQ", "Marinated", and "Nibble". Return dealIndex: null.

Return ONLY valid JSON (no markdown, no explanation):
[
  {"ingredient": "exact ingredient name from list", "dealIndex": 0, "confidence": "high|medium|low", "reason": "brief reason"},
  {"ingredient": "another ingredient", "dealIndex": null, "confidence": "high", "reason": "no suitable deal available"},
  ...
]

One entry per ingredient, in the same order as the ingredients list above.`;

  const response = await client.messages.create({
    model: 'claude-haiku-4-5-20251001',
    max_tokens: 1024,
    messages: [{ role: 'user', content: prompt }],
  });

  // Update stats
  matchStats.totalCalls++;
  matchStats.totalIngredients += ingredients.length;
  matchStats.totalDeals += deals.length;
  matchStats.estimatedCost += 0.02; // conservative Haiku estimate per call
  matchStats.lastRunAt = new Date().toISOString();

  // Parse response
  const text = (response.content[0]?.text ?? '').trim();
  let parsed;
  try {
    const json = text.replace(/^```json?\n?/i, '').replace(/\n?```$/i, '').trim();
    parsed = JSON.parse(json);
  } catch {
    console.error('aiMatcher: Failed to parse batch response:', text.slice(0, 300));
    // Return no matches for this batch rather than crashing
    return Object.fromEntries(ingredients.map(ing => [ing, null]));
  }

  if (!Array.isArray(parsed)) {
    console.error('aiMatcher: Response was not an array');
    return Object.fromEntries(ingredients.map(ing => [ing, null]));
  }

  // Map results back to ingredient names
  const resultMap = {};
  for (const entry of parsed) {
    if (!entry?.ingredient) continue;
    const ingName = entry.ingredient;

    if (entry.dealIndex === null || entry.dealIndex === undefined) {
      resultMap[ingName] = null;
    } else {
      const deal = deals[entry.dealIndex];
      if (deal) {
        resultMap[ingName] = {
          deal,
          confidence: entry.confidence || 'medium',
          reason: entry.reason || '',
        };
      } else {
        resultMap[ingName] = null;
      }
    }
  }

  // Ensure all input ingredients have an entry
  for (const ing of ingredients) {
    if (!(ing in resultMap)) resultMap[ing] = null;
  }

  return resultMap;
}

// ── Per-recipe matcher ────────────────────────────────────────────────────────

/**
 * Match all ingredients in a single recipe against available deals.
 * Ingredients are batched in groups of 20 with a 500ms delay between batches.
 *
 * @param {object}   recipe - Recipe with ingredients array
 * @param {object[]} deals  - Pre-filtered food deals from dealService
 * @returns {object[]} Array of matched deal objects (same shape as recipeMatcher output)
 */
async function matchRecipeToDeals(recipe, deals) {
  const ingredients = (recipe.ingredients || [])
    .map(ing => (typeof ing === 'string' ? ing : ing.name))
    .filter(Boolean);

  if (ingredients.length === 0) return [];

  const allResults = {};
  const BATCH_SIZE = 20;

  for (let i = 0; i < ingredients.length; i += BATCH_SIZE) {
    if (i > 0) {
      // 500ms rate-limiting delay between batches within a recipe
      await new Promise(resolve => setTimeout(resolve, 500));
    }
    const batch = ingredients.slice(i, i + BATCH_SIZE);
    const batchResults = await matchIngredientBatch(batch, deals);
    Object.assign(allResults, batchResults);
  }

  // Build matched deals in the same shape recipeMatcher uses
  const matchedDeals = [];
  for (const [ingredientName, result] of Object.entries(allResults)) {
    if (!result) continue;
    const { deal, confidence, reason } = result;
    matchedDeals.push({
      dealName:           deal.name,
      ingredient:         ingredientName,
      price:              deal.price              ?? null,
      originalPrice:      deal.originalPrice      ?? null,
      discountPercentage: deal.discountPercentage ?? null,
      saving: (deal.originalPrice != null && deal.price != null)
        ? +(deal.originalPrice - deal.price).toFixed(2)
        : null,
      store:              deal.store              ?? null,
      productCategory:    deal.productIntelligence?.category ?? null,
      productIntelligence: deal.productIntelligence ?? null,
      aiConfidence:       confidence,
      aiReason:           reason,
    });
  }

  return matchedDeals;
}

// ── Stats ─────────────────────────────────────────────────────────────────────

function getMatchStats() {
  return {
    ...matchStats,
    averageIngredientsPerCall: matchStats.totalCalls > 0
      ? +(matchStats.totalIngredients / matchStats.totalCalls).toFixed(1)
      : 0,
  };
}

function resetMatchStats() {
  matchStats = {
    totalCalls: 0,
    totalIngredients: 0,
    totalDeals: 0,
    estimatedCost: 0,
    lastRunAt: null,
  };
}

module.exports = { matchIngredientBatch, matchRecipeToDeals, getMatchStats, resetMatchStats };
