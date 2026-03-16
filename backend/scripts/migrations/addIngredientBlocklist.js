#!/usr/bin/env node
/**
 * addIngredientBlocklist.js  —  Phase 2 migration
 *
 * Creates the ingredient_blocklist table used by the admin blocklist system.
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/migrations/addIngredientBlocklist.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { Pool } = require('pg');

async function run() {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS ingredient_blocklist (
        id                     SERIAL PRIMARY KEY,
        ingredient_pattern     TEXT NOT NULL,
        blocked_product_patterns TEXT[] NOT NULL DEFAULT '{}',
        reason                 TEXT,
        created_at             TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_by             TEXT
      );
      CREATE INDEX IF NOT EXISTS idx_blocklist_pattern ON ingredient_blocklist (ingredient_pattern);
    `);

    console.log('✓ ingredient_blocklist table ready');
  } finally {
    await pool.end();
  }
}

run().catch(err => { console.error(err.message); process.exit(1); });
