/**
 * Migration: Add state column to users table.
 *
 * Run with:  node backend/scripts/migrations/addStateColumn.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL — add it to your .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function run() {
  const client = await pool.connect();
  try {
    await client.query(`
      ALTER TABLE users
        ADD COLUMN IF NOT EXISTS state TEXT,
        ADD COLUMN IF NOT EXISTS dietary_restrictions  TEXT[],
        ADD COLUMN IF NOT EXISTS excluded_ingredients  TEXT[];
    `);
    console.log('Migration complete: state column added to users table');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
