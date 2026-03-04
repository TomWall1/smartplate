const fs = require('fs');
const path = require('path');

const LIBRARY_PATH = path.join(__dirname, '..', 'data', 'recipe-library.json');

// Common brand/marketing terms to strip from deal names
const STRIP_PREFIXES = [
  'woolworths', 'coles', 'iga', 'aldi',
  'rspca approved', 'rspca', 'organic', 'free range', 'free-range',
  'grass fed', 'grass-fed', 'hormone free', 'australian',
  'fresh', 'premium', 'quality', 'value', 'homebrand', 'essentials',
  'selected varieties', 'selected', 'varieties',
];

// Weight/quantity patterns to strip
const WEIGHT_PATTERN = /\b\d+[\.\d]*\s*(g|kg|ml|l|pk|pack|ea|each|per|litre|liter|mm|cm)\b/gi;
const PACK_PATTERN = /\b\d+\s*pack\b/gi;
const SIZE_RANGE_PATTERN = /\b\d+[\u2011\u2012\u2013\u2014‑‒–—-]\d+\s*(g|kg|ml|l)\b/gi;

// Food-related keywords — deals must contain at least one to be considered
const FOOD_KEYWORDS = [
  'chicken', 'beef', 'lamb', 'pork', 'salmon', 'fish', 'prawn', 'shrimp',
  'mince', 'sausage', 'steak', 'fillet', 'chop', 'roast', 'thigh', 'breast',
  'drumstick', 'wing', 'bacon', 'ham', 'turkey', 'duck', 'veal', 'seafood',
  'egg', 'milk', 'cream', 'cheese', 'butter', 'yoghurt', 'yogurt',
  'bread', 'flour', 'pasta', 'noodle', 'rice', 'cereal', 'oat',
  'tomato', 'potato', 'onion', 'garlic', 'carrot', 'broccoli', 'spinach',
  'lettuce', 'capsicum', 'pepper', 'mushroom', 'corn', 'pea', 'bean',
  'lentil', 'chickpea', 'avocado', 'cucumber', 'zucchini', 'pumpkin',
  'sweet potato', 'celery', 'beetroot', 'cabbage', 'cauliflower', 'kale',
  'apple', 'banana', 'orange', 'lemon', 'lime', 'berry', 'mango',
  'oil', 'olive', 'vinegar', 'sauce', 'soy', 'stock', 'broth',
  'sugar', 'honey', 'maple', 'spice', 'herb', 'salt', 'pepper',
  'coconut', 'almond', 'cashew', 'peanut', 'walnut',
  'tofu', 'tempeh',
  'tuna', 'sardine', 'crab', 'mussel', 'oyster', 'squid', 'calamari',
];

// Non-food product indicators — if a deal name contains any of these, reject it
// even if it incidentally contains a food keyword (e.g. "QV Baby Moisturising Cream")
const NON_FOOD_INDICATORS = [
  'moisturising', 'moisturizing', 'moisturiser', 'moisturizer',
  'shampoo', 'conditioner', 'sunscreen', 'sunscream', 'spf',
  'nappy', 'diaper', 'wipes', 'baby wash', 'body wash', 'face wash',
  'lotion', 'skincare', 'haircare', 'lip balm', 'deodorant',
  'laundry', 'detergent', 'dishwash', 'bleach', 'softener', 'cleaning',
  'toothpaste', 'mouthwash', 'vitamins', 'supplement', 'capsule', 'tablet',
  'pet food', 'dog food', 'cat food',
];

// Ingredient words that must NOT match deals where that word appears inside a different
// compound food name. Keyed by the ingredient word, value is a list of deal substrings
// that disqualify the match.
// e.g. "cream" in a recipe means cooking cream; it should not match "ice cream" products.
const COMPOUND_BLOCKLIST = {
  cream: ['ice cream', 'ice-cream'],
  butter: ['peanut butter', 'nut butter', 'almond butter'],
  milk: ['oat milk', 'almond milk', 'soy milk', 'coconut milk', 'skim milk', 'rice milk'],
};

// Words to ignore during matching (too generic / cause false positives)
const STOP_WORDS = new Set([
  'the', 'and', 'for', 'with', 'from', 'can', 'jar', 'tin', 'box',
  'bag', 'bottle', 'pouch', 'frozen', 'chilled', 'dried', 'canned',
  'sliced', 'diced', 'chopped', 'whole', 'half', 'large', 'small',
  'medium', 'mini', 'extra', 'super', 'classic', 'original', 'plain',
  'natural', 'style', 'range', 'family', 'serve', 'serving', 'per',
  'new', 'old', 'big', 'little', 'more', 'less', 'just', 'also',
  'use', 'about', 'like', 'soft', 'hard', 'fine', 'thin', 'thick',
  // "water" is a cooking ingredient no-one buys on special; excluding prevents
  // matches like "water" → "Cocobella Coconut Water" or "Sparkling Water"
  'water',
]);

class RecipeMatcher {
  constructor() {
    this.library = null;
  }

  /**
   * Load recipe library from JSON file
   */
  loadLibrary() {
    if (this.library) return this.library;

    try {
      const data = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
      this.library = data.recipes || [];
      console.log(`RecipeMatcher: Loaded ${this.library.length} recipes from library`);
      return this.library;
    } catch (err) {
      console.warn(`RecipeMatcher: Could not load library: ${err.message}`);
      this.library = [];
      return this.library;
    }
  }

  /**
   * Clean an ingredient name from the scraped library
   */
  _cleanIngredientName(name) {
    if (!name) return '';
    let clean = name
      .replace(/\([^)]*\)/g, '')          // remove parentheticals
      .replace(/,.*$/, '')                 // remove everything after first comma
      .replace(/\s*[-–—]\s.*$/, '')        // remove " - description" suffixes
      .replace(/[^a-z\s]/gi, ' ')          // remove non-alpha chars
      .replace(/\b(or|and|for|of|the|with|to|in|a|an)\b/gi, ' ')  // remove conjunctions
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();
    return clean;
  }

  /**
   * Normalise a deal name to extract the core ingredient
   * e.g. "Woolworths RSPCA Chicken Thighs 1kg" → "chicken thighs"
   */
  normalizeDealName(name) {
    let normalised = name.toLowerCase().trim();

    // Strip brand/marketing prefixes
    for (const prefix of STRIP_PREFIXES) {
      normalised = normalised.replace(new RegExp(`\\b${prefix}\\b`, 'gi'), '');
    }

    // Strip weight/quantity/size patterns
    normalised = normalised.replace(WEIGHT_PATTERN, '');
    normalised = normalised.replace(PACK_PATTERN, '');
    normalised = normalised.replace(SIZE_RANGE_PATTERN, '');

    // Strip common suffixes
    normalised = normalised.replace(/\b(approx\.?|approximately|min\.?|minimum)\b/gi, '');

    // Clean up whitespace and punctuation
    normalised = normalised
      .replace(/[|•\-–—‑‒*]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    return normalised;
  }

  /**
   * Check if a deal name looks like a food product
   */
  _isFoodDeal(dealKeywords) {
    const lower = dealKeywords.toLowerCase();
    if (NON_FOOD_INDICATORS.some(kw => lower.includes(kw))) return false;
    return FOOD_KEYWORDS.some(kw => lower.includes(kw));
  }

  /**
   * Simple singularise: strip trailing "s" where appropriate
   */
  _singularise(word) {
    if (word.length <= 3) return word;
    if (word.endsWith('ies')) return word.slice(0, -3) + 'y';
    if (word.endsWith('ves')) return word.slice(0, -3) + 'f';
    if (word.endsWith('ses') || word.endsWith('xes') || word.endsWith('zes')) return word.slice(0, -2);
    if (word.endsWith('s') && !word.endsWith('ss') && !word.endsWith('us')) return word.slice(0, -1);
    return word;
  }

  /**
   * Check if an ingredient matches a deal keyword (strict matching)
   */
  _termsMatch(ingredientName, dealKeyword) {
    if (!ingredientName || !dealKeyword) return false;

    const ing = this._cleanIngredientName(ingredientName);
    const deal = dealKeyword.toLowerCase();

    // Skip very short or empty ingredient names
    if (ing.length < 3) return false;

    // Extract significant words (length >= 3, not stop words).
    // Using 3 (not 4) so short but meaningful ingredient words like
    // "soy", "oil", "pea", "egg" are included. Noise 3-letter words
    // ("can", "jar", "the", etc.) are already excluded by STOP_WORDS.
    const ingWords = ing.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    const dealWords = deal.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));

    if (ingWords.length === 0 || dealWords.length === 0) return false;

    // Pre-compute singularised deal words once
    const singularDealWords = dealWords.map(w => this._singularise(w));

    // Reject matches where the ingredient word appears inside a different compound food.
    // e.g. "cream" must not match "Bulla Ice Cream" — the deal is ice cream, not cream.
    for (const iw of ingWords) {
      const blockedPhrases = COMPOUND_BLOCKLIST[iw] || [];
      if (blockedPhrases.some(phrase => deal.includes(phrase))) return false;
    }

    // ALL significant ingredient words must appear in the deal name.
    // This prevents partial matches such as:
    //   "fish sauce"      → "pasta sauce"       (only "sauce" overlaps)
    //   "white pepper"    → "white chocolate"   (only "white" overlaps)
    //   "chicken stock"   → "Easter Egg with Chick" (substring "chick" inside "chicken")
    //   "thickened cream" → "Baby Moisturising Cream" (only "cream" overlaps)
    for (const iw of ingWords) {
      const iwSingular = this._singularise(iw);
      const foundInDeal = singularDealWords.some(dw => {
        if (dw === iwSingular) return true;
        // Substring match only for long words (>= 7 chars) to handle stemming edge cases
        if (dw.length >= 7 && iwSingular.length >= 7) {
          return dw.includes(iwSingular) || iwSingular.includes(dw);
        }
        return false;
      });
      if (!foundInDeal) return false;
    }

    return true;
  }

  /**
   * Match deals against the recipe library.
   * Returns top 20 recipes ranked by deal overlap score.
   *
   * @param {Array} deals - Array of deal objects with at least {name, price, originalPrice, store}
   * @returns {Array} Top 20 matched recipes with matchedDeals, matchScore, totalSaving
   */
  matchDeals(deals) {
    const recipes = this.loadLibrary();
    if (recipes.length === 0) return [];

    // Normalise all deal names upfront and filter to food deals only
    const normalisedDeals = deals
      .map(deal => ({
        ...deal,
        keywords: this.normalizeDealName(deal.name),
      }))
      .filter(deal => deal.keywords && this._isFoodDeal(deal.keywords));

    console.log(`RecipeMatcher: Matching against ${normalisedDeals.length} food deals (of ${deals.length} total)`);

    const scored = recipes.map(recipe => {
      const matchedDeals = [];
      const seenIngredients = new Set(); // avoid duplicate ingredient matches

      for (const deal of normalisedDeals) {
        for (const ingredient of recipe.ingredients) {
          const cleanName = this._cleanIngredientName(ingredient.name);
          if (cleanName.length < 3) continue;
          if (seenIngredients.has(cleanName + ':' + deal.keywords)) continue;

          if (this._termsMatch(ingredient.name, deal.keywords)) {
            matchedDeals.push({
              dealName: deal.name,
              ingredient: cleanName,
              price: deal.price || null,
              saving: (deal.originalPrice && deal.price)
                ? +(deal.originalPrice - deal.price).toFixed(2)
                : null,
              store: deal.store || null,
            });
            seenIngredients.add(cleanName + ':' + deal.keywords);
            break; // One match per deal per recipe is enough
          }
        }
      }

      const totalSaving = matchedDeals.reduce((sum, d) => sum + (d.saving || 0), 0);

      return {
        ...recipe,
        matchedDeals,
        matchScore: matchedDeals.length,
        totalSaving: +totalSaving.toFixed(2),
      };
    });

    // Sort by match score (desc), then total saving (desc)
    scored.sort((a, b) => b.matchScore - a.matchScore || b.totalSaving - a.totalSaving);

    // Return top 20 with at least 1 match
    return scored.filter(r => r.matchScore > 0).slice(0, 20);
  }
}

module.exports = new RecipeMatcher();
