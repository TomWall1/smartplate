/**
 * scripts/createRecipeCacheTable.js
 * Add the weekly_recipes_cache table to the production PostgreSQL database.
 * Safe to run multiple times — uses CREATE TABLE IF NOT EXISTS.
 *
 * Usage:
 *   node backend/scripts/createRecipeCacheTable.js
 *
 * Requires DATABASE_URL in environment (or .env file at project root).
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
});

async function run() {
  console.log('=== Create weekly_recipes_cache table ===\n');

  if (!process.env.DATABASE_URL) {
    console.error('❌  DATABASE_URL not set. Add it to your .env file or export it first.');
    process.exit(1);
  }

  const client = await pool.connect();
  try {
    // Create table
    await client.query(`
      CREATE TABLE IF NOT EXISTS weekly_recipes_cache (
        id           SERIAL PRIMARY KEY,
        recipes      JSONB        NOT NULL,
        generated_at TIMESTAMP    NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deal_count   INTEGER      NOT NULL DEFAULT 0
      )
    `);
    console.log('✅  Table created (or already exists): weekly_recipes_cache');

    // Create index
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_weekly_recipes_generated_at
      ON weekly_recipes_cache(generated_at DESC)
    `);
    console.log('✅  Index created (or already exists): idx_weekly_recipes_generated_at');

    // Verify
    const result = await client.query(`
      SELECT COUNT(*) AS n FROM weekly_recipes_cache
    `);
    console.log(`\n✅  Verification: table has ${result.rows[0].n} row(s)`);
    console.log('\nDone. You can now trigger recipe generation:');
    console.log('  curl -X POST https://deals-to-dish-api.onrender.com/api/recipes/generate-weekly');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('❌  Migration failed:', err.message);
  process.exit(1);
});
