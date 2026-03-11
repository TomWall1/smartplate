/**
 * PostgreSQL adapter (production)
 * Provides same API as SQLite adapter but using async PostgreSQL
 */

const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: process.env.NODE_ENV === 'production' ? { rejectUnauthorized: false } : false
});

let _initialized = false;

// ── Connection & Migration ────────────────────────────────────────────────────

async function initialize() {
  if (_initialized) return;
  
  try {
    // Test connection
    const client = await pool.connect();
    client.release();
    
    // Run migration if needed
    await migrate();
    
    _initialized = true;
    console.log('[DB] PostgreSQL initialized');
  } catch (err) {
    console.error('[DB] PostgreSQL initialization error:', err.message);
    throw err;
  }
}

async function migrate() {
  try {
    const schema = fs.readFileSync(
      path.join(__dirname, 'schema.pg.sql'),
      'utf8'
    );
    await query(schema);
  } catch (err) {
    // Migration might fail if tables already exist, that's okay
    console.log('[DB] Migration skipped (tables may already exist)');
  }
}

async function query(text, params = []) {
  const client = await pool.connect();
  try {
    const res = await client.query(text, params);
    return res;
  } finally {
    client.release();
  }
}

async function closeDb() {
  await pool.end();
}

// ── Products ──────────────────────────────────────────────────────────────────

async function insertProduct(product) {
  const sql = `
    INSERT INTO products (
      barcode, name, normalized_name, brand,
      product_type, base_ingredient, category,
      processing_level, is_hero_ingredient, typical_use_case,
      purchase_reasonability, satisfies_ingredients, source,
      woolworths_stockcode, coles_product_id, confidence
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16
    )
    ON CONFLICT (barcode) DO UPDATE SET
      name = EXCLUDED.name,
      normalized_name = EXCLUDED.normalized_name,
      brand = EXCLUDED.brand,
      product_type = EXCLUDED.product_type,
      base_ingredient = EXCLUDED.base_ingredient,
      category = EXCLUDED.category,
      processing_level = EXCLUDED.processing_level,
      is_hero_ingredient = EXCLUDED.is_hero_ingredient,
      typical_use_case = EXCLUDED.typical_use_case,
      purchase_reasonability = EXCLUDED.purchase_reasonability,
      satisfies_ingredients = EXCLUDED.satisfies_ingredients,
      source = EXCLUDED.source,
      woolworths_stockcode = COALESCE(EXCLUDED.woolworths_stockcode, products.woolworths_stockcode),
      coles_product_id = COALESCE(EXCLUDED.coles_product_id, products.coles_product_id),
      confidence = EXCLUDED.confidence,
      updated_at = CURRENT_TIMESTAMP
    RETURNING id
  `;
  
  const result = await query(sql, [
    product.barcode ?? null,
    product.name,
    product.normalized_name,
    product.brand ?? null,
    product.product_type ?? null,
    product.base_ingredient ?? null,
    product.category ?? null,
    product.processing_level ?? null,
    product.is_hero_ingredient ?? false,
    product.typical_use_case ?? null,
    product.purchase_reasonability ?? null,
    JSON.stringify(product.satisfies_ingredients ?? []),
    product.source ?? null,
    product.woolworths_stockcode ?? null,
    product.coles_product_id ?? null,
    product.confidence ?? 1.0
  ]);
  
  return result.rows[0];
}

async function insertProductBatch(products) {
  if (products.length === 0) return { inserted: 0, updated: 0 };
  
  let inserted = 0;
  let updated = 0;
  
  for (const p of products) {
    try {
      await insertProduct(p);
      inserted++;
    } catch (err) {
      console.error('[DB] Insert error:', err.message);
    }
  }
  
  return { inserted, updated };
}

async function getProductById(id) {
  const result = await query('SELECT * FROM products WHERE id = $1', [id]);
  return result.rows[0] ? deserializeProduct(result.rows[0]) : null;
}

async function getProductByBarcode(barcode) {
  if (!barcode) return null;
  const result = await query('SELECT * FROM products WHERE barcode = $1', [barcode]);
  return result.rows[0] ? deserializeProduct(result.rows[0]) : null;
}

async function getProductByNormalizedName(normalized) {
  const result = await query('SELECT * FROM products WHERE normalized_name = $1', [normalized]);
  return result.rows[0] ? deserializeProduct(result.rows[0]) : null;
}

async function getProductsByNormalizedNameLike(normalized) {
  const result = await query(
    'SELECT * FROM products WHERE normalized_name LIKE $1 LIMIT 20',
    [`%${normalized}%`]
  );
  return result.rows.map(deserializeProduct);
}

async function incrementTimesMatched(productId) {
  await query(
    'UPDATE products SET times_matched = times_matched + 1, updated_at = CURRENT_TIMESTAMP WHERE id = $1',
    [productId]
  );
}

async function countProducts() {
  const result = await query('SELECT COUNT(*) AS count FROM products');
  return parseInt(result.rows[0].count);
}

// ── Aliases ───────────────────────────────────────────────────────────────────

async function insertAlias(productId, alias, source = 'manual') {
  try {
    await query(
      'INSERT INTO product_aliases (product_id, alias, source) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING',
      [productId, alias, source]
    );
  } catch (err) {
    // Ignore duplicate errors
  }
}

async function getAlias(normalizedAlias) {
  const result = await query(`
    SELECT pa.*, p.*
    FROM product_aliases pa
    JOIN products p ON p.id = pa.product_id
    WHERE pa.alias = $1
    LIMIT 1
  `, [normalizedAlias]);
  
  return result.rows[0] ? deserializeProduct(result.rows[0]) : null;
}

async function countAliases() {
  const result = await query('SELECT COUNT(*) AS count FROM product_aliases');
  return parseInt(result.rows[0].count);
}

// ── Match History ─────────────────────────────────────────────────────────────

async function recordMatch(dealName, productId, matchType, store = null) {
  try {
    await query(
      'INSERT INTO match_history (deal_name, product_id, match_type) VALUES ($1, $2, $3)',
      [dealName, productId ?? null, matchType]
    );
    
    if (productId) {
      await incrementTimesMatched(productId);
    }
  } catch (err) {
    console.error('[DB] recordMatch error:', err.message);
  }
}

async function getMatchStats() {
  const totalResult = await query('SELECT COUNT(*) AS count FROM match_history');
  const total = parseInt(totalResult.rows[0].count);
  
  const byTypeResult = await query(`
    SELECT match_type, COUNT(*) AS count 
    FROM match_history 
    GROUP BY match_type 
    ORDER BY count DESC
  `);
  
  const byType = byTypeResult.rows.map(row => ({
    match_type: row.match_type,
    n: parseInt(row.count)
  }));
  
  return { total, byType };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function deserializeProduct(row) {
  if (!row) return null;
  
  return {
    ...row,
    satisfies_ingredients: typeof row.satisfies_ingredients === 'string' 
      ? JSON.parse(row.satisfies_ingredients)
      : row.satisfies_ingredients,
    is_hero_ingredient: Boolean(row.is_hero_ingredient),
    times_matched: parseInt(row.times_matched || 0)
  };
}

async function getStats() {
  return {
    products: await countProducts(),
    aliases: await countAliases(),
  };
}

async function batchInsert(table, records) {
  if (records.length === 0) return;
  
  const columns = Object.keys(records[0]);
  const values = records.map(r => columns.map(c => r[c]));
  
  // Build parameterized query
  const placeholders = values.map((_, i) => 
    `(${columns.map((_, j) => `$${i * columns.length + j + 1}`).join(', ')})`
  ).join(', ');
  
  const flatValues = values.flat();
  const sql = `INSERT INTO ${table} (${columns.join(', ')}) VALUES ${placeholders} ON CONFLICT DO NOTHING`;
  
  await query(sql, flatValues);
}

// Initialize on module load
initialize().catch(err => console.error('[DB] Failed to initialize:', err));

module.exports = {
  query,
  closeDb,
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
  batchInsert,
};
