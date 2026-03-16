/**
 * pantryMatcher.js
 *
 * Matches a user's pantry ingredients against the recipe database.
 * Uses enriched ingredient tags where available, falls back to text matching.
 * Attaches current deal info to missing ingredients.
 *
 * All matching is DB-driven — no AI calls.
 */

const { Pool } = require('pg');
const dealService = require('./dealService');
const { validateMatch } = require('./matchingValidator');

const usePG = process.env.USE_POSTGRESQL === 'true' || process.env.NODE_ENV === 'production';

let pool;
function getPool() {
  if (!pool && usePG && process.env.DATABASE_URL) {
    pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  }
  return pool;
}

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

  if (required.length === 0) {
    // Everything is a staple — 100% covered
    return {
      coverage: 1,
      matchedIngredients: [],
      missingIngredients: [],
    };
  }

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
 * Match user pantry against all recipes in the database (PostgreSQL) or
 * fallback to JSON files (local dev).
 *
 * @param {string[]} userIngredients - Array of ingredient name strings
 * @param {boolean}  hasPantryStaples - Whether user has common pantry staples
 * @returns {Promise<Array>} Ranked list of matched recipes
 */
async function matchPantry(userIngredients, hasPantryStaples = true) {
  // Load all active recipes
  let recipes = [];

  const pg = getPool();
  if (pg) {
    const { rows } = await pg.query(
      `SELECT id, source, title, description, url, image, prep_time, cook_time, total_time, servings, category, cuisine, ingredients, metadata
       FROM recipes
       WHERE is_active IS NOT FALSE
       ORDER BY id`
    );
    recipes = rows.map(r => ({
      id:          r.id,
      source:      r.source,
      title:       r.title,
      description: r.description,
      url:         r.url,
      image:       r.image,
      prepTime:    r.prep_time,
      cookTime:    r.cook_time,
      totalTime:   r.total_time,
      servings:    r.servings,
      category:    r.category,
      cuisine:     r.cuisine,
      ingredients: r.ingredients,
      metadata:    r.metadata,
    }));
  } else {
    // Local dev: load from JSON files
    const fs   = require('fs');
    const path = require('path');
    const DATA_DIR = path.join(__dirname, '..', 'data');
    const sources = ['recipe-library-enriched.json', 'jamie-oliver-recipes-enriched.json'];
    for (const src of sources) {
      const fp = path.join(DATA_DIR, src);
      if (fs.existsSync(fp)) {
        const data = JSON.parse(fs.readFileSync(fp, 'utf8'));
        if (Array.isArray(data.recipes)) recipes.push(...data.recipes);
      }
    }
  }

  if (recipes.length === 0) {
    return [];
  }

  // Load current deals for missing-ingredient enrichment
  let allDeals = [];
  try {
    const cache = await dealService.getCurrentDeals();
    allDeals = Array.isArray(cache) ? cache : [];
  } catch {
    // Non-fatal — just won't show deals on missing ingredients
  }

  // Match each recipe
  const results = [];

  for (const recipe of recipes) {
    const match = matchRecipe(recipe, userIngredients, hasPantryStaples);
    if (!match || match.coverage < MIN_COVERAGE) continue;

    // Enrich missing ingredients with deal info
    let totalCostToComplete = 0;
    let totalSavings = 0;

    const missingWithDeals = match.missingIngredients.map(ing => {
      const ingName = ing.name || (ing.raw || '').replace(/^\d[\d\s\/]*[a-z]*\s*/i, '');
      const deal = findDealForIngredient(ingName, allDeals);
      if (deal) {
        const price   = parseFloat(deal.price)    || 0;
        const wasPrice = parseFloat(deal.wasPrice) || 0;
        totalCostToComplete += price;
        if (wasPrice > price) totalSavings += wasPrice - price;
        return { ...ing, deal };
      }
      return ing;
    });

    results.push({
      recipe,
      coverage:            match.coverage,
      matchedIngredients:  match.matchedIngredients,
      missingIngredients:  missingWithDeals,
      totalCostToComplete: Math.round(totalCostToComplete * 100) / 100,
      totalSavings:        Math.round(totalSavings * 100) / 100,
    });
  }

  // Sort: coverage desc, deals on missing desc, cost asc
  results.sort((a, b) => {
    if (b.coverage !== a.coverage) return b.coverage - a.coverage;
    const aDeals = a.missingIngredients.filter(i => i.deal).length;
    const bDeals = b.missingIngredients.filter(i => i.deal).length;
    if (bDeals !== aDeals) return bDeals - aDeals;
    return a.totalCostToComplete - b.totalCostToComplete;
  });

  return results.slice(0, MAX_RESULTS);
}

module.exports = { matchPantry };
