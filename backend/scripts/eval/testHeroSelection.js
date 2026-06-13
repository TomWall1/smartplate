/**
 * Unit test for the hero-anchored selection (recipeMatcher.selectMenu /
 * _isDriverDeal). Pure in-memory — no DB, no Claude. Proves:
 *   1. pantry-only and catering-pack recipes are dropped
 *   2. protein heroes and strong-special centrepieces are kept
 *   3. round-robin keeps the menu varied (not 150 chicken dishes)
 *
 * Run: node scripts/eval/testHeroSelection.js
 */
const matcher = require('../../services/recipeMatcher');

let failures = 0;
const ok = (cond, msg) => { console.log(`${cond ? 'PASS' : 'FAIL'}  ${msg}`); if (!cond) failures++; };

const deal = (o) => ({
  dealName: o.dealName, ingredient: o.ingredient, productCategory: o.cat,
  price: o.price ?? null, originalPrice: o.orig ?? null,
  discountPercentage: o.pct ?? null,
  saving: (o.orig != null && o.price != null) ? +(o.orig - o.price).toFixed(2) : (o.save ?? null),
  store: o.store ?? 'woolworths',
});

// ── 1. _isDriverDeal classification ──────────────────────────────────────────
ok(matcher._isDriverDeal(deal({ dealName: 'Olive Oil 4L', ingredient: 'olive oil', cat: 'oils_fats', orig: 20, price: 15 })) === false,
  'olive oil (pantry, 4L) is NOT a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'SunRice White Rice 1kg', ingredient: 'rice', cat: 'grains', orig: 4, price: 2.5 })) === false,
  'rice (pantry) is NOT a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'Tasty Cheese Block 500g', ingredient: 'tasty cheese', cat: 'dairy', orig: 6, price: 5.5 })) === false,
  'cheese with weak discount is NOT a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'RSPCA Chicken Thigh Fillets 1kg', ingredient: 'chicken thigh', cat: 'meat', orig: 13, price: 9, pct: 30 })) === true,
  'discounted chicken thigh (1kg) IS a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'Beef Mince Bulk 5kg', ingredient: 'beef mince', cat: 'meat', orig: 50, price: 35, pct: 30 })) === false,
  'beef mince 5kg (catering pack) is NOT a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'Mushrooms 500g', ingredient: 'mushroom', cat: 'vegetables', orig: 8, price: 4, pct: 50 })) === true,
  'mushrooms at 50% off (strong centrepiece) IS a driver');
ok(matcher._isDriverDeal(deal({ dealName: 'Iceberg Lettuce', ingredient: 'lettuce', cat: 'vegetables', orig: 3, price: 2.7, pct: 10 })) === false,
  'lettuce at 10% off (weak side veg) is NOT a driver');

// ── 2 & 3. selectMenu gate + variety ─────────────────────────────────────────
const recipe = (title, protein, deals) => ({
  title, source: 'test', metadata: { primaryProtein: protein }, servings: 4,
  ingredients: [], matchedDeals: deals,
});

const candidates = [
  // pantry-only — must be dropped
  recipe('Homemade kebabs & flatbreads', 'lamb',
    [deal({ dealName: 'Olive Oil 4L', ingredient: 'olive oil', cat: 'oils_fats', orig: 20, price: 15 })]),
  recipe('Chicken & chorizo paella', 'chicken',
    [deal({ dealName: 'Paella Rice 1kg', ingredient: 'rice', cat: 'grains', orig: 5, price: 3 }),
     deal({ dealName: 'Olive Oil 4L', ingredient: 'olive oil', cat: 'oils_fats', orig: 20, price: 15 })]),
  // heroes — must be kept
  recipe('Salmon poke bowl', 'salmon',
    [deal({ dealName: 'Tasmanian Salmon Fillets 400g', ingredient: 'salmon', cat: 'seafood', orig: 14, price: 10, pct: 28 })]),
  recipe('Slow-cooked beef ragu', 'beef',
    [deal({ dealName: 'Beef Chuck 1kg', ingredient: 'beef', cat: 'meat', orig: 16, price: 11, pct: 30 })]),
  recipe('Mushroom risotto', null,
    [deal({ dealName: 'Mushrooms 500g', ingredient: 'mushroom', cat: 'vegetables', orig: 8, price: 4, pct: 50 })]),
];
// flood with 10 chicken recipes to test round-robin variety
for (let i = 1; i <= 10; i++) {
  candidates.push(recipe(`Chicken dish ${i}`, 'chicken',
    [deal({ dealName: 'Chicken Breast 1kg', ingredient: 'chicken breast', cat: 'meat', orig: 12, price: 8, pct: 33 })]));
}

const menu = matcher.selectMenu(candidates, 8);
const titles = menu.map(r => r.title);

ok(!titles.includes('Homemade kebabs & flatbreads'), 'kebabs (olive-oil-only) dropped from menu');
ok(!titles.includes('Chicken & chorizo paella'), 'paella (rice+oil only) dropped from menu');
ok(titles.includes('Salmon poke bowl'), 'salmon hero kept');
ok(titles.includes('Slow-cooked beef ragu'), 'beef hero kept');
ok(titles.includes('Mushroom risotto'), 'strong-special mushroom kept');

// Round-robin guarantee: variety LEADS the menu. With 4 distinct hero groups,
// the first 4 slots must each come from a different group (one chicken can't
// take slots 1-4) — remaining slots then fill from the deepest group, which is
// correct: you can't manufacture variety the candidate set doesn't contain.
const topGroups = new Set(menu.slice(0, 4).map(r => r.heroGroup));
ok(topGroups.size === 4, `top 4 slots span 4 distinct hero groups (got ${topGroups.size}: ${[...topGroups].join(', ')})`);
const chickenCount = titles.filter(t => t.startsWith('Chicken dish')).length;
ok(chickenCount <= 5, `chicken can't crowd out other heroes (got ${chickenCount}; cap = limit − other heroes = 5)`);

console.log('\nMenu order:', titles.join(' | '));
console.log(failures === 0 ? '\nALL PASSED' : `\n${failures} FAILED`);
process.exit(failures === 0 ? 0 : 1);
