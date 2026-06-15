/**
 * pantryMatcher.js
 *
 * Matches a user's pantry ingredients against the weekly deal-matched recipes.
 * Uses enriched ingredient tags where available, falls back to text matching.
 * Shows deal info from the weekly matches on missing ingredients.
 *
 * All matching is local — no AI or DB calls for recipes.
 */

const dealService = require('./dealService');
const { validateMatch } = require('./matchingValidator');

// ── Constants ─────────────────────────────────────────────────────────────────

const MIN_COVERAGE = 0.4;
const MAX_RESULTS  = 20;

const PANTRY_STAPLES = new Set([
  'salt', 'pepper', 'black pepper', 'white pepper', 'cracked pepper',
  'olive oil', 'vegetable oil', 'cooking oil', 'canola oil', 'oil',
  'sugar', 'brown sugar', 'white sugar', 'caster sugar',
  'flour', 'plain flour', 'all purpose flour', 'all-purpose flour', 'self raising flour',
  'butter', 'water', 'baking powder', 'baking soda', 'bicarbonate of soda',
  'vinegar', 'soy sauce',
]);

// Proteins where "chicken" should match "chicken breast", etc.
const PROTEIN_ALIASES = {
  chicken:  ['chicken breast', 'chicken thigh', 'chicken thighs', 'chicken drumstick', 'chicken drumsticks', 'chicken leg', 'chicken legs', 'chicken wing', 'chicken wings', 'chicken fillet', 'whole chicken', 'rotisserie chicken'],
  beef:     ['beef mince', 'minced beef', 'ground beef', 'beef steak', 'beef rump', 'beef chuck', 'beef brisket', 'beef fillet', 'beef tenderloin', 'eye fillet'],
  lamb:     ['lamb chop', 'lamb chops', 'lamb cutlet', 'lamb cutlets', 'lamb mince', 'lamb leg', 'lamb shoulder', 'lamb shank', 'lamb shanks'],
  pork:     ['pork belly', 'pork mince', 'pork chop', 'pork chops', 'pork fillet', 'pork tenderloin', 'pork loin', 'bacon', 'ham'],
  seafood:  ['prawns', 'shrimp', 'squid', 'octopus', 'crab', 'lobster', 'scallops', 'mussels', 'clams', 'oysters'],
  fish:     ['salmon', 'tuna', 'cod', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'dory', 'fish fillet', 'fish fillets'],
};

// ── Text normalisation ────────────────────────────────────────────────────────

function normalise(str) {
  return (str || '')
    .toLowerCase()
    .replace(/\(.*?\)/g, '')       // remove parentheticals
    .replace(/\d+(\.\d+)?\s*(g|kg|ml|l|oz|lb|cup|tbsp|tsp|bunch|clove|cloves|can|cans|tin|tins|slice|slices|piece|pieces|sprig|sprigs)\b/gi, '')
    .replace(/[^a-z\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

// Singular/plural normalisation
function stem(word) {
  if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
  if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
  if (word.endsWith('es') && word.length > 4) return word.slice(0, -2);
  if (word.endsWith('s') && word.length > 3) return word.slice(0, -1);
  return word;
}

function normWords(str) {
  return normalise(str).split(' ').filter(Boolean).map(stem);
}

// ── Core matching logic ───────────────────────────────────────────────────────

/**
 * Returns true if userIngredient matches recipeIngredient.
 * Handles protein generalization and basic text overlap.
 * Avoids false positives like "tomato" → "tomato sauce".
 */
function ingredientMatches(userRaw, recipeIng) {
  const userNorm  = normalise(userRaw);
  const recipeNorm = normalise(recipeIng.name || recipeIng.raw || '');

  if (!userNorm || !recipeNorm) return false;

  // Exact match
  if (userNorm === recipeNorm) return true;

  // Protein alias matching (e.g. "chicken" → "chicken breast")
  for (const [base, aliases] of Object.entries(PROTEIN_ALIASES)) {
    if (userNorm === base || userNorm.startsWith(base + ' ')) {
      if (recipeNorm === base || aliases.some(a => recipeNorm === a || recipeNorm.startsWith(a))) {
        // Don't match processed forms (e.g. nuggets, sausages)
        const form = recipeIng.ingredientTags?.form;
        if (form === 'processed') return false;
        return true;
      }
    }
  }

  // Word overlap matching:
  // All significant user words must appear in the recipe ingredient, AND
  // the recipe ingredient must not have critical extra words (e.g. "sauce", "paste", "powder").
  const userWords   = normWords(userRaw);
  const recipeWords = normWords(recipeIng.name || recipeIng.raw || '');

  if (userWords.length === 0 || recipeWords.length === 0) return false;

  // Stop-words that indicate a DIFFERENT ingredient if present in recipe but not in user
  const DISQUALIFIERS = new Set(['sauce', 'paste', 'powder', 'flake', 'flakes', 'extract', 'essence', 'stock', 'broth', 'nugget', 'nuggets', 'sausage', 'sausages', 'crumb', 'crumbs', 'crumbed', 'battered', 'smoked']);

  // Extra recipe words not in user words
  const extraRecipeWords = recipeWords.filter(w => !userWords.includes(w));
  if (extraRecipeWords.some(w => DISQUALIFIERS.has(w))) return false;

  // All user words must be in recipe words
  if (!userWords.every(w => recipeWords.includes(w))) return false;

  // Phase 1: validate category/form using enriched ingredient tags
  if (recipeIng.ingredientTags) {
    const v = validateMatch(recipeIng.ingredientTags, userRaw, null);
    if (!v.valid) return false;
  }

  return true;
}

/**
 * Returns true if an ingredient is a pantry staple.
 */
function isStaple(ing) {
  const norm = normalise(ing.name || ing.raw || '');
  if (PANTRY_STAPLES.has(norm)) return true;
  // Also check individual words
  const words = norm.split(' ');
  return words.length <= 2 && words.some(w => PANTRY_STAPLES.has(w));
}

/**
 * Given a recipe and the user's pantry, compute coverage and missing ingredients.
 */
function matchRecipe(recipe, userIngredients, hasPantryStaples) {
  const allIngredients = (recipe.ingredients || []).filter(ing => {
    if (ing.isSubheading) return false;
    if (ing.isActive === false) return false;
    const tags = ing.ingredientTags || {};
    if (tags.essential === false) return false;
    return true;
  });

  if (allIngredients.length === 0) return null;

  // Exclude staples from required list if user has pantry staples
  const required = hasPantryStaples
    ? allIngredients.filter(ing => !isStaple(ing))
    : allIngredients;

  // Substance guard: a real cookable recipe has ≥3 non-staple ingredients.
  // Drops roundup/listicle/how-to pages ("Rice recipes…") and garnish-only
  // entries that otherwise hit 100% coverage off one ingredient.
  if (required.length < 3) return null;

  const matched = [];
  const missing = [];

  for (const ing of required) {
    const isMatched = userIngredients.some(userIng => ingredientMatches(userIng, ing));
    if (isMatched) {
      matched.push(ing);
    } else {
      missing.push(ing);
    }
  }

  const coverage = matched.length / required.length;
  return { coverage, matchedIngredients: matched, missingIngredients: missing };
}

/**
 * Finds the best deal for a given ingredient name from the deals cache.
 */
function findDealForIngredient(ingName, allDeals) {
  const ingNorm = normalise(ingName);
  const ingWords = normWords(ingName);

  const candidates = allDeals.filter(deal => {
    const dealNorm = normalise(deal.name || '');
    const dealWords = normWords(deal.name || '');
    // At least half of ingredient words must match deal words
    const matchCount = ingWords.filter(w => dealWords.includes(w)).length;
    return matchCount >= Math.ceil(ingWords.length * 0.6);
  });

  if (candidates.length === 0) return null;

  // Pick cheapest
  return candidates.reduce((best, d) => {
    const price = parseFloat(d.price) || Infinity;
    const bestPrice = parseFloat(best.price) || Infinity;
    return price < bestPrice ? d : best;
  });
}

// ── Main export ───────────────────────────────────────────────────────────────

/**
 * Match a user's pantry against the FULL recipe library — a true "what can I
 * make right now" tool (not just this week's deal recipes). Missing ingredients
 * are enriched with current deals, but only after ranking + slicing to the top
 * results, so deal lookup stays cheap regardless of library size.
 *
 * @param {string[]} userIngredients - Array of ingredient name strings
 * @param {boolean}  hasPantryStaples - Whether user has common pantry staples
 * @param {object}   [opts] - { state } for store-correct deal enrichment
 * @returns {Promise<Array>} Ranked list of matched recipes
 */
async function matchPantry(userIngredients, hasPantryStaples = true, opts = {}) {
  const recipeMatcher = require('./recipeMatcher');
  const library = recipeMatcher.loadLibrary();

  if (!library || library.length === 0) return [];

  // 1. Match every library recipe (local, no AI). Library recipes already carry
  //    structured ingredients with ingredientTags, so the form/category guard
  //    in ingredientMatches actually runs here.
  let results = [];
  for (const recipe of library) {
    const match = matchRecipe(recipe, userIngredients, hasPantryStaples);
    if (!match || match.coverage < MIN_COVERAGE) continue;
    results.push({ recipe, match });
  }

  // 2. Rank, then slice to the top results BEFORE the expensive deal lookup.
  results.sort((a, b) => {
    if (b.match.coverage !== a.match.coverage) return b.match.coverage - a.match.coverage;
    // prefer fewer missing items, then more total ingredients (more substantial)
    if (a.match.missingIngredients.length !== b.match.missingIngredients.length) {
      return a.match.missingIngredients.length - b.match.missingIngredients.length;
    }
    return (b.match.matchedIngredients.length) - (a.match.matchedIngredients.length);
  });
  results = results.slice(0, MAX_RESULTS);

  // 3. Load current (state-correct) deals and enrich the top results only.
  let allDeals = [];
  try {
    const cache = await dealService.getDealsByState(opts.state || 'nsw');
    allDeals = Array.isArray(cache) ? cache : [];
  } catch {
    // Non-fatal — just won't show deals on missing ingredients
  }

  return results.map(({ recipe, match }) => {
    let totalCostToComplete = 0;
    let totalSavings = 0;

    const missingWithDeals = match.missingIngredients.map(ing => {
      const ingName = ing.name || (ing.raw || '').replace(/^\d[\d\s/]*[a-z]*\s*/i, '');
      const deal = findDealForIngredient(ingName, allDeals);
      if (deal) {
        const price    = parseFloat(deal.price) || 0;
        const wasPrice = parseFloat(deal.originalPrice ?? deal.wasPrice) || 0;
        totalCostToComplete += price;
        if (wasPrice > price) totalSavings += wasPrice - price;
        // normalise field name for the frontend (it reads deal.wasPrice)
        return { ...ing, deal: { ...deal, wasPrice: wasPrice || undefined } };
      }
      return ing;
    });

    return {
      recipe: {
        id:        recipe.id,
        source_id: recipe.source_id ?? recipe.id,
        title:     recipe.title,
        image:     recipe.image,
        url:       recipe.url,
        totalTime: recipe.totalTime,
      },
      coverage:            match.coverage,
      matchedIngredients:  match.matchedIngredients,
      missingIngredients:  missingWithDeals,
      totalCostToComplete: Math.round(totalCostToComplete * 100) / 100,
      totalSavings:        Math.round(totalSavings * 100) / 100,
    };
  });
}

module.exports = { matchPantry };
