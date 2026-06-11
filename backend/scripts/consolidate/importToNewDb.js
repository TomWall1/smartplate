// Import all data to dealtodish project
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const newDbUrl = process.env.NEW_DATABASE_URL;
if (!newDbUrl) {
  console.error('ERROR: Set NEW_DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({ connectionString: newDbUrl, ssl: { rejectUnauthorized: false } });
const exportDir = path.join(__dirname, 'exports');

function loadExport(table) {
  const file = path.join(exportDir, `${table}.json`);
  if (!fs.existsSync(file)) { console.log(`  ⚠ No export file for ${table}, skipping`); return null; }
  return JSON.parse(fs.readFileSync(file));
}

async function createTables() {
  console.log('Creating tables...\n');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS products (
      id SERIAL PRIMARY KEY,
      barcode TEXT,
      name TEXT NOT NULL,
      normalized_name TEXT NOT NULL,
      brand TEXT,
      size TEXT,
      product_type TEXT,
      base_ingredient TEXT,
      category TEXT,
      sub_category TEXT,
      processing_level TEXT,
      is_hero_ingredient INTEGER NOT NULL DEFAULT 0,
      typical_use_case TEXT,
      purchase_reasonability TEXT,
      satisfies_ingredients TEXT NOT NULL DEFAULT '[]',
      source TEXT,
      woolworths_id TEXT,
      coles_id TEXT,
      times_matched INTEGER NOT NULL DEFAULT 0,
      last_seen_on_sale TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ products');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS product_aliases (
      id SERIAL PRIMARY KEY,
      product_id INTEGER NOT NULL,
      alias TEXT NOT NULL,
      normalized TEXT NOT NULL,
      source TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ product_aliases');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS match_history (
      id SERIAL PRIMARY KEY,
      deal_name TEXT NOT NULL,
      product_id INTEGER,
      match_type TEXT,
      store TEXT,
      matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ match_history');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS weekly_recipes_cache (
      id SERIAL PRIMARY KEY,
      recipes JSONB NOT NULL,
      generated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      deal_count INTEGER NOT NULL DEFAULT 0
    )
  `);
  console.log('✓ weekly_recipes_cache');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS users (
      id UUID PRIMARY KEY,
      email TEXT NOT NULL,
      selected_store TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      is_premium BOOLEAN NOT NULL DEFAULT false,
      premium_since TIMESTAMP
    )
  `);
  console.log('✓ users');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS favorite_recipes (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      recipe_id TEXT NOT NULL,
      recipe_data JSONB,
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ favorite_recipes');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS meal_plans (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      date DATE NOT NULL,
      meal_type TEXT NOT NULL,
      recipe_id TEXT NOT NULL,
      recipe_data JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ meal_plans');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS shopping_lists (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      name TEXT NOT NULL DEFAULT 'My Shopping List',
      items JSONB NOT NULL DEFAULT '[]',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ shopping_lists');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_history (
      id SERIAL PRIMARY KEY,
      product_name TEXT NOT NULL,
      store TEXT NOT NULL,
      price NUMERIC NOT NULL,
      original_price NUMERIC,
      recorded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ price_history');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS price_alerts (
      id SERIAL PRIMARY KEY,
      user_id UUID NOT NULL,
      product_name TEXT NOT NULL,
      target_price NUMERIC NOT NULL,
      store TEXT,
      active BOOLEAN NOT NULL DEFAULT true,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  console.log('✓ price_alerts');

  console.log('');
}

async function importProducts() {
  const rows = loadExport('products');
  if (!rows) return;
  process.stdout.write(`Importing ${rows.length} products...`);
  await pool.query('DELETE FROM product_aliases');
  await pool.query('DELETE FROM match_history');
  await pool.query('DELETE FROM products');
  for (const r of rows) {
    await pool.query(
      `INSERT INTO products (id, barcode, name, normalized_name, brand, size, product_type,
        base_ingredient, category, sub_category, processing_level, is_hero_ingredient,
        typical_use_case, purchase_reasonability, satisfies_ingredients, source,
        woolworths_id, coles_id, times_matched, last_seen_on_sale, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22)`,
      [r.id, r.barcode, r.name, r.normalized_name, r.brand, r.size, r.product_type,
       r.base_ingredient, r.category, r.sub_category, r.processing_level, r.is_hero_ingredient,
       r.typical_use_case, r.purchase_reasonability, r.satisfies_ingredients, r.source,
       r.woolworths_id, r.coles_id, r.times_matched, r.last_seen_on_sale, r.created_at, r.updated_at]
    );
  }
  // Reset sequence
  await pool.query(`SELECT setval('products_id_seq', (SELECT MAX(id) FROM products))`);
  console.log(' ✓');
}

async function importProductAliases() {
  const rows = loadExport('product_aliases');
  if (!rows || rows.length === 0) { console.log('product_aliases: 0 rows, skipping'); return; }
  process.stdout.write(`Importing ${rows.length} product_aliases...`);
  for (const r of rows) {
    await pool.query(
      'INSERT INTO product_aliases (id, product_id, alias, normalized, source, created_at) VALUES ($1,$2,$3,$4,$5,$6)',
      [r.id, r.product_id, r.alias, r.normalized, r.source, r.created_at]
    );
  }
  await pool.query(`SELECT setval('product_aliases_id_seq', (SELECT MAX(id) FROM product_aliases))`);
  console.log(' ✓');
}

async function importMatchHistory() {
  const rows = loadExport('match_history');
  if (!rows || rows.length === 0) { console.log('match_history: 0 rows, skipping'); return; }
  process.stdout.write(`Importing ${rows.length} match_history entries...`);
  // Batch in chunks of 500
  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    for (const r of chunk) {
      await pool.query(
        'INSERT INTO match_history (id, deal_name, product_id, match_type, store, matched_at) VALUES ($1,$2,$3,$4,$5,$6)',
        [r.id, r.deal_name, r.product_id, r.match_type, r.store, r.matched_at]
      );
    }
    process.stdout.write(`.`);
  }
  await pool.query(`SELECT setval('match_history_id_seq', (SELECT MAX(id) FROM match_history))`);
  console.log(' ✓');
}

async function importRecipes() {
  const rows = loadExport('weekly_recipes_cache');
  if (!rows) return;
  process.stdout.write(`Importing ${rows.length} recipe cache entries...`);
  await pool.query('DELETE FROM weekly_recipes_cache');
  for (const r of rows) {
    await pool.query(
      'INSERT INTO weekly_recipes_cache (id, recipes, generated_at, deal_count) VALUES ($1,$2,$3,$4)',
      [r.id, JSON.stringify(r.recipes), r.generated_at, r.deal_count || 0]
    );
  }
  await pool.query(`SELECT setval('weekly_recipes_cache_id_seq', (SELECT MAX(id) FROM weekly_recipes_cache))`);
  console.log(' ✓');
}

async function importData() {
  console.log('Importing data to dealtodish...\n');
  await createTables();

  await importProducts();
  await importProductAliases();
  await importMatchHistory();
  await importRecipes();

  // Verify
  console.log('\nVerifying...');
  const counts = await pool.query(`
    SELECT 'products' as t, COUNT(*) FROM products
    UNION ALL SELECT 'product_aliases', COUNT(*) FROM product_aliases
    UNION ALL SELECT 'match_history', COUNT(*) FROM match_history
    UNION ALL SELECT 'weekly_recipes_cache', COUNT(*) FROM weekly_recipes_cache
  `);
  counts.rows.forEach(r => console.log(`  ${r.t}: ${r.count} rows`));

  await pool.end();
  console.log('\n✅ Import complete!');
}

importData().catch(err => {
  console.error('\nImport failed:', err.message);
  process.exit(1);
});
