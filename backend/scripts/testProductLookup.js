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
  'Woolworths RSPCA Approved Chicken Breast 500g',
  'Coles Extra Virgin Olive Oil 4L',
  'IGA Fresh Garlic Bulbs 3pk',
  'Woolworths Free Range Eggs 12pk',
  'Coles Lean Beef Mince 500g',
  'Woolworths Organic Broccoli',
  'IGA Premium Salmon Fillets 250g',
  'Coles Fresh Pasta Sauce 500g',
  'Woolworths Basmati Rice 5kg',
  'IGA Shredded Cheese 250g',
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
