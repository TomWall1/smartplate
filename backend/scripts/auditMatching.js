/**
 * Audit current DB state for matching accuracy issues.
 * Run: node backend/scripts/auditMatching.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });
process.env.USE_POSTGRESQL = 'true';

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function query(label, sql, params = []) {
  console.log(`\n=== ${label} ===`);
  try {
    const result = await pool.query(sql, params);
    if (result.rows.length === 0) {
      console.log('  (no results)');
    } else {
      for (const row of result.rows) {
        console.log(`  [${row.id}] ${row.name}`);
        console.log(`    base_ingredient: ${row.base_ingredient}`);
        console.log(`    category: ${row.category}`);
        console.log(`    satisfies: ${row.satisfies_ingredients}`);
      }
    }
  } catch (err) {
    console.error(`  ERROR: ${err.message}`);
  }
}

async function main() {
  await query(
    'GARLIC BREAD products',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products WHERE name ILIKE '%garlic bread%' LIMIT 10`
  );

  await query(
    'GARLIC (non-bread) products',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products WHERE name ILIKE '%garlic%' AND name NOT ILIKE '%bread%' LIMIT 10`
  );

  await query(
    'LAMB products',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products WHERE name ILIKE '%lamb%' LIMIT 15`
  );

  await query(
    'FETA products',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products WHERE name ILIKE '%feta%' LIMIT 10`
  );

  await query(
    'DEVONDALE cheese products',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products WHERE name ILIKE '%devondale%' AND name ILIKE '%cheese%' LIMIT 10`
  );

  await query(
    'Generic CHEESE products (no feta/parmesan/mozzarella/brie)',
    `SELECT id, name, base_ingredient, category, satisfies_ingredients
     FROM products
     WHERE name ILIKE '%cheese%'
       AND name NOT ILIKE '%feta%'
       AND name NOT ILIKE '%parmesan%'
       AND name NOT ILIKE '%mozzarella%'
       AND name NOT ILIKE '%brie%'
       AND name NOT ILIKE '%camembert%'
       AND name NOT ILIKE '%ricotta%'
       AND name NOT ILIKE '%goat%'
     LIMIT 15`
  );

  await pool.end();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
