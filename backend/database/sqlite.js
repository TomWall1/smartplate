/**
 * database/sqlite.js
 * SQLite connection wrapper using better-sqlite3.
 * Singleton — all callers share the same connection.
 * Used for local development. Production uses pg.js.
 */

const Database = require('better-sqlite3');
const path     = require('path');
const fs       = require('fs');

const DB_PATH     = path.join(__dirname, 'products.db');
const SCHEMA_PATH = path.join(__dirname, 'schema.sql');

let _db = null;

// ── Connection ────────────────────────────────────────────────────────────────

function getDb() {
  if (_db) return _db;

  _db = new Database(DB_PATH);
  _db.pragma('journal_mode = WAL');
  _db.pragma('foreign_keys = ON');

  // Run schema migrations on first open
  const schema = fs.readFileSync(SCHEMA_PATH, 'utf8');
  _db.exec(schema);

  console.log(`[DB] Opened: ${DB_PATH}`);
  return _db;
}

function closeDb() {
  if (_db) {
    _db.close();
    _db = null;
  }
}

// ── Products ──────────────────────────────────────────────────────────────────

function insertProduct(product) {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO products (
      barcode, name, normalized_name, brand, size,
      product_type, base_ingredient, category, sub_category,
      processing_level, is_hero_ingredient, typical_use_case,
      purchase_reasonability, satisfies_ingredients, source,
      woolworths_id, coles_id
    ) VALUES (
      @barcode, @name, @normalized_name, @brand, @size,
      @product_type, @base_ingredient, @category, @sub_category,
      @processing_level, @is_hero_ingredient, @typical_use_case,
      @purchase_reasonability, @satisfies_ingredients, @source,
      @woolworths_id, @coles_id
    )
    ON CONFLICT(barcode) DO UPDATE SET
      name                  = excluded.name,
      normalized_name       = excluded.normalized_name,
      brand                 = excluded.brand,
      size                  = excluded.size,
      product_type          = excluded.product_type,
      base_ingredient       = excluded.base_ingredient,
      category              = excluded.category,
      sub_category          = excluded.sub_category,
      processing_level      = excluded.processing_level,
      is_hero_ingredient    = excluded.is_hero_ingredient,
      typical_use_case      = excluded.typical_use_case,
      purchase_reasonability = excluded.purchase_reasonability,
      satisfies_ingredients = excluded.satisfies_ingredients,
      source                = excluded.source,
      woolworths_id         = COALESCE(excluded.woolworths_id, woolworths_id),
      coles_id              = COALESCE(excluded.coles_id, coles_id),
      updated_at            = datetime('now')
  `);
  return stmt.run({
    barcode:                product.barcode               ?? null,
    name:                   product.name,
    normalized_name:        product.normalized_name,
    brand:                  product.brand                 ?? null,
    size:                   product.size                  ?? null,
    product_type:           product.product_type          ?? null,
    base_ingredient:        product.base_ingredient       ?? null,
    category:               product.category              ?? null,
    sub_category:           product.sub_category          ?? null,
    processing_level:       product.processing_level      ?? null,
    is_hero_ingredient:     product.is_hero_ingredient ? 1 : 0,
    typical_use_case:       product.typical_use_case      ?? null,
    purchase_reasonability: product.purchase_reasonability ?? null,
    satisfies_ingredients:  JSON.stringify(product.satisfies_ingredients ?? []),
    source:                 product.source                ?? null,
    woolworths_id:          product.woolworths_id         ?? null,
    coles_id:               product.coles_id              ?? null,
  });
}

function insertProductBatch(products) {
  const db = getDb();
  const insert = db.transaction((rows) => {
    let inserted = 0;
    let updated  = 0;
    for (const p of rows) {
      const result = insertProduct(p);
      if (result.changes > 0) {
        if (result.lastInsertRowid > 0) inserted++;
        else updated++;
      }
    }
    return { inserted, updated };
  });
  return insert(products);
}

function getProductById(id) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE id = ?').get(id);
  return row ? deserializeProduct(row) : null;
}

function getProductByBarcode(barcode) {
  if (!barcode) return null;
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE barcode = ?').get(barcode);
  return row ? deserializeProduct(row) : null;
}

function getProductByNormalizedName(normalized) {
  const db = getDb();
  const row = db.prepare('SELECT * FROM products WHERE normalized_name = ?').get(normalized);
  return row ? deserializeProduct(row) : null;
}

function getProductsByNormalizedNameLike(normalized) {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM products WHERE normalized_name LIKE ? LIMIT 20').all(`%${normalized}%`);
  return rows.map(deserializeProduct);
}

function incrementTimesMatched(productId) {
  getDb().prepare('UPDATE products SET times_matched = times_matched + 1, updated_at = datetime(\'now\') WHERE id = ?').run(productId);
}

function countProducts() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM products').get().n;
}

// ── Aliases ───────────────────────────────────────────────────────────────────

function insertAlias(productId, alias, normalized, source = 'manual') {
  try {
    getDb().prepare(`
      INSERT OR IGNORE INTO product_aliases (product_id, alias, normalized, source)
      VALUES (?, ?, ?, ?)
    `).run(productId, alias, normalized, source);
  } catch {
    // Ignore duplicate alias errors
  }
}

function getAlias(normalized) {
  const db = getDb();
  const row = db.prepare(`
    SELECT pa.*, p.*
    FROM product_aliases pa
    JOIN products p ON p.id = pa.product_id
    WHERE pa.normalized = ?
  `).get(normalized);
  return row ? deserializeProduct(row) : null;
}

function countAliases() {
  return getDb().prepare('SELECT COUNT(*) AS n FROM product_aliases').get().n;
}

// ── Match History ─────────────────────────────────────────────────────────────

function recordMatch(dealName, productId, matchType, store = null) {
  try {
    getDb().prepare(`
      INSERT INTO match_history (deal_name, product_id, match_type, store)
      VALUES (?, ?, ?, ?)
    `).run(dealName, productId ?? null, matchType, store);

    if (productId) incrementTimesMatched(productId);
  } catch (err) {
    console.error('[DB] recordMatch error:', err.message);
  }
}

function getMatchStats() {
  const db = getDb();
  const total = db.prepare('SELECT COUNT(*) AS n FROM match_history').get().n;
  const byType = db.prepare(`
    SELECT match_type, COUNT(*) AS n FROM match_history GROUP BY match_type ORDER BY n DESC
  `).all();
  return { total, byType };
}

// ── Utilities ─────────────────────────────────────────────────────────────────

function deserializeProduct(row) {
  if (!row) return null;
  return {
    ...row,
    satisfies_ingredients: JSON.parse(row.satisfies_ingredients || '[]'),
    is_hero_ingredient:    row.is_hero_ingredient === 1,
  };
}

function getStats() {
  return {
    products: countProducts(),
    aliases:  countAliases(),
  };
}

module.exports = {
  getDb,
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
};
