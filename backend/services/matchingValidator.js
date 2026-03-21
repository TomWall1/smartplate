/**
 * matchingValidator.js  —  Phase 1 & 3
 *
 * Validates ingredient-to-product matches using enriched ingredient tags.
 * Provides category/form validation and confidence scoring used by both
 * recipeMatcher.js and pantryMatcher.js.
 *
 * Key fix: prevents condiment/pantry ingredients (e.g. "chicken stock cube")
 * from matching fresh-protein products (e.g. "Chicken Breast Fillets").
 */

// ── Ingredient category → compatible product categories ──────────────────────
// allowed: null = no restriction.  blocked is always checked first.
const CATEGORY_COMPAT = {
  meat:             { blocked: [],                          allowed: ['meat'] },
  seafood:          { blocked: [],                          allowed: ['seafood'] },
  dairy:            { blocked: ['meat', 'seafood'],         allowed: ['dairy', 'eggs'] },
  eggs:             { blocked: ['meat', 'seafood'],         allowed: ['eggs', 'dairy'] },
  vegetables:       { blocked: ['meat', 'seafood'],         allowed: ['vegetables', 'produce', 'frozen'] },
  fruit:            { blocked: ['meat', 'seafood', 'dairy'],allowed: ['fruit', 'produce'] },
  grains:           { blocked: ['meat', 'seafood'],         allowed: ['grains', 'pantry', 'baked_goods', 'bakery'] },
  legumes:          { blocked: ['meat', 'seafood'],         allowed: ['legumes', 'pantry', 'canned_preserved'] },
  nuts_seeds:       { blocked: ['meat', 'seafood'],         allowed: ['nuts_seeds', 'pantry'] },
  herbs_spices:     { blocked: ['meat', 'seafood'],         allowed: ['herbs_spices', 'condiments', 'pantry'] },
  condiments:       { blocked: ['meat', 'seafood'],         allowed: ['condiments', 'pantry', 'canned_preserved'] },
  oils_fats:        { blocked: ['meat', 'seafood'],         allowed: ['oils_fats', 'condiments', 'pantry'] },
  baked_goods:      { blocked: ['meat', 'seafood'],         allowed: ['baked_goods', 'bakery'] },
  canned_preserved: { blocked: ['meat', 'seafood'],         allowed: ['canned_preserved', 'pantry'] },
  frozen:           { blocked: [],                          allowed: ['frozen'] },
  other:            { blocked: [],                          allowed: null },
};

// ── Form → keywords that should NOT appear in a matched product name ──────────
const FORM_BLOCKED_KEYWORDS = {
  pantry:    ['fresh', 'breast', 'fillet', 'thigh', 'leg', 'wing', 'rspca', 'free range', 'whole chicken'],
  dried:     ['fresh', 'breast', 'fillet', 'thigh', 'leg', 'wing', 'rspca', 'free range'],
  processed: ['fresh', 'breast', 'fillet', 'thigh', 'leg', 'wing', 'rspca', 'free range', 'whole chicken'],
  canned:    ['fresh', 'breast', 'fillet', 'thigh', 'leg', 'wing', 'rspca', 'free range'],
  fresh:     ['cube', 'powder', 'paste', 'stock', 'broth', 'bouillon', 'canned', 'tinned', 'dried'],
  frozen:    [],
};

// ── Rule-based product categorisation ────────────────────────────────────────
// Applied to product name when productIntelligence.category is unavailable.
const PRODUCT_CATEGORY_RULES = [
  // Condiments/pantry first (before meat, to catch "chicken stock" correctly)
  { re: /\b(stock|broth|cube|bouillon)\b/i,                         cat: 'condiments' },
  { re: /\b(sauce|paste|marinade|dressing|gravy|relish|chutney)\b/i, cat: 'condiments' },
  { re: /\b(oil|vinegar)\b/i,                                        cat: 'oils_fats' },
  { re: /\b(salt|pepper|spice|seasoning|herb|cumin|paprika|oregano|thyme|rosemary|basil|parsley|chilli|turmeric|cinnamon|cardamom)\b/i, cat: 'herbs_spices' },
  // Meat
  { re: /\b(chicken|beef|lamb|pork|turkey|duck|veal|rabbit|kangaroo)\b/i, cat: 'meat' },
  { re: /\b(mince|steak|schnitzel|sausage|bacon|ham|salami|chorizo|prosciutto|pancetta|chipolata)\b/i, cat: 'meat' },
  { re: /\b(breast|thigh|drumstick|wing|cutlet|chop|roast|brisket|rump|loin|shank)\b/i, cat: 'meat' },
  // Seafood
  { re: /\b(salmon|tuna|cod|barramundi|snapper|bream|whiting|flathead|dory|trout|kingfish|mackerel|sardine)\b/i, cat: 'seafood' },
  { re: /\b(prawn|shrimp|lobster|crab|mussel|oyster|scallop|squid|calamari|octopus)\b/i, cat: 'seafood' },
  // Dairy
  { re: /\b(milk|cheese|butter|yoghurt|yogurt|cream|ricotta|feta|parmesan|mozzarella|brie|cheddar|haloumi|halloumi)\b/i, cat: 'dairy' },
  // Eggs
  { re: /\begg(s)?\b/i,                                             cat: 'eggs' },
  // Vegetables
  { re: /\b(broccoli|cauliflower|spinach|kale|capsicum|mushroom|carrot|zucchini|pumpkin|asparagus|beetroot|cucumber|lettuce|cabbage)\b/i, cat: 'vegetables' },
  // Fruit
  { re: /\b(apple|banana|orange|lemon|lime|berry|mango|strawberry|pineapple|melon|grape|peach|pear|cherry|apricot|avocado)\b/i, cat: 'fruit' },
  // Grains
  { re: /\b(rice|pasta|noodle|flour|oat|cereal|quinoa|couscous|barley|wheat)\b/i, cat: 'grains' },
  // Canned
  { re: /\b(canned|tinned)\b/i,                                     cat: 'canned_preserved' },
  // Frozen
  { re: /^frozen\b/i,                                               cat: 'frozen' },
  // Baked goods
  { re: /\b(bread|roll|bun|muffin|bagel|wrap|tortilla|croissant|pita|naan|crumpet|scone|focaccia)\b/i, cat: 'baked_goods' },
];

/**
 * Categorise a product by its name using rule-based matching.
 * Returns the first matching category, or 'other'.
 */
function categoriseProduct(productName) {
  const name = (productName || '').toLowerCase();
  for (const { re, cat } of PRODUCT_CATEGORY_RULES) {
    if (re.test(name)) return cat;
  }
  return 'other';
}

/**
 * Validate an ingredient-to-product match using enriched ingredient tags.
 *
 * @param {object|null} ingredientTags  - ingredient.ingredientTags (may be null/undefined)
 * @param {string}      productName     - normalised product/deal name
 * @param {string|null} productCategory - product category from PI (may be null)
 * @returns {{ valid: boolean, confidence: number, reason: string }}
 */
function validateMatch(ingredientTags, productName, productCategory) {
  if (!ingredientTags) return { valid: true, confidence: 50, reason: 'no tags' };

  const ingCategory = ingredientTags.category;
  const ingForm     = ingredientTags.form;
  const productNameLower = (productName || '').toLowerCase();

  // Determine effective product category
  const effectiveCategory = productCategory || categoriseProduct(productName);

  let confidence = 50;
  const reasons  = [];
  let   invalid  = false;

  // ── Category validation ──────────────────────────────────────────────────
  if (ingCategory && CATEGORY_COMPAT[ingCategory]) {
    const { blocked, allowed } = CATEGORY_COMPAT[ingCategory];

    if (blocked.includes(effectiveCategory)) {
      confidence -= 60;
      reasons.push(`category blocked: ing="${ingCategory}" prod="${effectiveCategory}"`);
      invalid = true;
    } else if (allowed === null) {
      confidence += 10;
    } else if (allowed.includes(effectiveCategory)) {
      confidence += 30;
      reasons.push(`category match: "${ingCategory}"→"${effectiveCategory}"`);
    }
    // else neutral — not confirmed but not blocked
  }

  // ── Form validation ──────────────────────────────────────────────────────
  if (ingForm && FORM_BLOCKED_KEYWORDS[ingForm]) {
    const blocked = FORM_BLOCKED_KEYWORDS[ingForm];
    const hit = blocked.find(w => productNameLower.includes(w));
    if (hit) {
      confidence -= 40;
      reasons.push(`form blocked: ing form="${ingForm}" product has "${hit}"`);
      invalid = true;
    } else {
      confidence += 10;
    }
  }

  // ── Protein type bonus ───────────────────────────────────────────────────
  if (ingredientTags.proteinType && productNameLower.includes(ingredientTags.proteinType)) {
    confidence += 15;
    reasons.push(`protein match: "${ingredientTags.proteinType}"`);
  }

  confidence = Math.max(0, Math.min(100, confidence));

  return {
    valid: !invalid,
    confidence,
    reason: reasons.join('; ') || 'text match',
  };
}

/**
 * Score a complete ingredient-deal match and return a confidence label.
 *
 * @param {object}  ingredient   - recipe ingredient with ingredientTags
 * @param {object}  deal         - deal with productIntelligence
 * @param {boolean} textMatched  - whether text matching succeeded
 * @returns {{ valid: boolean, confidence: number, label: string }}
 */
function scoreMatch(ingredient, deal, textMatched = true) {
  const tags       = ingredient?.ingredientTags;
  const piCategory = deal?.productIntelligence?.category || deal?.productCategory || null;
  const dealName   = deal?.name || deal?.dealName || '';

  const v = validateMatch(tags, dealName, piCategory);
  const confidence = Math.min(100, v.confidence + (textMatched ? 20 : 0));

  const label = confidence >= 90 ? 'Excellent' :
                confidence >= 70 ? 'Good'      :
                confidence >= 60 ? 'Possible'  : 'Poor';

  return { valid: v.valid, confidence, label, reason: v.reason };
}

// ── Confidence threshold ─────────────────────────────────────────────────────
// Matches scoring below this are filtered out as unreliable.
const MIN_CONFIDENCE = 50;

/**
 * Check whether a confidence score meets the minimum threshold.
 * @param {number} confidence - Score from validateMatch (0-100)
 */
function isAboveThreshold(confidence) {
  return confidence >= MIN_CONFIDENCE;
}

module.exports = { validateMatch, scoreMatch, categoriseProduct, MIN_CONFIDENCE, isAboveThreshold };
