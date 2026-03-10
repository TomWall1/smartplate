/**
 * scripts/testProductLookup.js
 *
 * Tests the product lookup service against a sample of real deal names.
 * Reports cache hit rate by match tier.
 *
 * Usage: node backend/scripts/testProductLookup.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { findProduct, normalizeName } = require('../services/productLookup');
const db = require('../database/db');

// ── Sample deal names (representative of Salefinder output) ───────────────────

const SAMPLE_DEALS = [
  // Meat
  'Woolworths RSPCA Approved Chicken Breast Fillets 600g',
  'Coles Free Range Chicken Thighs 1kg',
  'Beef Mince Regular Fat 500g',
  'Coles Beef Mince 500g',
  'Lamb Shoulder Chops 1kg',
  'Woolworths Beef Scotch Fillet Steak 300g',
  'Pork Spare Ribs 700g',
  'Coles Thin Bacon Rashers 175g',
  'Woolworths Leg Ham 200g',

  // Seafood
  'Atlantic Salmon Portions 400g',
  'Coles Skin On Salmon Fillets 300g',
  'John West Tuna In Springwater 425g',
  'Woolworths Cooked King Prawns 400g',
  'Basa Fish Fillets 500g',

  // Dairy
  'Pauls Full Cream Milk 2L',
  'Devondale Unsalted Butter 250g',
  'Mainland Tasty Cheddar Cheese 500g',
  'Perfect Italiano Mozzarella Shredded 250g',
  'Bulla Sour Cream 300ml',
  'Chobani Greek Yoghurt Natural 907g',
  'Woolworths Thickened Cream 300ml',

  // Vegetables
  'Broccoli Each',
  'Woolworths Washed Carrots 1kg',
  'Baby Spinach Leaves 120g',
  'Red Capsicum Each',
  'Woolworths Mushrooms Cup 200g',
  'Cherry Tomatoes Punnet 250g',
  'Sweet Potato Loose Per Kg',

  // Pasta & Grains
  'San Remo Spaghetti 500g',
  'Barilla Penne Rigate 500g',
  'Uncle Tobys Rolled Oats 1kg',
  'SunRice Long Grain White Rice 2kg',
  'Jasmine Rice 5kg',

  // Canned
  'Ardmona Diced Tomatoes 400g',
  'Ayam Coconut Cream 400ml',
  'Bush\'s Best Kidney Beans 400g',
  'Edgell Chickpeas 400g',

  // Sauces & Condiments
  'Bertolli Olive Oil 750ml',
  'Kikkoman Soy Sauce 150ml',
  'Leggo\'s Tomato Basil Pasta Sauce 490g',
  'Massel Chicken Liquid Stock 1L',
  'Continental Vegetable Liquid Stock 1L',
];

// ── Run ───────────────────────────────────────────────────────────────────────

async function main() {
  const dbStats = db.getStats();
  console.log(`\n[TestLookup] Database: ${dbStats.products} products, ${dbStats.aliases} aliases`);
  console.log(`[TestLookup] Testing ${SAMPLE_DEALS.length} sample deals...\n`);

  const results = {
    exact:      [],
    alias:      [],
    normalized: [],
    fuzzy:      [],
    barcode:    [],
    none:       [],
  };

  for (const dealName of SAMPLE_DEALS) {
    const result = await findProduct(dealName);
    const tier   = result?.matchType ?? 'none';
    results[tier].push({ dealName, product: result?.product ?? null });

    const normalizedDeal = normalizeName(dealName);
    const label = result
      ? `[${tier.padEnd(10)}] → ${result.product.name} (${result.product.base_ingredient ?? '?'})`
      : `[none      ] → NO MATCH`;
    console.log(`  ${dealName.substring(0, 55).padEnd(55)}  ${label}`);
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total  = SAMPLE_DEALS.length;
  const hits   = total - results.none.length;
  const hitRate = ((hits / total) * 100).toFixed(1);

  console.log('\n[TestLookup] ── Summary ──────────────────────────');
  console.log(`  Total tested:   ${total}`);
  console.log(`  Cache hits:     ${hits} (${hitRate}%)`);
  console.log(`  Exact:          ${results.exact.length}`);
  console.log(`  Alias:          ${results.alias.length}`);
  console.log(`  Normalized:     ${results.normalized.length}`);
  console.log(`  Fuzzy:          ${results.fuzzy.length}`);
  console.log(`  Barcode:        ${results.barcode.length}`);
  console.log(`  No match:       ${results.none.length}`);

  if (results.none.length > 0) {
    console.log('\n  Unmatched deals:');
    results.none.forEach(({ dealName }) => console.log(`    - ${dealName}`));
  }

  const target = 60;
  if (parseFloat(hitRate) >= target) {
    console.log(`\n  ✓ Hit rate ${hitRate}% meets ${target}% target`);
  } else {
    console.log(`\n  ✗ Hit rate ${hitRate}% is below ${target}% target — run seed scripts first`);
  }
  console.log('──────────────────────────────────────────────\n');

  db.closeDb();
}

main().catch((err) => {
  console.error('[TestLookup] Fatal:', err.message);
  process.exit(1);
});
