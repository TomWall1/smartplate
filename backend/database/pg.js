/**
 * database/pg.js
 * PostgreSQL adapter using the `pg` package.
 * Exposes the same API as sqlite.js so it can be swapped in transparently.
 * All functions are async — callers must use `await`.
 */

const { Pool } = require('pg');
const fs   = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: 10,
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 5000,
});

pool.on('error', (err) => {
  console.error('[PG] Unexpected pool error:', err.message);
});

// ── Auto-migrate: ensure cache tables exist ───────────────────────────────────
// Runs once per process start. Safe — uses CREATE TABLE IF NOT EXISTS.
// Cache readers/writers await this promise so a cold start can't race the DDL.
const _autoMigrate = (async () => {
  try {
    await pool.query(`
      CREATE TABLE IF NOT EXISTS weekly_recipes_cache (
        id           SERIAL PRIMARY KEY,
        recipes      JSONB     NOT NULL,
        generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        deal_count   INTEGER   NOT NULL DEFAULT 0
      )
    `);
    await pool.query(`
      CREATE INDEX IF NOT EXISTS idx_weekly_recipes_generated_at
      ON weekly_recipes_cache(generated_at DESC)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS deals_cache (
        id           SERIAL PRIMARY KEY,
        data         JSONB     NOT NULL,
        last_updated TIMESTAMP NOT NULL,
        saved_at     TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    // One row per refresh: enrichment phases re-persist the same snapshot
    // (same last_updated) and must UPDATE it, not stack duplicates.
    // Dedupe first so the unique index can build on pre-existing tables.
    await pool.query(`
      DELETE FROM deals_cache a USING deals_cache b
      WHERE a.last_updated = b.last_updated AND a.id < b.id
    `);
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_deals_cache_last_updated
      ON deals_cache(last_updated)
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS match_edges (
        ingredient_norm TEXT NOT NULL,
        deal_norm       TEXT NOT NULL,
        verdict         BOOLEAN NOT NULL,
        reason          TEXT,
        model           TEXT,
        decided_at      TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (ingredient_norm, deal_norm)
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS recipe_meta (
        recipe_key           TEXT PRIMARY KEY,
        total_estimated_cost REAL,
        model                TEXT,
        estimated_at         TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS state_deals_cache (
        state      TEXT PRIMARY KEY,
        data       JSONB     NOT NULL,
        fetched_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS state_recipes_cache (
        state        TEXT PRIMARY KEY,
        recipes      JSONB     NOT NULL,
        deal_count   INTEGER   NOT NULL DEFAULT 0,
        generated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
      )
    `);
    await pool.query(`
      CREATE TABLE IF NOT EXISTS outbound_clicks (
        source TEXT NOT NULL,
        day    DATE NOT NULL,
        clicks INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (source, day)
      )
    `);
    // insertProduct upserts ON CONFLICT (barcode); the prod table predates
    // schema.pg.sql's UNIQUE and was created without it, so every new-product
    // insert failed ("no unique or exclusion constraint") and the knowledge
    // base silently stopped growing. NULL barcodes (all deal-derived
    // products) never conflict — duplicate prevention for those is the
    // lookup-before-insert flow, same as SQLite.
    await pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_products_barcode_unique
      ON products(barcode)
    `);
  } catch (err) {
    // Non-fatal — log and continue. Server still works; caches fall back to filesystem.
    console.warn('[PG] cache-table auto-migrate warning:', err.message);
  }
})();

// ── Schema init ───────────────────────────────────────────────────────────────

async function initSchema() {
  const sql = fs.readFileSync(path.join(__dirname, 'schema.pg.sql'), 'utf8');
  await pool.query(sql);
  console.log('[PG] Schema initialized');
}

// ── Connection helpers ────────────────────────────────────────────────────────

function getDb() {
  return pool;
}

async function closeDb() {
  await pool.end();
}

// ── Deserializer ──────────────────────────────────────────────────────────────

function deserializeProduct(row) {
  if (!row) return null;
  return {
    ...row,
    satisfies_ingredients: typeof row.satisfies_ingredients === 'string'
      ? JSON.parse(row.satisfies_ingredients || '[]')
      : (row.satisfies_ingredients || []),
    is_hero_ingredient: row.is_hero_ingredient === 1 || row.is_hero_ingredient === true,
  };
}

// ── Products ──────────────────────────────────────────────────────────────────

async function insertProduct(product) {
  const result = await pool.query(`
    INSERT INTO products (
      barcode, name, normalized_name, brand, size,
      product_type, base_ingredient, category, sub_category,
      processing_level, is_hero_ingredient, typical_use_case,
      purchase_reasonability, satisfies_ingredients, source,
      woolworths_id, coles_id
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17
    )
    ON CONFLICT (barcode) DO UPDATE SET
      name                  = EXCLUDED.name,
      normalized_name       = EXCLUDED.normalized_name,
      brand                 = EXCLUDED.brand,
      size                  = EXCLUDED.size,
      product_type          = EXCLUDED.product_type,
      base_ingredient       = EXCLUDED.base_ingredient,
      category              = EXCLUDED.category,
      sub_category          = EXCLUDED.sub_category,
      processing_level      = EXCLUDED.processing_level,
      is_hero_ingredient    = EXCLUDED.is_hero_ingredient,
      typical_use_case      = EXCLUDED.typical_use_case,
      purchase_reasonability = EXCLUDED.purchase_reasonability,
      satisfies_ingredients = EXCLUDED.satisfies_ingredients,
      source                = EXCLUDED.source,
      woolworths_id         = COALESCE(EXCLUDED.woolworths_id, products.woolworths_id),
      coles_id              = COALESCE(EXCLUDED.coles_id, products.coles_id),
      updated_at            = CURRENT_TIMESTAMP
    RETURNING id
  `, [
    product.barcode               ?? null,
    product.name,
    product.normalized_name,
    product.brand                 ?? null,
    product.size                  ?? null,
    product.product_type          ?? null,
    product.base_ingredient       ?? null,
    product.category              ?? null,
    product.sub_category          ?? null,
    product.processing_level      ?? null,
    product.is_hero_ingredient ? 1 : 0,
    product.typical_use_case      ?? null,
    product.purchase_reasonability ?? null,
    JSON.stringify(product.satisfies_ingredients ?? []),
    product.source                ?? null,
    product.woolworths_id         ?? null,
    product.coles_id              ?? null,
  ]);
  // Return SQLite-compatible shape: { lastInsertRowid, changes }
  const id = result.rows[0]?.id ?? null;
  return { lastInsertRowid: id, changes: result.rowCount };
}

async function insertProductBatch(products) {
  const client = await pool.connect();
  let inserted = 0;
  let updated  = 0;
  try {
    await client.query('BEGIN');
    for (const p of products) {
      const result = await insertProduct(p);
      if (result.changes > 0) {
        if (result.lastInsertRowid) inserted++;
        else updated++;
      }
    }
    await client.query('COMMIT');
    return { inserted, updated };
  } catch (err) {
    await client.query('ROLLBACK');
    throw err;
  } finally {
    client.release();
  }
}

async function getProductById(id) {
  const result = await pool.query('SELECT * FROM products WHERE id = $1', [id]);
  return deserializeProduct(result.rows[0] ?? null);
}

async function getProductByBarcode(barcode) {
  if (!barcode) return null;
  const result = await pool.query('SELECT * FROM products WHERE barcode = $1', [barcode]);
  return deserializeProduct(result.rows[0] ?? null);
}

async function getProductByNormalizedName(normalized) {
  const result = await pool.query('SELECT * FROM products WHERE normalized_name = $1', [normalized]);
  return deserializeProduct(result.rows[0] ?? null);
}

async function getProductsByNormalizedNameLike(normalized) {
  const result = await pool.query(
    'SELECT * FROM products WHERE normalized_name LIKE $1 LIMIT 20',
    [`%${normalized}%`]
  );
  return result.rows.map(deserializeProduct);
}

async function getProductsByNormalizedNames(names) {
  if (!names || names.length === 0) return [];
  const result = await pool.query(
    'SELECT * FROM products WHERE normalized_name = ANY($1)',
    [names]
  );
  return result.rows.map(deserializeProduct);
}

async function incrementTimesMatched(productId) {
  await pool.query(
    'UPDATE products SET times_matched = times_matched + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [productId]
  );
}

async function countProducts() {
  const result = await pool.query('SELECT COUNT(*) AS n FROM products');
  return parseInt(result.rows[0].n, 10);
}

// ── Aliases ───────────────────────────────────────────────────────────────────

async function insertAlias(productId, alias, normalized, source = 'manual') {
  try {
    await pool.query(`
      INSERT INTO product_aliases (product_id, alias, normalized, source)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (normalized) DO NOTHING
    `, [productId, alias, normalized, source]);
  } catch {
    // Ignore duplicate alias errors
  }
}

async function getAlias(normalized) {
  const result = await pool.query(`
    SELECT pa.*, p.*
    FROM product_aliases pa
    JOIN products p ON p.id = pa.product_id
    WHERE pa.normalized = $1
  `, [normalized]);
  return deserializeProduct(result.rows[0] ?? null);
}

async function getAliasesByNormalizedNames(normalizedList) {
  if (!normalizedList || normalizedList.length === 0) return [];
  const result = await pool.query(`
    SELECT pa.normalized AS alias_normalized, p.*
    FROM product_aliases pa
    JOIN products p ON p.id = pa.product_id
    WHERE pa.normalized = ANY($1)
  `, [normalizedList]);
  return result.rows.map(deserializeProduct);
}

async function countAliases() {
  const result = await pool.query('SELECT COUNT(*) AS n FROM product_aliases');
  return parseInt(result.rows[0].n, 10);
}

// ── Match History ─────────────────────────────────────────────────────────────

async function recordMatch(dealName, productId, matchType, store = null) {
  try {
    await pool.query(`
      INSERT INTO match_history (deal_name, product_id, match_type, store)
      VALUES ($1, $2, $3, $4)
    `, [dealName, productId ?? null, matchType, store]);

    if (productId) await incrementTimesMatched(productId);
  } catch (err) {
    console.error('[PG] recordMatch error:', err.message);
  }
}

async function getMatchStats() {
  const totalResult = await pool.query('SELECT COUNT(*) AS n FROM match_history');
  const total = parseInt(totalResult.rows[0].n, 10);
  const byTypeResult = await pool.query(
    'SELECT match_type, COUNT(*) AS n FROM match_history GROUP BY match_type ORDER BY n DESC'
  );
  return { total, byType: byTypeResult.rows };
}

// ── Weekly Recipes Cache ──────────────────────────────────────────────────────

async function saveWeeklyRecipes(recipes, dealCount = 0) {
  const result = await pool.query(`
    INSERT INTO weekly_recipes_cache (recipes, deal_count)
    VALUES ($1, $2)
    RETURNING id, generated_at
  `, [JSON.stringify(recipes), dealCount]);

  // Keep only the 3 most recent entries
  await pool.query(`
    DELETE FROM weekly_recipes_cache
    WHERE id NOT IN (
      SELECT id FROM weekly_recipes_cache ORDER BY generated_at DESC LIMIT 3
    )
  `);

  return result.rows[0] ?? null;
}

async function getWeeklyRecipes() {
  const result = await pool.query(`
    SELECT recipes, generated_at, deal_count
    FROM weekly_recipes_cache
    ORDER BY generated_at DESC
    LIMIT 1
  `);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    recipes:     typeof row.recipes === 'string' ? JSON.parse(row.recipes) : row.recipes,
    generatedAt: row.generated_at,
    dealCount:   row.deal_count,
  };
}

// ── Deals Cache ───────────────────────────────────────────────────────────────

async function saveDealsCache(cache) {
  await _autoMigrate;
  // Upsert keyed on last_updated: phase-1 inserts the snapshot, the
  // enrichment phases (same lastUpdated) update it in place.
  const result = await pool.query(`
    INSERT INTO deals_cache (data, last_updated)
    VALUES ($1, $2)
    ON CONFLICT (last_updated) DO UPDATE
      SET data = EXCLUDED.data, saved_at = CURRENT_TIMESTAMP
    RETURNING id, saved_at
  `, [JSON.stringify(cache), cache.lastUpdated ?? new Date().toISOString()]);

  // Keep only the 2 most recent snapshots (current + previous week)
  await pool.query(`
    DELETE FROM deals_cache
    WHERE id NOT IN (
      SELECT id FROM deals_cache ORDER BY last_updated DESC LIMIT 2
    )
  `);

  return result.rows[0] ?? null;
}

async function getDealsCache() {
  await _autoMigrate;
  const result = await pool.query(`
    SELECT data, last_updated, saved_at
    FROM deals_cache
    ORDER BY last_updated DESC
    LIMIT 1
  `);
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    data:        typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    lastUpdated: row.last_updated,
    savedAt:     row.saved_at,
  };
}

// ── Match Edges (persisted ingredient↔deal verdicts) ──────────────────────────

/**
 * Bulk-fetch edges for a set of {ingredientNorm, dealNorm} pairs.
 * Returns a Map keyed by `${ingredientNorm} ${dealNorm}` → {verdict, reason}.
 */
async function getMatchEdges(pairs) {
  await _autoMigrate;
  if (!pairs.length) return new Map();
  const ingredients = [...new Set(pairs.map(p => p.ingredientNorm))];
  const result = await pool.query(
    'SELECT ingredient_norm, deal_norm, verdict, reason FROM match_edges WHERE ingredient_norm = ANY($1)',
    [ingredients]
  );
  const wanted = new Set(pairs.map(p => `${p.ingredientNorm} ${p.dealNorm}`));
  const map = new Map();
  for (const row of result.rows) {
    const key = `${row.ingredient_norm} ${row.deal_norm}`;
    if (wanted.has(key)) map.set(key, { verdict: row.verdict, reason: row.reason });
  }
  return map;
}

/** Bulk-insert verdicts: [{ingredientNorm, dealNorm, verdict, reason, model}]. */
async function saveMatchEdges(edges) {
  await _autoMigrate;
  if (!edges.length) return 0;
  const values = [];
  const params = [];
  edges.forEach((e, i) => {
    const base = i * 5;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3}, $${base + 4}, $${base + 5})`);
    params.push(e.ingredientNorm, e.dealNorm, e.verdict, e.reason ?? null, e.model ?? null);
  });
  await pool.query(`
    INSERT INTO match_edges (ingredient_norm, deal_norm, verdict, reason, model)
    VALUES ${values.join(', ')}
    ON CONFLICT (ingredient_norm, deal_norm) DO UPDATE
      SET verdict = EXCLUDED.verdict, reason = EXCLUDED.reason,
          model = EXCLUDED.model, decided_at = CURRENT_TIMESTAMP
  `, params);
  return edges.length;
}

// ── Recipe Meta (one-time cost estimates) ─────────────────────────────────────

/** Bulk-fetch cost estimates. Returns Map recipe_key → total_estimated_cost. */
async function getRecipeCosts(keys) {
  await _autoMigrate;
  if (!keys.length) return new Map();
  const result = await pool.query(
    'SELECT recipe_key, total_estimated_cost FROM recipe_meta WHERE recipe_key = ANY($1)',
    [keys]
  );
  return new Map(result.rows.map(r => [r.recipe_key, r.total_estimated_cost]));
}

/** Bulk-upsert cost estimates: [{recipeKey, cost, model}]. */
async function saveRecipeCosts(rows) {
  await _autoMigrate;
  if (!rows.length) return 0;
  const values = [];
  const params = [];
  rows.forEach((r, i) => {
    const base = i * 3;
    values.push(`($${base + 1}, $${base + 2}, $${base + 3})`);
    params.push(r.recipeKey, r.cost, r.model ?? null);
  });
  await pool.query(`
    INSERT INTO recipe_meta (recipe_key, total_estimated_cost, model)
    VALUES ${values.join(', ')}
    ON CONFLICT (recipe_key) DO UPDATE
      SET total_estimated_cost = EXCLUDED.total_estimated_cost,
          model = EXCLUDED.model, estimated_at = CURRENT_TIMESTAMP
  `, params);
  return rows.length;
}

// ── Per-State Artifacts ───────────────────────────────────────────────────────

/** Upsert one state's deal artifact: {state, deals, missingRetailers, fetchedAt}. */
async function saveStateDeals(state, data) {
  await _autoMigrate;
  await pool.query(`
    INSERT INTO state_deals_cache (state, data)
    VALUES ($1, $2)
    ON CONFLICT (state) DO UPDATE
      SET data = EXCLUDED.data, fetched_at = CURRENT_TIMESTAMP
  `, [state, JSON.stringify(data)]);
}

async function getStateDeals(state) {
  await _autoMigrate;
  const result = await pool.query(
    'SELECT data, fetched_at FROM state_deals_cache WHERE state = $1', [state]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    data:      typeof row.data === 'string' ? JSON.parse(row.data) : row.data,
    fetchedAt: row.fetched_at,
  };
}

/** Upsert one state's weekly recipe artifact. */
async function saveStateRecipes(state, recipes, dealCount = 0) {
  await _autoMigrate;
  await pool.query(`
    INSERT INTO state_recipes_cache (state, recipes, deal_count)
    VALUES ($1, $2, $3)
    ON CONFLICT (state) DO UPDATE
      SET recipes = EXCLUDED.recipes, deal_count = EXCLUDED.deal_count,
          generated_at = CURRENT_TIMESTAMP
  `, [state, JSON.stringify(recipes), dealCount]);
}

async function getStateRecipes(state) {
  await _autoMigrate;
  const result = await pool.query(
    'SELECT recipes, deal_count, generated_at FROM state_recipes_cache WHERE state = $1', [state]
  );
  if (!result.rows[0]) return null;
  const row = result.rows[0];
  return {
    recipes:     typeof row.recipes === 'string' ? JSON.parse(row.recipes) : row.recipes,
    dealCount:   row.deal_count,
    generatedAt: row.generated_at,
  };
}

// ── Outbound Clicks (publisher lead-gen receipts) ─────────────────────────────

/** Increment today's outbound-click counter for a publisher source. */
async function recordOutboundClick(source) {
  await _autoMigrate;
  await pool.query(`
    INSERT INTO outbound_clicks (source, day, clicks)
    VALUES ($1, CURRENT_DATE, 1)
    ON CONFLICT (source, day) DO UPDATE SET clicks = outbound_clicks.clicks + 1
  `, [source]);
}

/** Per-source click totals (all time + last 30 days). */
async function getOutboundClickStats() {
  await _autoMigrate;
  const result = await pool.query(`
    SELECT source,
           SUM(clicks)::int AS total,
           SUM(clicks) FILTER (WHERE day >= CURRENT_DATE - 30)::int AS last_30_days
    FROM outbound_clicks GROUP BY source ORDER BY total DESC
  `);
  return result.rows;
}

// ── Utilities ─────────────────────────────────────────────────────────────────

async function getStats() {
  const [products, aliases] = await Promise.all([countProducts(), countAliases()]);
  return { products, aliases };
}

module.exports = {
  getDb,
  closeDb,
  initSchema,
  saveWeeklyRecipes,
  getWeeklyRecipes,
  saveDealsCache,
  getDealsCache,
  getMatchEdges,
  saveMatchEdges,
  getRecipeCosts,
  saveRecipeCosts,
  saveStateDeals,
  getStateDeals,
  saveStateRecipes,
  getStateRecipes,
  recordOutboundClick,
  getOutboundClickStats,
  insertProduct,
  insertProductBatch,
  getProductById,
  getProductByBarcode,
  getProductByNormalizedName,
  getProductsByNormalizedNameLike,
  getProductsByNormalizedNames,
  incrementTimesMatched,
  countProducts,
  insertAlias,
  getAlias,
  getAliasesByNormalizedNames,
  countAliases,
  recordMatch,
  getMatchStats,
  getStats,
};
