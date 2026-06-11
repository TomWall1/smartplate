/**
 * config/matching.js
 * All tuning data for deal-to-recipe matching: scoring weights, diversity
 * settings, recipe library locations, food/non-food keyword lists,
 * compound blocklists and form disqualifiers.
 *
 * This file is pure data + comments. The matching algorithm that consumes it
 * lives in services/recipeMatcher.js.
 */

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

// ── Diversity tuning ──────────────────────────────────────────────────────────
// Decay factor for repeated anchor ingredients: score × 1/(1 + DECAY × count).
// At count=1 → 0.71×, count=2 → 0.56×, count=5 → 0.33×.
const DIVERSITY_DECAY = 0.4;

// Minimum recipes per protein bucket guaranteed in results (if matches exist).
const MIN_PER_BUCKET = 3;

// Maps primaryProtein values (from enriched recipe data) → broad buckets.
const PROTEIN_BUCKETS = {
  chicken: 'poultry', turkey: 'poultry', duck: 'poultry', poultry: 'poultry',
  beef: 'red-meat', lamb: 'red-meat', pork: 'red-meat', veal: 'red-meat',
  fish: 'seafood', prawns: 'seafood', salmon: 'seafood', tuna: 'seafood',
  shrimp: 'seafood', crab: 'seafood', squid: 'seafood', mussels: 'seafood',
  seafood: 'seafood',
};

// Each entry: prefer enriched file, fall back to original
const LIBRARIES = [
  { src: path.join(__dirname, '..', 'data', 'recipe-library.json'),        enriched: path.join(__dirname, '..', 'data', 'recipe-library-enriched.json'),        source: 'recipetineats' },
  { src: path.join(__dirname, '..', 'data', 'jamie-oliver-recipes.json'),  enriched: path.join(__dirname, '..', 'data', 'jamie-oliver-recipes-enriched.json'),  source: 'jamieoliver'   },
  { src: path.join(__dirname, '..', 'data', 'donna-hay-recipes.json'),     enriched: path.join(__dirname, '..', 'data', 'donna-hay-recipes-enriched.json'),     source: 'donnahay'      },
  { src: path.join(__dirname, '..', 'data', 'womensweekly-recipes.json'),  enriched: path.join(__dirname, '..', 'data', 'womensweekly-recipes-enriched.json'),  source: 'womensweekly'  },
  { src: path.join(__dirname, '..', 'data', 'juliegoodwin-recipes.json'),  enriched: path.join(__dirname, '..', 'data', 'juliegoodwin-recipes-enriched.json'),  source: 'juliegoodwin'  },
];

// Brand/marketing/size stripping now lives in lib/normalize.js (shared with
// productLookup so enrichment and matching normalize identically).

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
  cream: ['ice cream', 'ice-cream', 'moisturising cream', 'body cream', 'hand cream', 'face cream', 'sour cream and onion'],
  butter: ['peanut butter', 'nut butter', 'almond butter', 'cashew butter', 'body butter'],
  milk: ['oat milk', 'almond milk', 'soy milk', 'coconut milk', 'skim milk', 'rice milk', 'body milk'],
  coconut: ['coconut water'],
  corn: ['corn chip', 'corn chips', 'popcorn'],
  honey: ['honey soy', 'honey mustard'],
  lemon: ['lemon pepper', 'lemon myrtle'],
  garlic: ['garlic bread', 'garlic knot'],
  onion: ['onion ring', 'onion rings', 'french onion dip'],
};

// Protein cut/form words — if a recipe ingredient contains one of these, the deal
// must ALSO contain that cut in its satisfiesIngredients or deal name.
// Prevents "lamb shoulder" from matching "Lamb Midloin Chops".
const PROTEIN_CUT_WORDS = new Set([
  'shoulder', 'midloin', 'loin', 'fillet', 'filet', 'rump', 'rack',
  'chop', 'cutlet', 'shank', 'brisket', 'chuck', 'blade', 'flank',
  'sirloin', 'tenderloin', 'scotch', 'striploin', 'knuckle', 'backstrap',
  'leg', 'breast', 'thigh', 'drumstick', 'wing',
]);

// Specific cheese variety names — if a recipe ingredient specifies one of these,
// a generic "cheese" deal is not an acceptable substitute.
// Prevents "feta cheese" from matching "Devondale Cheese Block".
const SPECIFIC_CHEESE_TYPES = new Set([
  'feta', 'parmesan', 'parmigiano', 'mozzarella', 'brie', 'camembert',
  'ricotta', 'gouda', 'edam', 'gruyere', 'emmental', 'manchego',
  'haloumi', 'halloumi', 'pecorino', 'gorgonzola', 'stilton', 'roquefort',
  'burrata', 'raclette', 'provolone', 'colby', 'jarlsberg',
]);

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
  // Cheese: prevent block/fresh cheese ingredients matching processed cheese snack products
  cheese: [
    'spread', 'dip', 'snack', 'cracker', 'string', 'twists',
    'chip', 'crisp', 'flavoured', 'flavored', 'sauce',
  ],
  // Potato: prevent fresh potato matching processed potato products
  potato: [
    'chip', 'crisp', 'wedge', 'gem', 'frozen meal', 'hash brown',
    'mash', 'instant', 'flake', 'snack',
  ],
  // Tomato: prevent fresh tomato matching processed tomato products (except paste/sauce which have their own compound logic)
  tomato: [
    'chip', 'crisp', 'snack', 'juice', 'drink',
  ],
  // Fruit entries: prevent fresh fruit matching processed fruit products
  apple: [
    'juice', 'cider', 'chip', 'crisp', 'snack', 'sauce',
    'dried', 'leather', 'bar', 'jam',
  ],
  banana: [
    'chip', 'dried', 'bread', 'snack', 'bar', 'smoothie',
  ],
  strawberry: [
    'jam', 'juice', 'dried', 'snack', 'bar', 'ice cream',
    'flavoured', 'flavored', 'yoghurt', 'yogurt',
  ],
  orange: [
    'juice', 'drink', 'cordial', 'marmalade', 'flavoured', 'flavored',
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

module.exports = {
  USE_PRODUCT_INTELLIGENCE,
  CATEGORY_WEIGHTS,
  DIVERSITY_DECAY,
  MIN_PER_BUCKET,
  PROTEIN_BUCKETS,
  LIBRARIES,
  FOOD_KEYWORDS,
  NON_FOOD_INDICATORS,
  COMPOUND_NON_FOOD_PHRASES,
  BLOCKED_CATEGORIES,
  COMPOUND_BLOCKLIST,
  PROTEIN_CUT_WORDS,
  SPECIFIC_CHEESE_TYPES,
  FORM_DISQUALIFIERS,
  PROTEIN_KEYWORDS,
  PROTEIN_COMPOUND_DISQUALIFIERS,
  STOP_WORDS,
};
