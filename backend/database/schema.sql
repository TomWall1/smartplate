-- SmartPlate Product Intelligence Database Schema
-- SQLite

PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

-- ── Products ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                    INTEGER PRIMARY KEY AUTOINCREMENT,
  barcode               TEXT UNIQUE,
  name                  TEXT NOT NULL,
  normalized_name       TEXT NOT NULL,
  brand                 TEXT,
  size                  TEXT,

  -- Categorization
  product_type          TEXT,
  base_ingredient       TEXT,
  category              TEXT,
  sub_category          TEXT,
  processing_level      TEXT CHECK(processing_level IN ('unprocessed','minimally_processed','processed','ultra_processed')),
  is_hero_ingredient    INTEGER NOT NULL DEFAULT 0,  -- 1 if it's the star ingredient (e.g. "chicken breast" yes, "chicken stock" no)
  typical_use_case      TEXT,
  purchase_reasonability TEXT,

  -- Satisfies ingredients (JSON array of ingredient names this product can fulfil in a recipe)
  satisfies_ingredients TEXT NOT NULL DEFAULT '[]',

  -- Source tracking
  source                TEXT CHECK(source IN ('open_food_facts','woolworths','coles','iga','claude','manual')),
  woolworths_id         TEXT,
  coles_id              TEXT,

  -- Analytics
  times_matched         INTEGER NOT NULL DEFAULT 0,
  last_seen_on_sale     TEXT,  -- ISO date string

  created_at            TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at            TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Product Aliases ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_aliases (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  normalized  TEXT NOT NULL,
  source      TEXT CHECK(source IN ('manual','fuzzy_match','normalized_match','barcode')),
  created_at  TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE(normalized)
);

-- ── Match History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_history (
  id          INTEGER PRIMARY KEY AUTOINCREMENT,
  deal_name   TEXT NOT NULL,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  match_type  TEXT CHECK(match_type IN ('exact','alias','normalized','fuzzy','barcode','claude','none')),
  store       TEXT,
  matched_at  TEXT NOT NULL DEFAULT (datetime('now'))
);

-- ── Weekly Recipes Cache ──────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS weekly_recipes_cache (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  recipes      TEXT     NOT NULL,  -- JSON array
  generated_at TEXT     NOT NULL DEFAULT (datetime('now')),
  deal_count   INTEGER  NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_weekly_recipes_generated_at ON weekly_recipes_cache(generated_at DESC);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_normalized_name  ON products(normalized_name);
CREATE INDEX IF NOT EXISTS idx_products_barcode          ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_base_ingredient  ON products(base_ingredient);
CREATE INDEX IF NOT EXISTS idx_products_category         ON products(category);
CREATE INDEX IF NOT EXISTS idx_aliases_normalized        ON product_aliases(normalized);
CREATE INDEX IF NOT EXISTS idx_aliases_product_id        ON product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_match_history_deal_name   ON match_history(deal_name);
CREATE INDEX IF NOT EXISTS idx_match_history_matched_at  ON match_history(matched_at);

-- ── Triggers (auto-update updated_at) ────────────────────────────────────────

CREATE TRIGGER IF NOT EXISTS products_updated_at
  AFTER UPDATE ON products
  FOR EACH ROW
BEGIN
  UPDATE products SET updated_at = datetime('now') WHERE id = NEW.id;
END;
