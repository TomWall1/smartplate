const fs = require('fs');
const path = require('path');

// ── Feature flag ──────────────────────────────────────────────────────────────
// Set to false to revert to pure text-based matching (useful for A/B comparison).
const USE_PRODUCT_INTELLIGENCE = true;

// ── Weighted scoring — maps product category → importance weight ──────────────
// Protein on special → recipe is much more valuable than garnish on special.
const CATEGORY_WEIGHTS = {
  meat:             10,
  seafood:          10,
  deli:              8,
  dairy:             3,
  eggs:              3,
  vegetables:        5,
  fruit:             5,
  legumes:           2,
  frozen:            2,
  grains:            1,
  canned_preserved:  1,
  baked_goods:       1,
  nuts_seeds:        1,
  oils_fats:         0.5,
  condiments:        0.5,
  sauces:            0.5,
  snacks:            0.5,
  beverages:         0.5,
  herbs_spices:      0.1,
  other:             1,
};

const LIBRARY_PATH    = path.join(__dirname, '..', 'data', 'recipe-library.json');
const JO_LIBRARY_PATH = path.join(__dirname, '..', 'data', 'jamie-oliver-recipes.json');
const DH_LIBRARY_PATH = path.join(__dirname, '..', 'data', 'donna-hay-recipes.json');

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
  // Skincare / moisturising
  'moisturising', 'moisturizing', 'moisturiser', 'moisturizer',
  'serum', 'toner', 'exfoliant', 'concealer', 'foundation', 'mascara', 'lipstick',
  'skincare', 'haircare', 'lip balm', 'hand wash', 'face wash',
  'body wash', 'baby wash',
  // Sun / SPF
  'sunscreen', 'sunscream', 'spf',
  // Baby / infant
  'nappy', 'nappies', 'diaper', 'wipes', 'formula', 'teething', 'dummy', 'rash cream',
  // Hair
  'shampoo', 'conditioner', 'hair dye', 'hair colour',
  // Deodorant / personal care
  'deodorant', 'antiperspirant', 'razor', 'shaving', 'tampon', 'sanitary pad',
  // Cleaning / household
  'laundry', 'detergent', 'dishwash', 'bleach', 'disinfectant', 'softener',
  'cleaning', 'spray cleaner', 'bin liner', 'garbage bag',
  // Pharmacy / health
  'toothpaste', 'mouthwash', 'vitamins', 'supplement', 'capsule', 'tablet',
  'bandage', 'paracetamol', 'ibuprofen',
  // Lotion / general
  'lotion',
  // Pet
  'pet food', 'dog food', 'cat food', 'bird seed', 'cat litter', 'kibble',
  'flea treatment', 'wormer',
  // Alcohol — already filtered at category level in salefinder but may sneak through
  // "Specials" or unmapped categories. Note: 'rum' omitted (false positive: rump steak),
  // 'gin' omitted (false positive: ginger), 'cider' omitted (false positive: apple cider vinegar).
  'beer', 'lager', 'wine', 'spirits', 'whiskey', 'whisky',
  'vodka', 'champagne', 'prosecco', 'tequila', 'brandy',
];

// Compound phrases to block regardless of other matching logic.
// Catches deals where a food word appears alongside a non-food modifier —
// e.g. "baby cream" incidentally matches recipe ingredient "cream".
const COMPOUND_NON_FOOD_PHRASES = [
  // Cream products (personal care / cosmetic)
  'baby cream', 'face cream', 'body cream', 'hand cream', 'night cream', 'eye cream',
  // Oil products (personal care / aromatherapy)
  'baby oil', 'body oil', 'massage oil', 'essential oil',
  // Milk products (non-dairy drinks / baby)
  'baby milk', 'body milk', 'chocolate milk',
  // Confectionery masquerading as cooking ingredients
  'peanut butter cup',
  // Supplement forms of food items
  'fish oil capsule', 'fish oil supplement', 'fish oil tablet',
  // Seasoning products whose name contains a protein word
  'chicken salt',
  // Flavoured snack products
  'cream cheese flavoured', 'cream cheese flavor',
  'sour cream dip', 'sour cream chip',
];

// App-level categories (set by salefinder.js mapCategory) that should never
// contribute deals to recipe matching, regardless of the deal name.
const BLOCKED_CATEGORIES = new Set([
  'Baby',
  'Health & Beauty',
  'Household',
  'Pet',
  'Liquor',
  'Vitamins & Supplements',
  'Personal Care',
  'Cleaning',
]);

// Ingredient words that must NOT match deals where that word appears inside a different
// compound food name. Keyed by the ingredient word, value is a list of deal substrings
// that disqualify the match.
// e.g. "cream" in a recipe means cooking cream; it should not match "ice cream" products.
const COMPOUND_BLOCKLIST = {
  cream: ['ice cream', 'ice-cream'],
  butter: ['peanut butter', 'nut butter', 'almond butter'],
  milk: ['oat milk', 'almond milk', 'soy milk', 'coconut milk', 'skim milk', 'rice milk'],
};

// Form disqualifiers — protein keyword → product descriptors that indicate the deal
// is pre-prepared/processed and should NOT match a recipe requiring fresh protein.
//
// Matching rules (applied in _hasFormDisqualifier):
//   • Single-word terms use whole-word regex (\b) to avoid "strip" blocking "striploin".
//   • Multi-word phrases (containing a space) use substring match — they're specific enough.
//   • Form upgrade: if the recipe ingredient itself names the same descriptor, the deal IS
//     allowed through. e.g. ingredient "chicken schnitzel" may match a schnitzel deal.
const FORM_DISQUALIFIERS = {
  chicken: [
    'crumbed', 'nugget', 'tender', 'strip', 'schnitzel', 'kiev', 'stuffed',
    'marinated', 'pre-seasoned', 'ready to cook', 'frozen meal',
    'roast', 'rotisserie', 'canned', 'tinned', 'processed', 'deli',
    'smoked', 'chargrilled', 'skewer', 'wing', 'drumstick',
  ],
  beef: [
    'burger', 'patty', 'meatball', 'sausage', 'hotdog', 'frank',
    'canned', 'tinned', 'corned', 'jerky', 'biltong', 'deli', 'smoked',
    'pastrami', 'salami', 'pepperoni', 'pre-made', 'frozen meal',
    'ready to cook', 'marinated', 'pre-seasoned',
  ],
  pork: [
    'bacon', 'ham', 'salami', 'pepperoni', 'chorizo', 'prosciutto', 'pancetta',
    'sausage', 'hotdog', 'frank', 'canned', 'tinned', 'deli', 'smoked',
    'pulled', 'crackling', 'marinated', 'pre-seasoned', 'frozen meal',
  ],
  lamb: [
    'sausage', 'deli', 'marinated', 'pre-seasoned', 'frozen meal',
    'ready to cook', 'canned', 'tinned',
  ],
  salmon: [
    'smoked', 'canned', 'tinned', 'flavoured', 'flavored', 'marinated',
    'pre-seasoned', 'frozen meal', 'crumbed', 'sashimi', 'gravlax', 'dip',
  ],
  fish: [
    'crumbed', 'battered', 'frozen meal', 'fish finger', 'fish cake',
    'fish pie', 'canned', 'tinned', 'smoked', 'dip', 'paste',
  ],
  prawn: [
    'cooked', 'marinated', 'flavoured', 'flavored', 'frozen meal',
    'prawn toast', 'prawn cracker', 'paste',
  ],
  tuna: ['canned', 'tinned', 'flavoured', 'flavored', 'marinated', 'dip', 'paste', 'smoked'],
  mince: [
    'sausage', 'burger', 'patty', 'meatball', 'pre-seasoned', 'marinated',
    'frozen meal', 'ready to cook',
  ],
};

// Core protein keywords — a recipe must have at least one matched deal whose
// recipe ingredient is one of these proteins (whole-word match, not substring).
const PROTEIN_KEYWORDS = [
  'chicken', 'beef', 'lamb', 'pork', 'mince', 'sausage', 'steak',
  'salmon', 'fish', 'prawn', 'shrimp', 'seafood', 'tuna', 'turkey', 'duck', 'veal',
  'bacon', 'ham', 'bream', 'barramundi', 'snapper', 'trout', 'cod',
  'schnitzel', 'rump', 'fillet', 'drumstick', 'wing', 'breast', 'thigh',
];

// If a matched ingredient contains a protein keyword BUT ALSO one of these words,
// it is a condiment or pantry item — NOT a qualifying protein.
// e.g. "fish sauce" has "fish" but "sauce" disqualifies it.
// e.g. "chicken stock" has "chicken" but "stock" disqualifies it.
const PROTEIN_COMPOUND_DISQUALIFIERS = new Set([
  'sauce', 'stock', 'broth', 'gravy', 'powder', 'seasoning',
  'flavour', 'flavor', 'flavoured', 'flavored', 'paste', 'extract',
  'marinade', 'dressing', 'soup', 'base', 'concentrate',
  'oil', 'butter', 'spread', 'rub',
]);

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
   * Load recipe library from both source files and merge into a single array.
   * Each recipe gets a `source` field ('recipetineats' or 'jamieoliver') so
   * we can tell them apart. IDs are reassigned globally after merging.
   */
  loadLibrary() {
    if (this.library) return this.library;

    const allRecipes = [];

    // ── RecipeTinEats library ──────────────────────────────────────────────
    try {
      const data = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
      const rte  = (data.recipes || []).map(r => ({ ...r, source: r.source || 'recipetineats' }));
      allRecipes.push(...rte);
      console.log(`RecipeMatcher: Loaded ${rte.length} recipes from RecipeTinEats library`);
    } catch (err) {
      console.warn(`RecipeMatcher: Could not load RecipeTinEats library: ${err.message}`);
    }

    // ── Jamie Oliver library (optional — skip if file not generated yet) ────
    try {
      const data = JSON.parse(fs.readFileSync(JO_LIBRARY_PATH, 'utf8'));
      const jo   = (data.recipes || []).map(r => ({ ...r, source: 'jamieoliver' }));
      allRecipes.push(...jo);
      console.log(`RecipeMatcher: Loaded ${jo.length} recipes from Jamie Oliver library`);
    } catch {
      // File doesn't exist yet — silently skip
    }

    // ── Donna Hay library (optional — skip if file not generated yet) ────────
    try {
      const data = JSON.parse(fs.readFileSync(DH_LIBRARY_PATH, 'utf8'));
      const dh   = (data.recipes || []).map(r => ({ ...r, source: 'donnahay' }));
      allRecipes.push(...dh);
      console.log(`RecipeMatcher: Loaded ${dh.length} recipes from Donna Hay library`);
    } catch {
      // File doesn't exist yet — silently skip
    }

    // Reassign sequential IDs across the merged library
    this.library = allRecipes.map((r, i) => ({ ...r, id: i + 1 }));
    console.log(`RecipeMatcher: Combined library: ${this.library.length} recipes`);
    return this.library;
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
   * Check if a deal looks like a food product.
   * @param {string} dealKeywords - Normalised deal name
   * @param {string} [category]   - Mapped app category (e.g. 'Baby', 'Dairy')
   */
  _isFoodDeal(dealKeywords, category) {
    // 1. Hard-block by category
    if (category && BLOCKED_CATEGORIES.has(category)) return false;

    const lower = dealKeywords.toLowerCase();

    // 2. Compound phrase block (food word + non-food modifier)
    if (COMPOUND_NON_FOOD_PHRASES.some(phrase => lower.includes(phrase))) return false;

    // 3. Individual non-food indicator block
    if (NON_FOOD_INDICATORS.some(kw => lower.includes(kw))) return false;

    // 4. Must contain at least one recognisable food keyword
    return FOOD_KEYWORDS.some(kw => lower.includes(kw));
  }

  /**
   * Check whether a deal is disqualified by form for a given protein.
   *
   * Returns true  → deal should be REJECTED for this protein.
   * Returns false → no disqualifying form found; match is fine.
   *
   * Form upgrade: if the recipe ingredient itself names the disqualifying form
   * (e.g. ingredient = "chicken schnitzel" and dq = "schnitzel"), the match is
   * allowed through because the recipe explicitly calls for that prepared form.
   *
   * @param {string} proteinKey - Key into FORM_DISQUALIFIERS (e.g. 'chicken')
   * @param {string} dealStr    - Lowercased normalised deal keyword string
   * @param {string} ingStr     - Lowercased cleaned ingredient string
   */
  _hasFormDisqualifier(proteinKey, dealStr, ingStr) {
    const disqualifiers = FORM_DISQUALIFIERS[proteinKey];
    if (!disqualifiers) return false;

    // Pre-singularise deal and ingredient words once for efficient lookup.
    // Word-level comparison naturally prevents "strip" from matching "striploin"
    // (they are different tokens) and handles plurals ("nuggets" → "nugget").
    const dealWords = new Set(dealStr.split(/\s+/).map(w => this._singularise(w)));
    const ingWords  = new Set(ingStr.split(/\s+/).map(w => this._singularise(w)));

    for (const dq of disqualifiers) {
      const isPhrase = dq.includes(' ');
      let foundInDeal, foundInIng;

      if (isPhrase) {
        // Multi-word phrases: substring match on the full string (specific enough).
        foundInDeal = dealStr.includes(dq);
        foundInIng  = ingStr.includes(dq);
      } else {
        // Single words: compare against the singularised word sets.
        const dqSingular = this._singularise(dq);
        foundInDeal = dealWords.has(dqSingular);
        foundInIng  = ingWords.has(dqSingular);
      }

      if (foundInDeal && !foundInIng) {
        return true; // disqualified — wrong form for this recipe
      }
    }
    return false;
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

  // ── Product intelligence matching ──────────────────────────────────────────

  /**
   * Match a recipe ingredient against an enriched deal using product intelligence.
   *
   * Returns:
   *   true  — PI confirms a match
   *   false — PI confirms NO match (skip text fallback for this pair)
   *   null  — No PI data available; caller should fall back to text matching
   */
  _ingredientMatchesDeal(ingredientName, enrichedDeal) {
    const pi = enrichedDeal.productIntelligence;
    if (!pi?.satisfiesIngredients?.length) return null; // signal: use text fallback

    const cleanIng = this._cleanIngredientName(ingredientName);
    if (cleanIng.length < 2) return false;

    const ingWords  = cleanIng.split(/\s+/).filter(w => w.length >= 3 && !STOP_WORDS.has(w));
    if (ingWords.length === 0) return false;

    const satisfies = pi.satisfiesIngredients.map(s => s.toLowerCase().trim());

    // If the ingredient is a compound with a disqualifying context word (sauce, stock,
    // oil, butter, paste, etc.) require a full exact phrase match.
    // Prevents "fish" (in satisfies for salmon) matching recipe ingredient "fish sauce".
    const hasDisqualifier = ingWords.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w));

    if (hasDisqualifier) {
      // Only exact full-phrase match qualifies
      return satisfies.includes(cleanIng);
    }

    // Rule 1: Exact match on full cleaned ingredient name
    if (satisfies.includes(cleanIng)) return true;

    // Rule 2: Any satisfies entry appears as a whole-word substring of the ingredient
    //   "chicken" in satisfies → matches ingredient "diced chicken breast"
    for (const sat of satisfies) {
      if (sat.length >= 3 && cleanIng.includes(sat)) return true;
    }

    // Rule 3: Any significant ingredient word exactly in satisfies
    //   ingredient "chicken" → word "chicken" in satisfies ["chicken breast","chicken","poultry"]
    for (const w of ingWords) {
      if (satisfies.includes(w)) return true;
    }

    return false;
  }

  /**
   * Return the importance weight for a matched deal.
   * Uses product intelligence category when available; falls back to text detection.
   */
  _getIngredientWeight(matchedDeal) {
    const piCategory = matchedDeal.productCategory;
    if (piCategory && CATEGORY_WEIGHTS[piCategory] !== undefined) {
      return CATEGORY_WEIGHTS[piCategory];
    }

    // Text-based fallback: detect weight from recipe ingredient name
    const ing = (matchedDeal.ingredient || '').toLowerCase();
    const ingWords = ing.split(/\s+/).map(w => this._singularise(w));

    if (PROTEIN_KEYWORDS.some(p => ingWords.includes(p))) {
      // Compound disqualifiers (fish sauce, chicken stock, etc.) → condiment weight
      if (ingWords.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w))) return CATEGORY_WEIGHTS.condiments;
      return CATEGORY_WEIGHTS.meat;
    }

    const dairyWords = ['milk', 'cheese', 'butter', 'cream', 'yoghurt', 'yogurt', 'egg'];
    if (dairyWords.some(d => ing.includes(d))) return CATEGORY_WEIGHTS.dairy;

    const veggieWords = ['broccoli', 'carrot', 'spinach', 'onion', 'potato', 'tomato', 'capsicum',
      'zucchini', 'pumpkin', 'mushroom', 'lettuce', 'cabbage', 'cauliflower'];
    if (veggieWords.some(v => ing.includes(v))) return CATEGORY_WEIGHTS.vegetables;

    const oilWords = ['oil', 'sauce', 'vinegar', 'soy', 'stock', 'paste'];
    if (oilWords.some(o => ing.includes(o))) return CATEGORY_WEIGHTS.condiments;

    const spiceWords = ['garlic', 'ginger', 'herb', 'spice', 'pepper', 'salt', 'chilli', 'cumin',
      'paprika', 'oregano', 'basil', 'thyme', 'lemon', 'lime'];
    if (spiceWords.some(s => ing.includes(s))) return CATEGORY_WEIGHTS.herbs_spices;

    return CATEGORY_WEIGHTS.other;
  }

  /**
   * Weighted recipe score: sum of (ingredient_weight × saving_amount) for each matched deal.
   * A protein deal on special is worth 10× more than a garnish deal on special.
   */
  _calculateRecipeScore(recipe) {
    let score = 0;
    for (const deal of recipe.matchedDeals) {
      const weight  = this._getIngredientWeight(deal);
      const saving  = deal.saving || 0;
      // Add weight even if saving is $0 so recipes with protein deals rank above those without
      score += weight * (1 + saving);
    }
    return score;
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

    // Form disqualifier check — reject deals that are processed/pre-prepared versions
    // of a protein even when the protein keyword itself matches.
    // e.g. ingredient "chicken" must NOT match "frozen crumbed chicken tenders".
    // Form upgrade: if the ingredient explicitly names the same prepared form
    // (e.g. "chicken schnitzel"), the match is allowed through.
    for (const iw of ingWords) {
      const iwSingular = this._singularise(iw);
      if (FORM_DISQUALIFIERS[iwSingular] && this._hasFormDisqualifier(iwSingular, deal, ing)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Match deals against the recipe library.
   * Returns top 50 recipes ranked by weighted score.
   *
   * Deal matching uses two tiers:
   *   1. Product intelligence (satisfiesIngredients) — precise, avoids false positives
   *   2. Text-based matching (_termsMatch) — fallback when PI unavailable
   *
   * Scoring weights protein deals (10×) over garnish deals (0.1×) so that
   * recipes featuring on-special main proteins rank first.
   *
   * @param {Array} deals - Deal objects; enriched deals include a `productIntelligence` field
   * @returns {Array} Top 50 matched recipes with matchedDeals, matchScore, totalSaving, weightedScore
   */
  matchDeals(deals) {
    const recipes = this.loadLibrary();
    if (recipes.length === 0) return [];

    // Normalise all deal names upfront and filter to food deals only.
    // The spread preserves productIntelligence if present on the original deal.
    const normalisedDeals = deals
      .map(deal => ({
        ...deal,
        keywords: this.normalizeDealName(deal.name),
      }))
      .filter(deal => deal.keywords && this._isFoodDeal(deal.keywords, deal.category));

    const piCount   = normalisedDeals.filter(d => d.productIntelligence?.satisfiesIngredients?.length > 0).length;
    const textCount = normalisedDeals.length - piCount;
    console.log(
      `RecipeMatcher: ${normalisedDeals.length} food deals ` +
      `(${piCount} with product intelligence, ${textCount} text-only) of ${deals.length} total`
    );

    const scored = recipes.map(recipe => {
      const rawMatches = [];
      const seenPairs  = new Set(); // avoid same ingredient+deal pair twice

      for (const deal of normalisedDeals) {
        for (const ingredient of recipe.ingredients) {
          const cleanName = this._cleanIngredientName(ingredient.name);
          if (cleanName.length < 3) continue;

          // Unique key distinguishes PI and text paths for the same deal
          const pathKey = deal.productIntelligence ? 'pi' : 'txt';
          const pairKey = `${cleanName}:${pathKey}:${deal.keywords || deal.name}`;
          if (seenPairs.has(pairKey)) continue;

          let matched = false;

          // ── Tier 1: Product Intelligence matching ────────────────────────
          if (USE_PRODUCT_INTELLIGENCE && deal.productIntelligence?.satisfiesIngredients?.length > 0) {
            const piResult = this._ingredientMatchesDeal(ingredient.name, deal);
            if (piResult === true) {
              matched = true;
            } else if (piResult === false) {
              // PI explicitly rejects this pair — skip text fallback
              seenPairs.add(pairKey);
              continue;
            }
            // piResult === null → no usable PI data, fall through to text matching
          }

          // ── Tier 2: Text-based matching (fallback) ───────────────────────
          if (!matched && deal.keywords) {
            matched = this._termsMatch(ingredient.name, deal.keywords);
          }

          if (matched) {
            rawMatches.push({
              dealName:            deal.name,
              ingredient:          cleanName,
              price:               deal.price               ?? null,
              originalPrice:       deal.originalPrice       ?? null,
              discountPercentage:  deal.discountPercentage  ?? null,
              saving: (deal.originalPrice && deal.price)
                ? +(deal.originalPrice - deal.price).toFixed(2)
                : null,
              store:              deal.store               ?? null,
              productCategory:    deal.productIntelligence?.category ?? null,
              productIntelligence: deal.productIntelligence ?? null,
            });
            seenPairs.add(pairKey);
            break; // One match per deal per recipe
          }
        }
      }

      // Deduplicate by ingredient — keep the best saving per ingredient.
      const bestByIngredient = new Map();
      for (const md of rawMatches) {
        const existing = bestByIngredient.get(md.ingredient);
        if (!existing || (md.saving || 0) > (existing.saving || 0)) {
          bestByIngredient.set(md.ingredient, md);
        }
      }
      const matchedDeals = Array.from(bestByIngredient.values());
      const totalSaving  = matchedDeals.reduce((sum, d) => sum + (d.saving || 0), 0);

      return {
        ...recipe,
        matchedDeals,
        matchScore:    matchedDeals.length,
        totalSaving:   +totalSaving.toFixed(2),
      };
    });

    // Primary sort: weighted score (protein deals > garnish deals)
    // Secondary: match count, then raw saving
    scored.sort((a, b) => {
      const sa = this._calculateRecipeScore(a);
      const sb = this._calculateRecipeScore(b);
      return sb - sa || b.matchScore - a.matchScore || b.totalSaving - a.totalSaving;
    });

    return scored
      .filter(r => r.matchScore > 0 && this._hasProteinMatch(r))
      .map(r => ({ ...r, weightedScore: +this._calculateRecipeScore(r).toFixed(2) }))
      .slice(0, 50);
  }

  /**
   * Returns true if the recipe has at least one matched deal where the RECIPE
   * INGREDIENT ITSELF is a core protein — not a condiment or pantry item.
   *
   * Rules (all checked against deal.ingredient, never deal.dealName):
   *  1. Whole-word match: "fish" must be the word "fish", not a substring of
   *     "fishcake" or "starfish". Uses singularised word comparison.
   *  2. Compound disqualifier: if the ingredient also contains a word from
   *     PROTEIN_COMPOUND_DISQUALIFIERS (sauce, stock, oil, etc.) it is a
   *     condiment/pantry item and cannot qualify the recipe.
   *     e.g. "fish sauce" → disqualified; "chicken stock" → disqualified;
   *          "olive oil"  → no protein anyway, skipped earlier.
   *  3. Only ingredients with >=2 chars are considered.
   */
  _hasProteinMatch(recipe) {
    for (const deal of recipe.matchedDeals) {
      // ── Fast path: product intelligence category ─────────────────────────
      if (deal.productCategory === 'meat' || deal.productCategory === 'seafood') {
        console.log(`  [protein-filter] PASS "${deal.ingredient}" via PI category "${deal.productCategory}" (${deal.store || 'unknown store'})`);
        return true;
      }

      // ── Text-based path ──────────────────────────────────────────────────
      const ing = deal.ingredient.toLowerCase().trim();
      if (ing.length < 2) continue;

      const words = ing.split(/\s+/).map(w => this._singularise(w));

      const proteinWord = PROTEIN_KEYWORDS.find(p => words.includes(p));
      if (!proteinWord) continue;

      if (words.some(w => PROTEIN_COMPOUND_DISQUALIFIERS.has(w))) {
        console.log(`  [protein-filter] SKIP "${ing}" — "${proteinWord}" present but compound disqualifier found`);
        continue;
      }

      console.log(`  [protein-filter] PASS "${deal.ingredient}" via protein "${proteinWord}" (${deal.store || 'unknown store'})`);
      return true;
    }
    return false;
  }
}

module.exports = new RecipeMatcher();
