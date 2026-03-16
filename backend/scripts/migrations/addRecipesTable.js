/**
 * Migration: Create recipes table and seed from enriched JSON files.
 *
 * Run with:  node backend/scripts/migrations/addRecipesTable.js
 *
 * - Creates a `recipes` table with JSONB metadata + ingredient_tags columns
 * - GIN indexes for metadata and ingredient_tags (fast filter queries)
 * - Seeds from *-enriched.json files; falls back to originals if not found
 * - Idempotent: uses INSERT ... ON CONFLICT DO UPDATE, safe to re-run
 *
 * Requires DATABASE_URL in backend/.env
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL — add it to your .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });
const DATA_DIR = path.join(__dirname, '../../data');

// ── DDL ───────────────────────────────────────────────────────────────────────

const DDL = `
CREATE TABLE IF NOT EXISTS recipes (
  id               SERIAL       PRIMARY KEY,
  source_id        INTEGER      NOT NULL,
  source           TEXT         NOT NULL,
  title            TEXT         NOT NULL,
  description      TEXT,
  url              TEXT,
  image            TEXT,
  prep_time        INTEGER,
  cook_time        INTEGER,
  total_time       INTEGER,
  servings         INTEGER,
  category         TEXT[],
  cuisine          TEXT[],
  ingredients      JSONB        NOT NULL DEFAULT '[]',
  steps            JSONB        NOT NULL DEFAULT '[]',
  metadata         JSONB,
  enriched_at      TIMESTAMPTZ,
  created_at       TIMESTAMPTZ  NOT NULL DEFAULT NOW(),
  UNIQUE(source, source_id)
);

-- GIN indexes for fast JSONB queries
CREATE INDEX IF NOT EXISTS idx_recipes_metadata         ON recipes USING GIN (metadata);
CREATE INDEX IF NOT EXISTS idx_recipes_ingredients      ON recipes USING GIN (ingredients);

-- B-tree indexes for common scalar filters
CREATE INDEX IF NOT EXISTS idx_recipes_source           ON recipes (source);
CREATE INDEX IF NOT EXISTS idx_recipes_title            ON recipes (title);
`;

// ── Source libraries ──────────────────────────────────────────────────────────

const LIBRARIES = [
  { src: 'recipe-library.json',         enriched: 'recipe-library-enriched.json',         source: 'recipetineats' },
  { src: 'jamie-oliver-recipes.json',   enriched: 'jamie-oliver-recipes-enriched.json',   source: 'jamieoliver'   },
  { src: 'donna-hay-recipes.json',      enriched: 'donna-hay-recipes-enriched.json',       source: 'donnahay'      },
  { src: 'juliegoodwin-recipes.json',   enriched: 'juliegoodwin-recipes-enriched.json',    source: 'juliegoodwin'  },
  { src: 'womensweekly-recipes.json',   enriched: 'womensweekly-recipes-enriched.json',    source: 'womensweekly'  },
];

// ── Seed a single library ─────────────────────────────────────────────────────

async function seedLibrary(client, lib) {
  // Prefer enriched file; fall back to original
  const enrichedPath = path.join(DATA_DIR, lib.enriched);
  const srcPath      = path.join(DATA_DIR, lib.src);

  const filePath = fs.existsSync(enrichedPath) ? enrichedPath : srcPath;

  if (!fs.existsSync(filePath)) {
    console.log(`  Skipping ${lib.source} — file not found: ${filePath}`);
    return 0;
  }

  const isEnriched = filePath === enrichedPath;
  console.log(`  Loading ${lib.source} from ${path.basename(filePath)}${isEnriched ? ' (enriched)' : ' (original)'}`);

  const data    = JSON.parse(fs.readFileSync(filePath, 'utf8'));
  const recipes = data.recipes ?? [];

  if (recipes.length === 0) {
    console.log(`  No recipes found in ${lib.source}`);
    return 0;
  }

  let inserted = 0;
  let updated  = 0;
  let errors   = 0;

  // Batch upserts in chunks of 100
  const CHUNK = 100;
  for (let i = 0; i < recipes.length; i += CHUNK) {
    const chunk = recipes.slice(i, i + CHUNK);

    for (const r of chunk) {
      // Extract per-ingredient tags into a parallel JSONB column
      // (ingredients column keeps full ingredient objects including ingredientTags)
      const ingredients = (r.ingredients ?? []).map(ing => ({
        name:           ing.name     ?? '',
        quantity:       ing.quantity ?? null,
        unit:           ing.unit     ?? null,
        raw:            ing.raw      ?? null,
        ingredientTags: ing.ingredientTags ?? null,
      }));

      const metadata = r.metadata ?? null;

      try {
        const result = await client.query(
          `INSERT INTO recipes
             (source_id, source, title, description, url, image,
              prep_time, cook_time, total_time, servings,
              category, cuisine, ingredients, steps,
              metadata, enriched_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
           ON CONFLICT (source, source_id) DO UPDATE SET
             title       = EXCLUDED.title,
             description = EXCLUDED.description,
             url         = EXCLUDED.url,
             image       = EXCLUDED.image,
             prep_time   = EXCLUDED.prep_time,
             cook_time   = EXCLUDED.cook_time,
             total_time  = EXCLUDED.total_time,
             servings    = EXCLUDED.servings,
             category    = EXCLUDED.category,
             cuisine     = EXCLUDED.cuisine,
             ingredients = EXCLUDED.ingredients,
             steps       = EXCLUDED.steps,
             metadata    = EXCLUDED.metadata,
             enriched_at = EXCLUDED.enriched_at
           RETURNING (xmax = 0) AS inserted`,
          [
            r.id,
            lib.source,
            r.title        ?? '',
            r.description  ?? null,
            r.url          ?? null,
            r.image        ?? null,
            r.prepTime     ?? null,
            r.cookTime     ?? null,
            r.totalTime    ?? null,
            r.servings     ?? null,
            r.category     ?? [],
            r.cuisine      ?? [],
            JSON.stringify(ingredients),
            JSON.stringify(r.steps ?? []),
            metadata ? JSON.stringify(metadata) : null,
            r.metadata ? (data.enrichedAt ?? new Date().toISOString()) : null,
          ],
        );
        if (result.rows[0]?.inserted) inserted++; else updated++;
      } catch (err) {
        console.error(`    ✗ Error inserting "${r.title}": ${err.message}`);
        errors++;
      }
    }

    process.stdout.write(`\r    ${lib.source}: ${Math.min(i + CHUNK, recipes.length)}/${recipes.length}`);
  }

  console.log(`\n    ${lib.source}: ${inserted} inserted, ${updated} updated, ${errors} errors`);
  return inserted + updated;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const client = await pool.connect();
  let total = 0;

  try {
    console.log('=== Recipe Table Migration ===\n');

    // 1. Create table + indexes
    console.log('Creating recipes table and indexes...');
    await client.query(DDL);
    console.log('  Done.\n');

    // 2. Seed from all libraries
    console.log('Seeding recipes...');
    for (const lib of LIBRARIES) {
      total += await seedLibrary(client, lib);
    }

    // 3. Ensure is_active column exists (may already be present if addRecipeControlFlags ran first)
    console.log('\nEnsuring is_active column...');
    await client.query(`ALTER TABLE recipes ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true`);
    await client.query(`CREATE INDEX IF NOT EXISTS idx_recipes_is_active ON recipes (is_active)`);
    console.log('  Done.');

    // 4. Auto-detect subheadings in ingredients JSONB and stamp isSubheading/isActive/subheadingGroup
    console.log('\nStamping subheading flags on ingredients...');
    const stampResult = await client.query(`
      UPDATE recipes
      SET ingredients = (
        SELECT jsonb_agg(
          CASE
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
    console.log(`  Stamped ${stampResult.rowCount} recipes.`);

    // 5. Final count
    const { rows } = await client.query('SELECT COUNT(*) AS n FROM recipes');
    console.log(`\n=== Migration complete ===`);
    console.log(`  Total rows in recipes table: ${rows[0].n}`);
    console.log(`  Rows upserted this run:      ${total}`);
    console.log('\nNext step: run enrichRecipes.js to generate metadata, then re-run this migration to populate metadata columns.');
  } catch (err) {
    console.error('Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
