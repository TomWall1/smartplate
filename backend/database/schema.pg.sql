-- PostgreSQL schema for SmartPlate Product Intelligence Database
-- Supabase compatible

CREATE TABLE IF NOT EXISTS products (
  id SERIAL PRIMARY KEY,
  barcode TEXT UNIQUE,
  name TEXT NOT NULL,
  normalized_name TEXT NOT NULL,
  brand TEXT,
  
  -- Store identifiers
  woolworths_stockcode INTEGER,
  coles_product_id TEXT,
  
  -- Product categorization
  product_type TEXT NOT NULL,
  base_ingredient TEXT NOT NULL,
  category TEXT NOT NULL,
  processing_level TEXT NOT NULL,
  is_hero_ingredient BOOLEAN NOT NULL,
  typical_use_case TEXT,
  purchase_reasonability TEXT,
  satisfies_ingredients JSONB NOT NULL,
  
  -- Metadata
  source TEXT NOT NULL,
  confidence REAL NOT NULL,
  
  -- Usage tracking
  first_seen TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen TIMESTAMP,
  times_matched INTEGER DEFAULT 0,
  
  -- Timestamps
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_normalized_name ON products(normalized_name);
CREATE INDEX IF NOT EXISTS idx_barcode ON products(barcode);
CREATE INDEX IF NOT EXISTS idx_base_ingredient ON products(base_ingredient);
CREATE INDEX IF NOT EXISTS idx_category ON products(category);

CREATE TABLE IF NOT EXISTS product_aliases (
  id SERIAL PRIMARY KEY,
  product_id INTEGER NOT NULL REFERENCES products(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  source TEXT,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(product_id, alias)
);

CREATE INDEX IF NOT EXISTS idx_alias ON product_aliases(alias);

CREATE TABLE IF NOT EXISTS match_history (
  id SERIAL PRIMARY KEY,
  deal_name TEXT NOT NULL,
  product_id INTEGER REFERENCES products(id),
  match_type TEXT,
  confidence REAL,
  matched_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_match_history_date ON match_history(matched_at);