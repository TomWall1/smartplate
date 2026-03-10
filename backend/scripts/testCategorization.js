/**
 * scripts/testCategorization.js
 *
 * Tests Claude categorization for a set of unknown product names.
 * Validates the response structure and logs results.
 *
 * Usage: node backend/scripts/testCategorization.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { claudeCategorize, claudeCategorizeBatch } = require('../services/productCategorizer');

const TEST_PRODUCTS = [
  { name: 'Woolworths RSPCA Approved Chicken Breast 500g', category: 'Poultry' },
  { name: 'Coles Extra Virgin Olive Oil 4L',               category: 'Oils & Vinegars' },
  { name: 'IGA Fresh Garlic Bulbs 3pk',                    category: 'Vegetables' },
  { name: 'Coles Lean Beef Mince 500g',                    category: 'Beef' },
  { name: 'IGA Shredded Cheese 250g',                      category: 'Dairy, Eggs, Fridge' },
];

const REQUIRED_FIELDS = [
  'productType', 'baseIngredient', 'category', 'processingLevel',
  'isHeroIngredient', 'satisfiesIngredients',
];

function validateCategorization(name, result) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (result[field] === undefined || result[field] === null || result[field] === '') {
      errors.push(`missing ${field}`);
    }
  }
  if (!Array.isArray(result.satisfiesIngredients)) {
    errors.push('satisfiesIngredients must be array');
  } else if (result.satisfiesIngredients.length === 0) {
    errors.push('satisfiesIngredients is empty');
  }
  if (!['unprocessed','minimally_processed','processed','ultra_processed'].includes(result.processingLevel)) {
    errors.push(`invalid processingLevel: ${result.processingLevel}`);
  }
  return errors;
}

async function main() {
  console.log('\n[TestCategorization] Testing Claude categorization...\n');

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('[TestCategorization] ANTHROPIC_API_KEY not set — cannot test');
    process.exit(1);
  }

  let passed = 0;
  let failed = 0;

  for (const p of TEST_PRODUCTS) {
    console.log(`\n── "${p.name}" ─────────────────────────────────`);
    try {
      const result = await claudeCategorize(p.name, p.category);
      const errors = validateCategorization(p.name, result);

      // Always print full JSON output
      console.log(JSON.stringify(result, null, 2));

      if (errors.length === 0) {
        console.log('✓ All required fields present');
        passed++;
      } else {
        console.log(`✗ Validation errors: ${errors.join(', ')}`);
        failed++;
      }
    } catch (err) {
      console.log(`✗ ERROR: ${err.message}`);
      failed++;
    }
    await new Promise((r) => setTimeout(r, 300));
  }

  // ── Summary ────────────────────────────────────────────────────────────────
  const total = passed + failed;
  console.log('\n[TestCategorization] ── Summary ──────────────────────────');
  console.log(`  Total tested:  ${total}`);
  console.log(`  Passed:        ${passed}`);
  console.log(`  Failed:        ${failed}`);
  if (failed === 0) {
    console.log('  ✓ All categorizations valid');
  } else {
    console.log(`  ✗ ${failed}/${total} categorizations had issues`);
  }
  console.log('─────────────────────────────────────────────────────────\n');
}

main().catch((err) => {
  console.error('[TestCategorization] Fatal:', err.message);
  process.exit(1);
});
