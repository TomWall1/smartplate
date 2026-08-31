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

// Recipes priced before the final ranking. Coverage decides who gets PRICED;
// price decides who gets SHOWN. The pool has to be wider than the result set
// or the money ranking is just a re-shuffle of the coverage ranking.
const PRICING_POOL = 80;

// Charged for a missing ingredient we could not price. Deliberately on the
// high side of a real grocery line.
//
// This number is the guard against the failure that matters here. Ranking
// takes the argmin over the whole pool, so it does not merely tolerate bad
// estimates — it SEEKS them, surfacing whichever recipes were costed most
// wrongly cheap. Anything we cannot price must therefore be assumed expensive;
// otherwise "we had no data" becomes indistinguishable from "it is free", and
// missing data wins every time.
const UNPRICED_ITEM_COST = 4.00;

// Below this, too little of the basket is priced for a dollar figure to mean
// anything, and the result is reported as unranked-by-cost rather than given a
// number we cannot stand behind.
const MIN_PRICED_RATIO = 0.5;

const DEFAULT_SERVINGS = 4;

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
 * make right now" tool (not just this week's deal recipes).
 *
 * RANKING. Results are ordered by what the shopper still has to SPEND, not by
 * how much of the recipe they happen to own.
 *
 * The old ranking was coverage — matched ÷ required — which is the wrong
 * objective for a feature whose whole promise is value. It structurally
 * favoured short, simple recipes (four ingredients, own three) over a real
 * dinner where you own six of nine and the lamb is half price, and it ignored
 * price and deals completely: deals were loaded only AFTER the top 20 had been
 * chosen, so the user's supermarket could not influence which recipes they saw.
 *
 * Ranking on cost-to-complete rather than on savings is deliberate. Savings
 * would mean subtracting an estimated value for what the user already owns,
 * and a ranking that subtracts an estimate selects for whichever estimate was
 * most wrongly generous. Pricing only what must be BOUGHT inverts that: the
 * items being priced are the ones sitting in this week's catalogue with real
 * prices attached, and to wrongly promote a recipe we would have to UNDER-price
 * something we have real data for. What the user owns enters as a count, never
 * as a dollar figure.
 *
 * @param {string[]} userIngredients  - Ingredient name strings
 * @param {boolean}  hasPantryStaples - Whether the user has common staples
 * @param {object}   [opts]           - { state, store }
 * @returns {Promise<Array>} Ranked recipes, cheapest-to-finish first
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

  // 2. Coverage decides who gets priced. This is a shortlist, not the answer —
  //    it exists because pricing every one of the 2,184 library recipes against
  //    the catalogue would be wasted work, not because coverage is the ranking.
  results.sort((a, b) => {
    if (b.match.coverage !== a.match.coverage) return b.match.coverage - a.match.coverage;
    if (a.match.missingIngredients.length !== b.match.missingIngredients.length) {
      return a.match.missingIngredients.length - b.match.missingIngredients.length;
    }
    return b.match.matchedIngredients.length - a.match.matchedIngredients.length;
  });
  results = results.slice(0, PRICING_POOL);

  // 3. Load current deals for the user's state, and narrow to their store when
  //    they have chosen one. Without the store filter the cheapest price for a
  //    missing item could come from a supermarket they are not shopping at,
  //    which makes the total unactionable.
  let allDeals = [];
  try {
    const cache = await dealService.getDealsByState(opts.state || 'nsw');
    allDeals = Array.isArray(cache) ? cache : [];
    if (opts.store) {
      const want = String(opts.store).toLowerCase();
      const scoped = allDeals.filter(d => (d.store || '').toLowerCase() === want);
      // Only narrow if the store actually has a catalogue this week; an empty
      // filter would silently price every recipe at zero deals.
      if (scoped.length > 0) allDeals = scoped;
    }
  } catch {
    // Non-fatal — everything still works, just with no prices attached.
  }

  // 4. Price the shortlist, then rank on money.
  const priced = results.map(({ recipe, match }) => {
    const servings = recipe.servings > 0 ? recipe.servings : DEFAULT_SERVINGS;

    let knownCost = 0;
    let savings   = 0;
    let pricedItems = 0;

    const missingWithDeals = match.missingIngredients.map(ing => {
      const ingName = ing.name || (ing.raw || '').replace(/^\d[\d\s/]*[a-z]*\s*/i, '');
      const deal = findDealForIngredient(ingName, allDeals);
      if (!deal) return ing;

      const price    = parseFloat(deal.price) || 0;
      const wasPrice = parseFloat(deal.originalPrice ?? deal.wasPrice) || 0;
      if (price > 0) { knownCost += price; pricedItems++; }
      if (wasPrice > price) savings += wasPrice - price;

      // normalise field name for the frontend (it reads deal.wasPrice)
      return { ...ing, deal: { ...deal, wasPrice: wasPrice || undefined } };
    });

    const missingCount   = match.missingIngredients.length;
    const unpricedCount  = missingCount - pricedItems;
    const pricedRatio    = missingCount === 0 ? 1 : pricedItems / missingCount;

    // Two figures, and the difference between them is the point.
    // - `floor` is only real prices: what we can prove, shown as "from $X".
    // - `ranking` charges every unpriced item, so a recipe can never rank
    //   better by being harder to price.
    const costFloor   = +knownCost.toFixed(2);
    // Ranked on the TOTAL basket, not per serve. Per serve is the honest unit
    // to read, but it is the wrong thing to sort on: servings counts in the
    // library range from 1 to 24 and are not reliable, so dividing by them
    // hands the top of the list to whatever claims to feed the most people.
    const costForRank = knownCost + unpricedCount * UNPRICED_ITEM_COST;

    return {
      recipe: {
        id:        recipe.id,
        source_id: recipe.source_id ?? recipe.id,
        title:     recipe.title,
        image:     recipe.image,
        url:       recipe.url,
        totalTime: recipe.totalTime,
        servings:  recipe.servings ?? null,
      },
      coverage:            match.coverage,
      matchedIngredients:  match.matchedIngredients,
      missingIngredients:  missingWithDeals,

      // What you still have to buy — the honest headline.
      missingCount,
      unpricedCount,
      // A floor, not a total, unless costIsComplete. Null when we priced
      // nothing at all: "$0.00" for a basket we could not price is the exact
      // lie this ranking exists to avoid, and it is the one a reader is least
      // likely to question.
      totalCostToComplete:    pricedItems > 0 ? costFloor : null,
      // Only ever emitted when every missing item carries a real price.
      // Otherwise the client shows "from $X", or just the count.
      costToCompletePerServe: unpricedCount === 0 && missingCount > 0
        ? +(costFloor / servings).toFixed(2)
        : null,
      costIsComplete:         missingCount > 0 && unpricedCount === 0,
      costConfidence:         missingCount === 0            ? 'complete'
                            : pricedItems === 0             ? 'unpriced'
                            : pricedRatio >= MIN_PRICED_RATIO ? 'measured'
                            :                                 'partial',

      totalSavings:           +savings.toFixed(2),
      _rankCost:              costForRank,
    };
  });

  priced.sort((a, b) => {
    // Cheapest basket to finish, with every unpriced item charged at the
    // pessimistic rate so missing data can never look like a bargain. When
    // nothing at all can be priced this degrades gracefully into "fewest
    // things to buy", which is the right answer with no price data.
    if (a._rankCost !== b._rankCost) return a._rankCost - b._rankCost;
    // Then fewer things to buy — one trip item beats three of the same value.
    if (a.missingCount !== b.missingCount) return a.missingCount - b.missingCount;
    // Then more of the recipe already in the cupboard.
    return b.coverage - a.coverage;
  });

  return priced.slice(0, MAX_RESULTS).map(({ _rankCost, ...rest }) => rest);
}

module.exports = { matchPantry };
