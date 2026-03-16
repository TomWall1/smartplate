/**
 * Migration: Add is_active control flag to recipes table.
 *
 * Run with:  node backend/scripts/migrations/addRecipeControlFlags.js
 *
 * - Adds is_active BOOLEAN DEFAULT true to recipes
 * - Creates index for fast active-only queries
 * - Runs the subheading auto-detection SQL against existing ingredients JSONB
 *
 * Requires DATABASE_URL in backend/.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== addRecipeControlFlags migration ===\n');

    // 1. Add is_active column (idempotent)
    console.log('Adding is_active column...');
    await client.query(`
      ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true
    `);
    await client.query(`
      CREATE INDEX IF NOT EXISTS idx_recipes_is_active ON recipes (is_active)
    `);
    console.log('  Done.\n');

    // 2. Back-fill subheading / isActive flags on existing ingredients JSONB.
    //    Detects headings by common patterns then stamps isSubheading, isActive, subheadingGroup.
    console.log('Back-filling subheading detection on ingredients...');
    const result = await client.query(`
      UPDATE recipes
      SET ingredients = (
        SELECT jsonb_agg(
          CASE
            -- Detect subheadings: "FOR THE ...", "FOR ..." at start, all-caps-only names, "LABEL:" pattern
            WHEN (
              ingredient->>'name' ~* '^for the '
              OR ingredient->>'name' ~* '^for '
              OR (
                ingredient->>'name' ~ '^[A-Z][A-Z\\s]+:?$'
                AND length(ingredient->>'name') >= 4
              )
            )
            THEN
              ingredient
                || '{"isSubheading": true}'::jsonb
                || '{"isActive": true}'::jsonb
                || '{"subheadingGroup": null}'::jsonb
            -- Normal ingredient: stamp flags if not already present
            ELSE
              CASE
                WHEN ingredient ? 'isSubheading' THEN ingredient
                ELSE ingredient
                  || '{"isSubheading": false}'::jsonb
                  || '{"isActive": true}'::jsonb
                  || '{"subheadingGroup": null}'::jsonb
              END
          END
        )
        FROM jsonb_array_elements(ingredients) AS ingredient
      )
      WHERE ingredients IS NOT NULL
        AND jsonb_array_length(ingredients) > 0
    `);
    console.log(`  Updated ${result.rowCount} recipes.\n`);

    // 3. Final count
    const { rows } = await client.query(
      'SELECT COUNT(*) FILTER (WHERE is_active) AS active, COUNT(*) AS total FROM recipes'
    );
    console.log(`=== Done ===`);
    console.log(`  Recipes: ${rows[0].active} active / ${rows[0].total} total`);

  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
