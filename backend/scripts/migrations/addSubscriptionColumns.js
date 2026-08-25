/**
 * Migration: subscription entitlement columns + webhook idempotency table.
 *
 * Run with:  node backend/scripts/migrations/addSubscriptionColumns.js
 *
 * Idempotent — safe to re-run.
 * Requires DATABASE_URL in backend/.env
 *
 * Why: `users.is_premium` was a sticky boolean set by hand from the admin page.
 * Once real money is involved it needs an expiry, or a user who cancels or is
 * refunded stays premium forever. `premium_expires_at` NULL means "no expiry" —
 * that preserves manually comped accounts (admin grants, the App Review
 * demo account) which must not be swept up by subscription lifecycle events.
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const { Pool } = require('pg');
const { stamp } = require('../../database/schemaMigrations');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('Missing DATABASE_URL — add it to your .env file');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

const DDL = `
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_expires_at TIMESTAMPTZ;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_source     TEXT;
ALTER TABLE users ADD COLUMN IF NOT EXISTS premium_product_id TEXT;

-- Existing premium accounts predate any subscription, so they are manual
-- grants: NULL expiry (never lapses), source 'admin'.
UPDATE users SET premium_source = 'admin'
 WHERE is_premium = TRUE AND premium_source IS NULL;

CREATE INDEX IF NOT EXISTS idx_users_premium_expires_at
  ON users (premium_expires_at)
  WHERE premium_expires_at IS NOT NULL;

-- Webhook replay guard. RevenueCat and Apple both retry delivery, and a
-- replayed REFUND after a re-purchase would otherwise revoke a live
-- subscription. Primary key on the provider's event id makes the insert itself
-- the idempotency check.
CREATE TABLE IF NOT EXISTS subscription_events (
  event_id     TEXT         PRIMARY KEY,
  user_id      UUID,
  event_type   TEXT         NOT NULL,
  store        TEXT,
  payload      JSONB        NOT NULL,
  received_at  TIMESTAMPTZ  NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_subscription_events_user_id
  ON subscription_events (user_id);
`;

async function run() {
  const client = await pool.connect();
  try {
    console.log('Running migration: addSubscriptionColumns...');
    await client.query(DDL);
    console.log('✓ users.premium_expires_at / premium_source / premium_product_id ready');
    console.log('✓ subscription_events table ready');
    await stamp(client, 'addSubscriptionColumns');
    console.log("  stamped 'addSubscriptionColumns' in schema_migrations");
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(err => {
  console.error('Migration failed:', err.message);
  process.exit(1);
});
