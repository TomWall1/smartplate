/**
 * Migration: Add premium tables to production Supabase database.
 *
 * Run with:  node backend/scripts/migrations/addPremiumTables.js
 *
 * Requires DATABASE_URL (postgres connection string) in your .env
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL — add it to your .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const migration = `
-- Create users table if it doesn't exist (mirrors Supabase auth.users)
CREATE TABLE IF NOT EXISTS users (
  id             UUID        PRIMARY KEY,
  email          TEXT        NOT NULL UNIQUE,
  selected_store TEXT,
  created_at     TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Add premium columns (safe to run even if columns already exist)
ALTER TABLE users ADD COLUMN IF NOT EXISTS is_premium    BOOLEAN   NOT NULL DEFAULT FALSE;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_since TIMESTAMP;

-- Favorites
CREATE TABLE IF NOT EXISTS favorite_recipes (
  id          SERIAL PRIMARY KEY,
  user_id     UUID        NOT NULL,
  recipe_id   TEXT        NOT NULL,
  recipe_data JSONB,
  saved_at    TIMESTAMP   NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, recipe_id)
);
CREATE INDEX IF NOT EXISTS idx_favorites_user_id  ON favorite_recipes(user_id);
CREATE INDEX IF NOT EXISTS idx_favorites_saved_at ON favorite_recipes(saved_at DESC);

-- Meal Plans
CREATE TABLE IF NOT EXISTS meal_plans (
  id          SERIAL PRIMARY KEY,
  user_id     UUID      NOT NULL,
  date        DATE      NOT NULL,
  meal_type   TEXT      NOT NULL CHECK(meal_type IN ('breakfast','lunch','dinner')),
  recipe_id   TEXT      NOT NULL,
  recipe_data JSONB,
  created_at  TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(user_id, date, meal_type)
);
CREATE INDEX IF NOT EXISTS idx_meal_plans_user_id ON meal_plans(user_id);
CREATE INDEX IF NOT EXISTS idx_meal_plans_date    ON meal_plans(date);

-- Shopping Lists
CREATE TABLE IF NOT EXISTS shopping_lists (
  id         SERIAL PRIMARY KEY,
  user_id    UUID      NOT NULL,
  name       TEXT      NOT NULL DEFAULT 'My Shopping List',
  items      JSONB     NOT NULL DEFAULT '[]',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_shopping_lists_user_id ON shopping_lists(user_id);

-- Price History
CREATE TABLE IF NOT EXISTS price_history (
  id             SERIAL PRIMARY KEY,
  product_name   TEXT          NOT NULL,
  store          TEXT          NOT NULL,
  price          NUMERIC(10,2) NOT NULL,
  original_price NUMERIC(10,2),
  recorded_at    TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_history_product     ON price_history(product_name, store);
CREATE INDEX IF NOT EXISTS idx_price_history_recorded_at ON price_history(recorded_at DESC);

-- Price Alerts
CREATE TABLE IF NOT EXISTS price_alerts (
  id           SERIAL PRIMARY KEY,
  user_id      UUID          NOT NULL,
  product_name TEXT          NOT NULL,
  target_price NUMERIC(10,2) NOT NULL,
  store        TEXT,
  active       BOOLEAN       NOT NULL DEFAULT TRUE,
  created_at   TIMESTAMP     NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_price_alerts_user_id ON price_alerts(user_id);
`;

async function migrate() {
  console.log('Connecting to database...');
  const client = await pool.connect();
  try {
    console.log('Running premium tables migration...');
    await client.query(migration);
    console.log('✅ Migration complete!');
    console.log('');
    console.log('Tables created/updated:');
    console.log('  • users (added is_premium, premium_since columns)');
    console.log('  • favorite_recipes');
    console.log('  • meal_plans');
    console.log('  • shopping_lists');
    console.log('  • price_history');
    console.log('  • price_alerts');
  } catch (err) {
    console.error('❌ Migration failed:', err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
