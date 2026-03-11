-- SmartPlate Product Intelligence Database Schema
-- PostgreSQL (Supabase)

-- ── Products ──────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS products (
  id                     SERIAL PRIMARY KEY,
  barcode                TEXT UNIQUE,
  name                   TEXT NOT NULL,
  normalized_name        TEXT NOT NULL,
  brand                  TEXT,
  size                   TEXT,

  -- Categorization
  product_type           TEXT,
  base_ingredient        TEXT,
  category               TEXT,
  sub_category           TEXT,
  processing_level       TEXT CHECK(processing_level IN ('unprocessed','minimally_processed','processed','ultra_processed')),
  is_hero_ingredient     INTEGER NOT NULL DEFAULT 0,
  typical_use_case       TEXT,
  purchase_reasonability TEXT,

  -- Satisfies ingredients (JSON array stored as TEXT)
  satisfies_ingredients  TEXT NOT NULL DEFAULT '[]',

  -- Source tracking
  source                 TEXT CHECK(source IN ('open_food_facts','woolworths','coles','iga','claude','manual')),
  woolworths_id          TEXT,
  coles_id               TEXT,

  -- Analytics
  times_matched          INTEGER NOT NULL DEFAULT 0,
  last_seen_on_sale      TEXT,

  created_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at             TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Product Aliases ───────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS product_aliases (
  id          SERIAL PRIMARY KEY,
  product_id  INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias       TEXT NOT NULL,
  normalized  TEXT NOT NULL,
  source      TEXT CHECK(source IN ('manual','fuzzy_match','normalized_match','barcode')),
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(normalized)
);

-- ── Match History ─────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS match_history (
  id          SERIAL PRIMARY KEY,
  deal_name   TEXT NOT NULL,
  product_id  INTEGER REFERENCES products(id) ON DELETE SET NULL,
  match_type  TEXT CHECK(match_type IN ('exact','alias','normalized','fuzzy','barcode','claude','none')),
  store       TEXT,
  matched_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- ── Indexes ───────────────────────────────────────────────────────────────────

CREATE INDEX IF NOT EXISTS idx_products_normalized_name ON products(normalized_name);
CREATE INDEX IF NOT EXISTS idx_products_barcode         ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_products_base_ingredient ON products(base_ingredient);
CREATE INDEX IF NOT EXISTS idx_products_category        ON products(category);
CREATE INDEX IF NOT EXISTS idx_aliases_normalized       ON product_aliases(normalized);
CREATE INDEX IF NOT EXISTS idx_aliases_product_id       ON product_aliases(product_id);
CREATE INDEX IF NOT EXISTS idx_match_history_deal_name  ON match_history(deal_name);
CREATE INDEX IF NOT EXISTS idx_match_history_matched_at ON match_history(matched_at);
