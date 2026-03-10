/**
 * scripts/compareMatching.js
 *
 * Before/after comparison of text-based vs product intelligence recipe matching.
 * Uses live cached deals if available; falls back to hardcoded sample deals.
 *
 * Usage: node backend/scripts/compareMatching.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const path = require('path');
const fs   = require('fs');

// ── Load services ─────────────────────────────────────────────────────────────

// Temporarily override the feature flag by monkey-patching after load.
// We'll run matchDeals twice: once with PI off, once with PI on.
const recipeMatcher = require('../services/recipeMatcher');
const db            = require('../database/db');

// ── Sample deals (hardcoded fallback if no cache) ─────────────────────────────

const HARDCODED_DEALS = [
  // Proteins — should drive recipe selection
  { name: 'Woolworths RSPCA Approved Chicken Breast Fillets 600g', price: 9.00, originalPrice: 14.00, store: 'woolworths', category: 'Poultry' },
  { name: 'Coles Lean Beef Mince 500g',                            price: 5.50, originalPrice: 8.00,  store: 'coles',      category: 'Beef' },
  { name: 'Atlantic Salmon Portions 400g',                         price: 11.00, originalPrice: 16.00, store: 'woolworths', category: 'Seafood' },
  { name: 'Coles Free Range Chicken Thighs 1kg',                   price: 8.00, originalPrice: 12.00, store: 'coles',      category: 'Poultry' },
  { name: 'Woolworths Pork Mince 500g',                            price: 6.00, originalPrice: 9.00,  store: 'woolworths', category: 'Pork' },
  // Dairy
  { name: 'Mainland Tasty Cheddar Cheese 500g',                    price: 7.00, originalPrice: 9.50,  store: 'coles',      category: 'Dairy' },
  { name: 'Pauls Thickened Cream 300ml',                           price: 2.20, originalPrice: 3.50,  store: 'woolworths', category: 'Dairy' },
  { name: 'Perfect Italiano Parmesan Shredded 250g',               price: 4.50, originalPrice: 6.00,  store: 'coles',      category: 'Dairy' },
  // Vegetables
  { name: 'Woolworths Broccoli Each',                              price: 1.50, originalPrice: 3.00,  store: 'woolworths', category: 'Vegetables' },
  { name: 'Coles Baby Spinach 120g',                               price: 2.50, originalPrice: 4.00,  store: 'coles',      category: 'Vegetables' },
  { name: 'Cherry Tomatoes Punnet 250g',                           price: 2.80, originalPrice: 4.50,  store: 'woolworths', category: 'Vegetables' },
  { name: 'Woolworths Garlic Chicken Tenderloins 500g',            price: 8.50, originalPrice: 12.00, store: 'woolworths', category: 'Poultry' },
  // ↑ "Garlic" should NOT match recipe ingredient "garlic" with the new PI matcher
  { name: 'Garlic Bulbs Loose 3pk',                                price: 1.00, originalPrice: 2.00,  store: 'iga',        category: 'Vegetables' },
  // ↑ "Garlic" SHOULD match recipe ingredient "garlic" — this is real garlic
  // Pasta & pantry
  { name: 'San Remo Spaghetti 500g',                               price: 1.50, originalPrice: 2.50,  store: 'woolworths', category: 'Pasta, Rice, Noodles' },
  { name: 'Ardmona Diced Tomatoes 400g',                           price: 1.20, originalPrice: 2.00,  store: 'coles',      category: 'Canned' },
  { name: 'Massel Chicken Liquid Stock 1L',                        price: 2.50, originalPrice: 4.00,  store: 'woolworths', category: 'Soup, Stock' },
  { name: 'Bertolli Extra Virgin Olive Oil 750ml',                 price: 8.00, originalPrice: 12.00, store: 'coles',      category: 'Oils' },
  { name: 'SunRice Basmati Rice 2kg',                              price: 5.00, originalPrice: 8.00,  store: 'woolworths', category: 'Pasta, Rice, Noodles' },
  // Non-food (should be filtered out)
  { name: 'Woolworths Baby Moisturising Cream 200ml',              price: 4.00, originalPrice: 6.00,  store: 'woolworths', category: 'Baby' },
  { name: 'Head & Shoulders Shampoo 400ml',                        price: 5.00, originalPrice: 8.00,  store: 'coles',      category: 'Health & Beauty' },
];

// ── Add mock product intelligence to selected deals ───────────────────────────
// Simulates what the DB would return after seeding.
// This lets us demonstrate the PI matching benefit without a seeded database.

function addMockProductIntelligence(deals) {
  const PI_MAP = {
    'Woolworths RSPCA Approved Chicken Breast Fillets 600g': {
      productType: 'chicken breast', baseIngredient: 'chicken', category: 'meat',
      isHeroIngredient: true, processingLevel: 'unprocessed',
      satisfiesIngredients: ['chicken breast', 'chicken', 'poultry', 'skinless chicken breast'],
    },
    'Coles Lean Beef Mince 500g': {
      productType: 'beef mince', baseIngredient: 'beef', category: 'meat',
      isHeroIngredient: true, processingLevel: 'minimally_processed',
      satisfiesIngredients: ['beef mince', 'ground beef', 'mince', 'lean mince', 'beef'],
    },
    'Atlantic Salmon Portions 400g': {
      productType: 'salmon fillet', baseIngredient: 'salmon', category: 'seafood',
      isHeroIngredient: true, processingLevel: 'unprocessed',
      satisfiesIngredients: ['salmon fillet', 'salmon', 'fish fillet', 'fish'],
    },
    'Coles Free Range Chicken Thighs 1kg': {
      productType: 'chicken thigh', baseIngredient: 'chicken', category: 'meat',
      isHeroIngredient: true, processingLevel: 'unprocessed',
      satisfiesIngredients: ['chicken thigh', 'chicken thighs', 'chicken', 'poultry'],
    },
    'Woolworths Pork Mince 500g': {
      productType: 'pork mince', baseIngredient: 'pork', category: 'meat',
      isHeroIngredient: true, processingLevel: 'minimally_processed',
      satisfiesIngredients: ['pork mince', 'ground pork', 'mince', 'pork'],
    },
    'Mainland Tasty Cheddar Cheese 500g': {
      productType: 'cheddar cheese', baseIngredient: 'cheese', category: 'dairy',
      isHeroIngredient: false, processingLevel: 'processed',
      satisfiesIngredients: ['cheddar cheese', 'cheddar', 'tasty cheese', 'cheese', 'grated cheese'],
    },
    'Garlic Bulbs Loose 3pk': {
      productType: 'fresh garlic', baseIngredient: 'garlic', category: 'vegetables',
      isHeroIngredient: false, processingLevel: 'unprocessed',
      satisfiesIngredients: ['garlic', 'garlic bulbs', 'garlic cloves', 'fresh garlic'],
    },
    'Woolworths Garlic Chicken Tenderloins 500g': {
      productType: 'chicken tenderloins', baseIngredient: 'chicken', category: 'meat',
      isHeroIngredient: true, processingLevel: 'processed',
      // NOTE: "garlic" intentionally NOT in satisfiesIngredients — this is a chicken product
      satisfiesIngredients: ['chicken tenderloins', 'chicken tenderloin', 'chicken strips', 'chicken'],
    },
    'San Remo Spaghetti 500g': {
      productType: 'spaghetti', baseIngredient: 'pasta', category: 'grains',
      isHeroIngredient: false, processingLevel: 'processed',
      satisfiesIngredients: ['spaghetti', 'pasta', 'long pasta'],
    },
    'Ardmona Diced Tomatoes 400g': {
      productType: 'diced tomatoes', baseIngredient: 'tomato', category: 'canned_preserved',
      isHeroIngredient: false, processingLevel: 'processed',
      satisfiesIngredients: ['diced tomatoes', 'crushed tomatoes', 'canned tomatoes', 'tinned tomatoes', 'tomatoes'],
    },
    'Bertolli Extra Virgin Olive Oil 750ml': {
      productType: 'olive oil', baseIngredient: 'olive oil', category: 'oils_fats',
      isHeroIngredient: false, processingLevel: 'minimally_processed',
      satisfiesIngredients: ['olive oil', 'extra virgin olive oil', 'EVOO'],
    },
    'SunRice Basmati Rice 2kg': {
      productType: 'basmati rice', baseIngredient: 'rice', category: 'grains',
      isHeroIngredient: false, processingLevel: 'minimally_processed',
      satisfiesIngredients: ['basmati rice', 'rice', 'long grain rice'],
    },
  };

  return deals.map(deal => {
    const pi = PI_MAP[deal.name];
    return pi ? { ...deal, productIntelligence: pi } : deal;
  });
}

// ── Load live deals from cache ─────────────────────────────────────────────────

function loadCachedDeals() {
  try {
    const cachePath = path.join(__dirname, '../data/cached-deals.json');
    const data      = JSON.parse(fs.readFileSync(cachePath, 'utf8'));
    return [
      ...(data.woolworths || []),
      ...(data.coles      || []),
      ...(data.iga        || []),
    ];
  } catch {
    return null;
  }
}

// ── Run matching with feature flag ────────────────────────────────────────────

function runMatching(deals, usePi) {
  // Temporarily swap the flag by direct property access on the module instance
  // (the flag is module-level; we patch via a side-channel run option instead)
  // Since USE_PRODUCT_INTELLIGENCE is a module-level const we can't change it at runtime.
  // Instead, for the "off" run we strip productIntelligence from the deals.
  const testDeals = usePi ? deals : deals.map(d => {
    const { productIntelligence: _pi, ...rest } = d;
    return rest;
  });

  const start   = Date.now();
  const results = recipeMatcher.matchDeals(testDeals);
  const elapsed = Date.now() - start;

  return { results, elapsed };
}

// ── Display helpers ───────────────────────────────────────────────────────────

function printTopRecipes(results, label, n = 10) {
  console.log(`\n  ${label} — top ${Math.min(n, results.length)} of ${results.length} recipes:`);
  results.slice(0, n).forEach((r, i) => {
    const deals = r.matchedDeals.map(d =>
      `${d.ingredient}${d.productCategory ? `[${d.productCategory}]` : ''}`
    ).join(', ');
    const score = r.weightedScore ? `score=${r.weightedScore.toFixed(1)}` : `matches=${r.matchScore}`;
    console.log(`  ${String(i + 1).padStart(2)}. ${r.title.substring(0, 45).padEnd(45)} ${score.padEnd(14)} deals: ${deals.substring(0, 70)}`);
  });
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('\n[CompareMatching] Starting comparison...\n');

  // Load deals
  const liveDeals = loadCachedDeals();
  const rawDeals  = (liveDeals && liveDeals.length > 0)
    ? (console.log(`[CompareMatching] Using ${liveDeals.length} live cached deals`), liveDeals)
    : (console.log(`[CompareMatching] No live deals — using ${HARDCODED_DEALS.length} hardcoded sample deals`), HARDCODED_DEALS);

  // Add mock PI to the deals we use for the PI run
  const enrichedDeals = addMockProductIntelligence(rawDeals);

  const piCount = enrichedDeals.filter(d => d.productIntelligence).length;
  console.log(`[CompareMatching] ${piCount}/${enrichedDeals.length} deals have product intelligence\n`);

  // ── Run 1: text-based matching (old) ──────────────────────────────────────
  console.log('── Run 1: Text-based matching (no product intelligence) ─────────');
  const run1 = runMatching(enrichedDeals, false);
  console.log(`   ${run1.results.length} recipes matched in ${run1.elapsed}ms`);
  printTopRecipes(run1.results, 'Text matching');

  // ── Run 2: product intelligence matching (new) ────────────────────────────
  console.log('\n── Run 2: Product intelligence matching ─────────────────────────');
  const run2 = runMatching(enrichedDeals, true);
  console.log(`   ${run2.results.length} recipes matched in ${run2.elapsed}ms`);
  printTopRecipes(run2.results, 'PI matching');

  // ── Garlic false-positive check ───────────────────────────────────────────
  console.log('\n── Garlic false-positive check ──────────────────────────────────');

  const garlicChickenDeal = enrichedDeals.find(d => d.name.includes('Garlic Chicken Tenderloins'));
  const realGarlicDeal    = enrichedDeals.find(d => d.name.includes('Garlic Bulbs'));

  for (const [label, r] of [['Text', run1.results], ['PI', run2.results]]) {
    const garlicChickenMatches = r.flatMap(recipe =>
      recipe.matchedDeals
        .filter(md => md.dealName?.includes('Garlic Chicken'))
        .map(md => `${recipe.title} → matched ingredient: "${md.ingredient}"`)
    );
    const realGarlicMatches = r.flatMap(recipe =>
      recipe.matchedDeals
        .filter(md => md.dealName?.includes('Garlic Bulbs'))
        .map(md => `${recipe.title} → matched ingredient: "${md.ingredient}"`)
    );

    console.log(`\n  ${label} — "Garlic Chicken Tenderloins" triggered matches (should be 0 for ingredient "garlic"):`);
    if (garlicChickenMatches.length === 0) {
      console.log('    ✓ No false-positive garlic matches');
    } else {
      garlicChickenMatches.slice(0, 5).forEach(m => console.log(`    ✗ ${m}`));
    }

    console.log(`  ${label} — "Garlic Bulbs" matched recipes (real garlic, should match):`);
    if (realGarlicMatches.length === 0) {
      console.log('    (no matches — DB not seeded with garlic products yet)');
    } else {
      realGarlicMatches.slice(0, 3).forEach(m => console.log(`    ✓ ${m}`));
    }
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const overlap   = run1.results.filter(r1 => run2.results.some(r2 => r2.id === r1.id)).length;
  const onlyText  = run1.results.filter(r1 => !run2.results.some(r2 => r2.id === r1.id)).length;
  const onlyPi    = run2.results.filter(r2 => !run1.results.some(r1 => r1.id === r2.id)).length;

  console.log('\n── Summary ───────────────────────────────────────────────────────');
  console.log(`  Text matching:    ${run1.results.length} recipes in ${run1.elapsed}ms`);
  console.log(`  PI matching:      ${run2.results.length} recipes in ${run2.elapsed}ms`);
  console.log(`  Overlap:          ${overlap} recipes appear in both`);
  console.log(`  Only in text:     ${onlyText} (dropped by PI — likely false positives)`);
  console.log(`  Only in PI:       ${onlyPi}  (new matches from product categorization)`);

  if (piCount > 0) {
    console.log('\n  ✓ Product intelligence is active and affecting results');
  } else {
    console.log('\n  ⚠  No product intelligence data — run seed scripts to see full improvement');
    console.log('     node backend/scripts/seedDatabase/seedOpenFoodFacts.js');
    console.log('     node backend/scripts/seedDatabase/seedWoolworths.js');
  }
  console.log('──────────────────────────────────────────────────────────────────\n');

  db.closeDb();
}

main().catch(err => {
  console.error('[CompareMatching] Fatal:', err.message);
  process.exit(1);
});
