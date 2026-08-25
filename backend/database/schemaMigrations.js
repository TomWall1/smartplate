/**
 * database/schemaMigrations.js
 *
 * Tracks which migrations have actually been applied to a database, and says
 * so at boot.
 *
 * Why this exists: migrations here are run by hand — some as `node
 * backend/scripts/migrations/<name>.js`, some pasted into the Supabase SQL
 * editor from `backend/migrations/*.sql`. Nothing recorded whether one had
 * run, and three production bugs came from that. Each surfaced as a mystery
 * days or weeks later:
 *
 *   - users RLS policies missing  → first-time Google sign-in returned 500
 *   - addSubscriptionColumns      → every premium user read as free
 *
 * A migration that silently never ran is indistinguishable from a code bug
 * until you go and look at the schema, so the fix is to make the gap visible
 * on every boot instead of at the moment it breaks something.
 *
 * The check is advisory: it logs, it never blocks startup and never migrates
 * anything itself. Applying a migration stays a deliberate act.
 */

const fs = require('fs');
const path = require('path');

const SQL_DIR = path.join(__dirname, '..', 'migrations');
const JS_DIR = path.join(__dirname, '..', 'scripts', 'migrations');

const TABLE_DDL = `
CREATE TABLE IF NOT EXISTS schema_migrations (
  name        TEXT        PRIMARY KEY,
  applied_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);`;

/**
 * Data scripts that live alongside the migrations but do not change the
 * schema. They are re-runnable by design, so "outstanding" means nothing for
 * them and listing them would be noise.
 */
const NOT_SCHEMA = new Set(['renormalizeNames']);

/** Every migration this checkout knows about, from both directories. */
function listExpected() {
  const read = (dir, ext) => {
    try {
      return fs
        .readdirSync(dir)
        .filter((f) => f.endsWith(ext) && !f.startsWith('_'))
        .map((f) => f.slice(0, -ext.length));
    } catch {
      return []; // directory absent in a partial checkout — not fatal
    }
  };
  return [...read(SQL_DIR, '.sql'), ...read(JS_DIR, '.js')]
    .filter((name) => !NOT_SCHEMA.has(name))
    .sort();
}

/** Create the ledger if it is not there yet. Safe to call repeatedly. */
async function ensureTable(client) {
  await client.query(TABLE_DDL);
}

/**
 * Record a migration as applied. Call from inside a migration script AFTER its
 * DDL has succeeded — stamping first would leave a permanent lie behind if the
 * DDL then failed.
 */
async function stamp(client, name) {
  await ensureTable(client);
  await client.query(
    'INSERT INTO schema_migrations (name) VALUES ($1) ON CONFLICT (name) DO NOTHING',
    [name]
  );
}

/** Names already recorded as applied. */
async function listApplied(client) {
  await ensureTable(client);
  const { rows } = await client.query('SELECT name FROM schema_migrations');
  return rows.map((r) => r.name);
}

/**
 * Boot-time report. Never throws and never blocks: a database that is
 * unreachable, or a checkout without DATABASE_URL, simply logs and moves on.
 */
async function reportOutstanding() {
  if (!process.env.DATABASE_URL) return null;

  const { Pool } = require('pg');
  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: { rejectUnauthorized: false },
    max: 1,
    connectionTimeoutMillis: 8000,
  });

  try {
    const client = await pool.connect();
    try {
      const expected = listExpected();
      const applied = new Set(await listApplied(client));
      const outstanding = expected.filter((name) => !applied.has(name));

      if (outstanding.length === 0) {
        console.log(`[Migrations] ${expected.length} migrations, all applied`);
      } else {
        console.warn(
          `[Migrations] ${outstanding.length} of ${expected.length} NOT recorded as applied:`
        );
        for (const name of outstanding) {
          const how = fs.existsSync(path.join(JS_DIR, `${name}.js`))
            ? `node backend/scripts/migrations/${name}.js`
            : `paste backend/migrations/${name}.sql into the Supabase SQL editor`;
          console.warn(`[Migrations]   - ${name}  →  ${how}`);
        }
        console.warn(
          '[Migrations] If one of these was applied before stamping existed, ' +
            "record it with:  INSERT INTO schema_migrations (name) VALUES ('<name>');"
        );
      }
      return outstanding;
    } finally {
      client.release();
    }
  } catch (err) {
    console.warn(`[Migrations] check skipped: ${err.message}`);
    return null;
  } finally {
    await pool.end().catch(() => {});
  }
}

module.exports = { TABLE_DDL, ensureTable, stamp, listApplied, listExpected, reportOutstanding };
