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
  // Straightforward
  { name: 'Coles Free Range Chicken Breast Fillets 500g', category: 'Poultry' },
  { name: 'San Remo Fettuccine 500g',                     category: 'Pasta, Rice, Noodles' },
  { name: 'Mainland Tasty Cheddar Cheese 500g',           category: 'Dairy, Eggs, Fridge' },
  { name: 'Woolworths RSPCA Approved Beef Mince 500g',    category: 'Beef' },
  { name: 'Ardmona Crushed Tomatoes 400g',                category: 'Canned, Dried & Packaged' },

  // Tricky / edge cases
  { name: 'Massel Chicken Style Liquid Stock 1L',         category: 'Soup, Stock & Gravy' },
  { name: 'Kikkoman Naturally Brewed Soy Sauce 150ml',    category: 'Sauces & Condiments' },
  { name: 'Chobani Greek Yoghurt Natural Flavour 907g',   category: 'Dairy, Eggs, Fridge' },
  { name: 'Edgell Four Bean Mix 400g',                    category: 'Canned, Dried & Packaged' },
  { name: 'Bertolli Extra Virgin Olive Oil 750ml',        category: 'Oils & Vinegars' },
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

  // Test individual categorization
  console.log('── Individual categorization ─────────────────────────────────');
  for (const p of TEST_PRODUCTS.slice(0, 3)) {
    process.stdout.write(`  "${p.name.substring(0, 50)}" ... `);
    try {
      const result = await claudeCategorize(p.name, p.category);
      const errors = validateCategorization(p.name, result);

      if (errors.length === 0) {
        console.log('✓');
        console.log(`    baseIngredient:      ${result.baseIngredient}`);
        console.log(`    category:            ${result.category}`);
        console.log(`    processingLevel:     ${result.processingLevel}`);
        console.log(`    isHeroIngredient:    ${result.isHeroIngredient}`);
        console.log(`    satisfies:           ${result.satisfiesIngredients.join(', ')}`);
        passed++;
      } else {
        console.log(`✗ (${errors.join(', ')})`);
        failed++;
      }
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      failed++;
    }
    // Small delay between individual calls
    await new Promise((r) => setTimeout(r, 500));
  }

  // Test batch categorization
  console.log('\n── Batch categorization (5 products) ─────────────────────────');
  const batchProducts = TEST_PRODUCTS.slice(3, 8);
  try {
    const results = await claudeCategorizeBatch(
      batchProducts.map((p) => ({ name: p.name, category: p.category }))
    );

    for (let i = 0; i < batchProducts.length; i++) {
      const p      = batchProducts[i];
      const result = results[i];
      const errors = validateCategorization(p.name, result);
      const label  = errors.length === 0 ? '✓' : `✗ (${errors.join(', ')})`;
      console.log(`  ${label} ${p.name.substring(0, 45).padEnd(45)} → ${result.baseIngredient} (${result.category})`);
      if (errors.length === 0) passed++;
      else failed++;
    }
  } catch (err) {
    console.error('  Batch error:', err.message);
    failed += batchProducts.length;
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
