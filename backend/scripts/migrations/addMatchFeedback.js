#!/usr/bin/env node
/**
 * addMatchFeedback.js  —  Phase 4 migration
 *
 * Creates the match_feedback table for user feedback on ingredient matches.
 * Idempotent — safe to re-run.
 *
 * Usage: node scripts/migrations/addMatchFeedback.js
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
      CREATE TABLE IF NOT EXISTS match_feedback (
        id               SERIAL PRIMARY KEY,
        recipe_id        INTEGER,
        recipe_title     TEXT,
        ingredient_name  TEXT NOT NULL,
        product_name     TEXT NOT NULL,
        store            TEXT,
        user_id          UUID,
        feedback_type    TEXT NOT NULL CHECK (feedback_type IN ('incorrect', 'correct')),
        reason           TEXT,
        created_at       TIMESTAMPTZ NOT NULL DEFAULT NOW()
      );
      CREATE INDEX IF NOT EXISTS idx_feedback_ingredient ON match_feedback (ingredient_name);
      CREATE INDEX IF NOT EXISTS idx_feedback_product    ON match_feedback (product_name);
      CREATE INDEX IF NOT EXISTS idx_feedback_created    ON match_feedback (created_at DESC);
    `);

    console.log('✓ match_feedback table ready');
  } finally {
    await pool.end();
  }
}

run().catch(err => { console.error(err.message); process.exit(1); });
