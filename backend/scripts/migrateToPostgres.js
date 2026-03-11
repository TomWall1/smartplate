/**
 * scripts/migrateToPostgres.js
 * Migrate product data from SQLite to PostgreSQL (Supabase).
 *
 * Usage:
 *   export DATABASE_URL="postgresql://postgres:[PASSWORD]@[PROJECT].supabase.co:5432/postgres"
 *   node backend/scripts/migrateToPostgres.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const sqlite = require('../database/sqlite');
const pg     = require('../database/pg');

const BATCH_SIZE = 100;

async function migrate() {
  console.log('=== SQLite → PostgreSQL Migration ===\n');

  try {
    // Initialize PostgreSQL schema
    console.log('Initializing PostgreSQL schema...');
    await pg.initSchema();

    // ── Products ──────────────────────────────────────────────────────────────
    const products = sqlite.getDb().prepare('SELECT * FROM products').all();
    console.log(`Found ${products.length} products in SQLite`);

    let productsMigrated = 0;
    for (let i = 0; i < products.length; i += BATCH_SIZE) {
      const batch = products.slice(i, i + BATCH_SIZE);
      for (const p of batch) {
        await pg.insertProduct({
          ...p,
          is_hero_ingredient:    p.is_hero_ingredient === 1,
          satisfies_ingredients: JSON.parse(p.satisfies_ingredients || '[]'),
        });
      }
      productsMigrated += batch.length;
      if (productsMigrated % 500 === 0 || productsMigrated === products.length) {
        console.log(`  Products: ${productsMigrated}/${products.length}`);
      }
    }
    console.log(`✅ ${productsMigrated} products migrated`);

    // ── Aliases ───────────────────────────────────────────────────────────────
    const aliases = sqlite.getDb().prepare('SELECT * FROM product_aliases').all();
    console.log(`\nFound ${aliases.length} aliases in SQLite`);

    for (let i = 0; i < aliases.length; i += BATCH_SIZE) {
      const batch = aliases.slice(i, i + BATCH_SIZE);
      for (const a of batch) {
        await pg.insertAlias(a.product_id, a.alias, a.normalized, a.source || 'manual');
      }
      if ((i + batch.length) % 500 === 0 || i + batch.length >= aliases.length) {
        console.log(`  Aliases: ${i + batch.length}/${aliases.length}`);
      }
    }
    console.log(`✅ ${aliases.length} aliases migrated`);

    // ── Verify ────────────────────────────────────────────────────────────────
    const pgCount = await pg.countProducts();
    const pgAliasCount = await pg.countAliases();
    console.log(`\n=== Migration Complete ===`);
    console.log(`PostgreSQL: ${pgCount} products, ${pgAliasCount} aliases`);
    console.log(`SQLite:     ${products.length} products, ${aliases.length} aliases`);

    if (pgCount < products.length) {
      console.warn(`⚠️  Product count mismatch — some may have been merged on barcode conflict`);
    }

    process.exit(0);
  } catch (err) {
    console.error('\n❌ Migration failed:', err.message);
    console.error(err.stack);
    process.exit(1);
  }
}

migrate();
