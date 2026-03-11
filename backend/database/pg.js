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

// ── Utilities ─────────────────────────────────────────────────────────────────

async function getStats() {
  const [products, aliases] = await Promise.all([countProducts(), countAliases()]);
  return { products, aliases };
}

module.exports = {
  getDb,
  closeDb,
  initSchema,
  insertProduct,
  insertProductBatch,
  getProductById,
  getProductByBarcode,
  getProductByNormalizedName,
  getProductsByNormalizedNameLike,
  incrementTimesMatched,
  countProducts,
  insertAlias,
  getAlias,
  countAliases,
  recordMatch,
  getMatchStats,
  getStats,
};
