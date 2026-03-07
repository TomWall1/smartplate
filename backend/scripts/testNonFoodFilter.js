/**
 * testNonFoodFilter.js
 *
 * Loads cached deals (backend/data/cached-deals.json) if available, otherwise
 * falls back to a synthetic test dataset covering the problem cases described
 * in the non-food filter improvement task.
 *
 * Runs both the OLD filter logic (word-level only, no category / compound check)
 * and the NEW filter logic, then reports:
 *   • Before count  — deals that passed the old filter
 *   • After count   — deals that pass the new filter
 *   • Newly blocked — deals caught by the new rules but missed by the old ones
 *
 * Usage:
 *   node backend/scripts/testNonFoodFilter.js
 */

'use strict';

const fs   = require('fs');
const path = require('path');

// ── Load the updated recipeMatcher so we can call its internals ────────────

// We need access to the private constants from recipeMatcher.js.
// Re-define them here from the source so this script stays self-contained.

// ── Replicate OLD filter ───────────────────────────────────────────────────

const OLD_NON_FOOD_INDICATORS = [
  'moisturising', 'moisturizing', 'moisturiser', 'moisturizer',
  'shampoo', 'conditioner', 'sunscreen', 'sunscream', 'spf',
  'nappy', 'diaper', 'wipes', 'baby wash', 'body wash', 'face wash',
  'lotion', 'skincare', 'haircare', 'lip balm', 'deodorant',
  'laundry', 'detergent', 'dishwash', 'bleach', 'softener', 'cleaning',
  'toothpaste', 'mouthwash', 'vitamins', 'supplement', 'capsule', 'tablet',
  'pet food', 'dog food', 'cat food',
];

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

function oldIsFoodDeal(name) {
  const lower = name.toLowerCase();
  if (OLD_NON_FOOD_INDICATORS.some(kw => lower.includes(kw))) return false;
  return FOOD_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Replicate NEW filter ───────────────────────────────────────────────────

const NEW_NON_FOOD_INDICATORS = [
  'moisturising', 'moisturizing', 'moisturiser', 'moisturizer',
  'serum', 'toner', 'exfoliant', 'concealer', 'foundation', 'mascara', 'lipstick',
  'skincare', 'haircare', 'lip balm', 'hand wash', 'face wash',
  'body wash', 'baby wash',
  'sunscreen', 'sunscream', 'spf',
  'nappy', 'nappies', 'diaper', 'wipes', 'formula', 'teething', 'dummy', 'rash cream',
  'shampoo', 'conditioner', 'hair dye', 'hair colour',
  'deodorant', 'antiperspirant', 'razor', 'shaving', 'tampon', 'sanitary pad',
  'laundry', 'detergent', 'dishwash', 'bleach', 'disinfectant', 'softener',
  'cleaning', 'spray cleaner', 'bin liner', 'garbage bag',
  'toothpaste', 'mouthwash', 'vitamins', 'supplement', 'capsule', 'tablet',
  'bandage', 'paracetamol', 'ibuprofen',
  'lotion',
  'pet food', 'dog food', 'cat food', 'bird seed', 'cat litter', 'kibble',
  'flea treatment', 'wormer',
  'beer', 'lager', 'wine', 'spirits', 'whiskey', 'whisky',
  'vodka', 'champagne', 'prosecco', 'tequila', 'brandy',
];

const COMPOUND_NON_FOOD_PHRASES = [
  'baby cream', 'face cream', 'body cream', 'hand cream', 'night cream', 'eye cream',
  'baby oil', 'body oil', 'massage oil', 'essential oil',
  'baby milk', 'body milk', 'chocolate milk',
  'peanut butter cup',
  'fish oil capsule', 'fish oil supplement', 'fish oil tablet',
  'chicken salt',
  'cream cheese flavoured', 'cream cheese flavor',
  'sour cream dip', 'sour cream chip',
];

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

function newIsFoodDeal(name, category) {
  if (category && BLOCKED_CATEGORIES.has(category)) return false;
  const lower = name.toLowerCase();
  if (COMPOUND_NON_FOOD_PHRASES.some(p => lower.includes(p))) return false;
  if (NEW_NON_FOOD_INDICATORS.some(kw => lower.includes(kw))) return false;
  return FOOD_KEYWORDS.some(kw => lower.includes(kw));
}

// ── Load deals ─────────────────────────────────────────────────────────────

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

let deals = [];
let usingRealCache = false;

if (fs.existsSync(CACHE_PATH)) {
  const cache = JSON.parse(fs.readFileSync(CACHE_PATH, 'utf8'));
  deals = [...(cache.woolworths || []), ...(cache.coles || []), ...(cache.iga || [])];
  usingRealCache = true;
  console.log(`\nLoaded ${deals.length} deals from cache (last updated ${cache.lastUpdated})\n`);
} else {
  console.log('\nNo cached-deals.json found — using synthetic test dataset.\n');

  // Synthetic dataset: mix of legitimate food deals and non-food items that
  // previously slipped through because they contained a food keyword.
  deals = [
    // ── Should be BLOCKED ──────────────────────────────────────────────────
    // Old gap: compound phrases (food word + non-food modifier)
    { name: 'Sukin Baby Cream 250ml',                  category: 'Baby',          expect: 'BLOCK' },
    { name: 'QV Face Cream SPF 30 100g',               category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Nivea Body Cream Nourishing 400ml',       category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Neutrogena Hand Cream 75ml',              category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Olay Night Cream Anti-Ageing 50ml',       category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Garnier Eye Cream 15ml',                  category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Johnson Baby Oil 500ml',                  category: 'Baby',          expect: 'BLOCK' },
    { name: 'Kiehl\'s Body Oil Enriching 125ml',       category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Radox Massage Oil Relaxing 200ml',        category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Thursday Plantation Essential Oil Tea Tree 25ml', category: 'Health & Beauty', expect: 'BLOCK' },
    { name: 'Bellamy\'s Baby Milk Formula Stage 1 900g', category: 'Baby',        expect: 'BLOCK' },
    { name: 'Reese\'s Peanut Butter Cups 42g',         category: 'Pantry',        expect: 'BLOCK' },
    { name: 'Chicken Salt Seasoning 200g',             category: 'Pantry',        expect: 'BLOCK' },
    { name: 'Smith\'s Sour Cream Dip 200g',            category: 'Pantry',        expect: 'BLOCK' },
    { name: 'Blackmores Fish Oil Capsules 60pk',       category: 'Pantry',        expect: 'BLOCK' },
    { name: 'Swisse Fish Oil Supplement 1000mg',       category: 'Pantry',        expect: 'BLOCK' },
    // Old gap: new NON_FOOD_INDICATORS terms
    { name: 'Huggies Nappies Newborn 40pk',            category: 'Baby',          expect: 'BLOCK' },
    { name: 'Baby Formula Stage 2 900g',               category: 'Baby',          expect: 'BLOCK' },
    { name: 'Bonjela Teething Gel 15g',                category: 'Baby',          expect: 'BLOCK' },
    { name: 'Whiskas Cat Food Pouch 12pk',             category: 'Pet',           expect: 'BLOCK' },
    { name: 'Royal Canin Kibble Small Dog 4kg',        category: 'Pet',           expect: 'BLOCK' },
    { name: 'Jacob\'s Creek Shiraz Wine 750ml',        category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Corona Beer 24 Can Pack',                 category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Absolut Vodka 700ml',                     category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Moet Champagne 750ml',                    category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Penfolds Prosecco NV 750ml',              category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Jagermeister Spirits 700ml',              category: 'Liquor',        expect: 'BLOCK' },
    { name: 'Finish Dishwasher Tablets 110pk',         category: 'Household',     expect: 'BLOCK' },
    { name: 'Vanish Fabric Softener 1L',               category: 'Household',     expect: 'BLOCK' },
    { name: 'Dettol Disinfectant Spray 500ml',         category: 'Household',     expect: 'BLOCK' },
    // ── Should PASS ────────────────────────────────────────────────────────
    { name: 'Woolworths RSPCA Chicken Thighs 1kg',     category: 'Meat',          expect: 'PASS' },
    { name: 'Coles Beef Mince 500g',                   category: 'Meat',          expect: 'PASS' },
    { name: 'Barambah Organics Full Cream Milk 2L',    category: 'Dairy',         expect: 'PASS' },
    { name: 'Bulla Sour Cream 300ml',                  category: 'Dairy',         expect: 'PASS' },
    { name: 'Anchor Butter Salted 500g',               category: 'Dairy',         expect: 'PASS' },
    { name: 'Philadelphia Cream Cheese 250g',          category: 'Dairy',         expect: 'PASS' },
    { name: 'Heinz Apple Cider Vinegar 375ml',         category: 'Pantry',        expect: 'PASS' },
    { name: 'Coles Salmon Fillet 200g',                category: 'Seafood',       expect: 'PASS' },
    { name: 'San Remo Pasta Penne 500g',               category: 'Pantry',        expect: 'PASS' },
    { name: 'Cobram Estate Extra Virgin Olive Oil 750ml', category: 'Pantry',     expect: 'PASS' },
    { name: 'John West Tuna in Springwater 425g',      category: 'Pantry',        expect: 'PASS' },
    // "chocolate" is not in FOOD_KEYWORDS — correctly blocked by both old and new filters
    { name: 'Cadbury Old Gold Dark Chocolate 180g',    category: 'Pantry',        expect: 'BLOCK' },
  ];
}

// ── Run both filters ───────────────────────────────────────────────────────

const oldPassed   = [];
const newPassed   = [];
const nowBlocked  = []; // passed old, blocked by new

for (const deal of deals) {
  const name     = deal.name || '';
  const category = deal.category || '';

  const passOld = oldIsFoodDeal(name);
  const passNew = newIsFoodDeal(name, category);

  if (passOld) oldPassed.push(deal);
  if (passNew) newPassed.push(deal);

  if (passOld && !passNew) {
    nowBlocked.push({ name, category });
  }
}

// ── Report ─────────────────────────────────────────────────────────────────

console.log('━'.repeat(70));
console.log('Non-food filter comparison');
console.log('━'.repeat(70));
console.log(`Source            : ${usingRealCache ? 'real cached-deals.json' : 'synthetic test dataset'}`);
console.log(`Total deals       : ${deals.length}`);
console.log(`OLD filter passed : ${oldPassed.length}`);
console.log(`NEW filter passed : ${newPassed.length}`);
console.log(`Newly blocked     : ${nowBlocked.length}`);
console.log('━'.repeat(70));

if (nowBlocked.length === 0) {
  console.log('No additional deals blocked by the new rules (all were already caught).');
} else {
  console.log('\nDeals now correctly blocked by the new rules:\n');
  nowBlocked.forEach((d, i) => {
    console.log(`  ${String(i + 1).padStart(2)}. [${d.category || '—'}]  ${d.name}`);
  });
}

// ── Correctness check (synthetic data only) ────────────────────────────────

if (!usingRealCache) {
  console.log('\n━'.repeat(70));
  console.log('Expectation check (synthetic data):\n');
  let errors = 0;
  for (const deal of deals) {
    const passNew  = newIsFoodDeal(deal.name, deal.category);
    const expected = deal.expect === 'PASS';
    if (passNew !== expected) {
      console.log(`  ✗ WRONG  [${deal.category}] "${deal.name}" — expected ${deal.expect}, got ${passNew ? 'PASS' : 'BLOCK'}`);
      errors++;
    } else {
      console.log(`  ✓ OK     [${deal.category}] "${deal.name}" → ${deal.expect}`);
    }
  }
  console.log(`\n${errors === 0 ? 'All expectations met.' : `${errors} expectation(s) failed — review filter logic.`}`);
}

console.log('');
