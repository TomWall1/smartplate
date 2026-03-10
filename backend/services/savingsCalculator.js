/**
 * services/savingsCalculator.js
 * Per-serving savings calculator for matched recipe deals.
 */

// ── Unit normalisation to base units (g or ml) ────────────────────────────────

const TO_BASE = {
  // Volume → ml
  ml: { base: 'ml', factor: 1 },
  l:  { base: 'ml', factor: 1000 }, litre: { base: 'ml', factor: 1000 },
  liter: { base: 'ml', factor: 1000 }, litres: { base: 'ml', factor: 1000 },
  liters: { base: 'ml', factor: 1000 },
  tbsp: { base: 'ml', factor: 15 }, tablespoon:  { base: 'ml', factor: 15 },
  tablespoons: { base: 'ml', factor: 15 },
  tsp:  { base: 'ml', factor: 5  }, teaspoon:    { base: 'ml', factor: 5 },
  teaspoons: { base: 'ml', factor: 5 },
  cup:  { base: 'ml', factor: 250 }, cups: { base: 'ml', factor: 250 },
  // Weight → g
  g: { base: 'g', factor: 1 }, gm: { base: 'g', factor: 1 },
  gram: { base: 'g', factor: 1 }, grams: { base: 'g', factor: 1 },
  kg: { base: 'g', factor: 1000 }, kilogram: { base: 'g', factor: 1000 },
  kilograms: { base: 'g', factor: 1000 },
  oz: { base: 'g', factor: 28.35 },
  lb: { base: 'g', factor: 453.6 }, lbs: { base: 'g', factor: 453.6 },
};

// Unit pattern (all units we recognise in ingredient/deal text)
const UNIT_RE = /(g|gm|grams?|kg|kilograms?|ml|l|litres?|liters?|tbsp|tablespoons?|tsp|teaspoons?|cups?|oz|lbs?)/i;

// ── Parsing helpers ───────────────────────────────────────────────────────────

function parseNumber(str) {
  if (str.includes('/')) {
    const [n, d] = str.split('/').map(Number);
    return d ? n / d : null;
  }
  const n = parseFloat(str);
  return isNaN(n) ? null : n;
}

/**
 * Parse a quantity from recipe ingredient text.
 *   "2 tbsp olive oil"    → { amount: 30,   unit: 'ml', rawAmount: 2,   rawUnit: 'tbsp' }
 *   "500g chicken breast" → { amount: 500,  unit: 'g',  rawAmount: 500, rawUnit: 'g'    }
 *   "1/2 cup rice"        → { amount: 125,  unit: 'ml', rawAmount: 0.5, rawUnit: 'cup'  }
 * Returns null if unparseable.
 */
function parseQuantity(text) {
  if (!text) return null;
  const m = text.match(new RegExp(`(\\d+\\.?\\d*|\\d+\\/\\d+)\\s*${UNIT_RE.source}`, 'i'));
  if (!m) return null;

  const rawAmount = parseNumber(m[1]);
  const unitKey   = m[2].toLowerCase();
  const conv      = TO_BASE[unitKey];
  if (!rawAmount || !conv) return null;

  return { amount: rawAmount * conv.factor, unit: conv.base, rawAmount, rawUnit: unitKey };
}

/**
 * Parse the package size from a deal name or size field.
 *   "Extra Virgin Olive Oil 4L" → { amount: 4000, unit: 'ml' }
 *   "Chicken Breast 500g"       → { amount: 500,  unit: 'g'  }
 * Returns null if not found.
 */
function parseDealSize(dealName, sizeField = null) {
  const text  = sizeField || dealName || '';
  // Only g/kg/ml/l for package sizes (no tsp/tbsp/cups on packets)
  const m = text.match(/([\d.]+)\s*(g|gm|grams?|kg|kilograms?|ml|l|litres?|liters?)\b/i);
  if (!m) return null;

  const amount  = parseFloat(m[1]);
  const unitKey = m[2].toLowerCase();
  const conv    = TO_BASE[unitKey];
  if (!amount || !conv) return null;

  return { amount: amount * conv.factor, unit: conv.base };
}

// ── Core savings calculation ──────────────────────────────────────────────────

const HERO_CATEGORIES = new Set(['meat', 'seafood', 'vegetables', 'fruit', 'dairy', 'eggs']);
const DEFAULT_USAGE_HERO      = 80;  // % of package used per meal for main ingredients
const DEFAULT_USAGE_CONDIMENT = 15;  // % for condiments/oils/spices

/**
 * Calculate per-meal and per-serving savings for a matched deal.
 *
 * @param {object} deal            - Matched deal object { dealName, saving, price, productCategory }
 * @param {string} recipeIngredient - The ingredient line from the recipe (may include quantity)
 * @param {object} recipe          - The recipe (used for servings count)
 * @returns {object} Savings breakdown
 */
function calculateMealSavings(deal, recipeIngredient, recipe) {
  const totalSaving = deal.saving || 0;
  const servings    = recipe.servings || 4;

  if (totalSaving <= 0) {
    return {
      totalProductSaving: 0,
      mealSaving:         0,
      perServingSaving:   0,
      usagePercentage:    null,
      breakdown:          `${deal.dealName} — no saving data`,
      isEstimate:         true,
    };
  }

  const ingQty  = parseQuantity(recipeIngredient || '');
  const dealQty = parseDealSize(deal.dealName);

  let usagePercentage;
  let isEstimate = false;
  let breakdown;

  if (ingQty && dealQty && ingQty.unit === dealQty.unit && dealQty.amount > 0) {
    // Precise calculation — same base unit
    usagePercentage = Math.min((ingQty.amount / dealQty.amount) * 100, 100);

    const pkgLabel = dealQty.unit === 'ml'
      ? (dealQty.amount >= 1000 ? `${(dealQty.amount / 1000).toFixed(1)}L`  : `${dealQty.amount}ml`)
      : (dealQty.amount >= 1000 ? `${(dealQty.amount / 1000).toFixed(1)}kg` : `${dealQty.amount}g`);

    const ingLabel = ingQty.unit === 'ml'
      ? (ingQty.rawUnit === 'tbsp' ? `${ingQty.rawAmount} tbsp` : `${ingQty.rawAmount}${ingQty.rawUnit}`)
      : `${ingQty.rawAmount}${ingQty.rawUnit}`;

    breakdown = `Uses ${ingLabel} from ${pkgLabel} package (${usagePercentage.toFixed(1)}%)`;
  } else {
    // Heuristic: hero ingredients assumed to use most of the package
    const isHero      = HERO_CATEGORIES.has(deal.productCategory || '');
    usagePercentage   = isHero ? DEFAULT_USAGE_HERO : DEFAULT_USAGE_CONDIMENT;
    isEstimate        = true;
    breakdown         = `Estimated ${usagePercentage}% of package used per meal`;
  }

  const mealSaving       = +(totalSaving * (usagePercentage / 100)).toFixed(2);
  const perServingSaving = +(mealSaving / servings).toFixed(2);

  return {
    totalProductSaving: +totalSaving.toFixed(2),
    mealSaving,
    perServingSaving,
    usagePercentage:    +usagePercentage.toFixed(1),
    breakdown,
    isEstimate,
  };
}

/**
 * Enrich a recipe's matchedDeals with per-meal/per-serving savings data.
 * Returns a new recipe object with savings attached to each matchedDeal.
 */
function enrichMatchedDealsWithSavings(recipe, matchedDeals) {
  const ingLines = (recipe.allIngredients || recipe.ingredients || [])
    .map(i => (typeof i === 'string' ? i : (i.raw || i.name || '')).toLowerCase());

  const enriched = matchedDeals.map(deal => {
    // Find ingredient line that mentions this deal's matched ingredient
    const matchingLine = ingLines.find(l => l.includes(deal.ingredient)) || deal.ingredient;
    const savings      = calculateMealSavings(deal, matchingLine, recipe);
    return { ...deal, savings };
  });

  // Total per-serving saving across all matched deals (using mealSaving, not totalProductSaving)
  const totalMealSaving       = +enriched.reduce((s, d) => s + (d.savings?.mealSaving       || 0), 0).toFixed(2);
  const totalPerServingSaving = +enriched.reduce((s, d) => s + (d.savings?.perServingSaving  || 0), 0).toFixed(2);

  return {
    ...recipe,
    matchedDeals:       enriched,
    totalMealSaving,
    totalPerServingSaving,
  };
}

module.exports = {
  parseQuantity,
  parseDealSize,
  calculateMealSavings,
  enrichMatchedDealsWithSavings,
};
