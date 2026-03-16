/**
 * Migration: Create user_pantries table.
 *
 * Run with:  node backend/scripts/migrations/addUserPantriesTable.js
 *
 * Idempotent — safe to re-run.
 * Requires DATABASE_URL in backend/.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL — add it to your .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DDL = `
CREATE TABLE IF NOT EXISTS user_pantries (
  id                 SERIAL       PRIMARY KEY,
  user_id            UUID         NOT NULL UNIQUE,
  ingredients        JSONB        NOT NULL DEFAULT '[]',
  has_pantry_staples BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  updated_at         TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_pantries_user_id ON user_pantries (user_id);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migration: addUserPantriesTable...');
    await client.query(DDL);
    console.log('✓ user_pantries table ready');
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
