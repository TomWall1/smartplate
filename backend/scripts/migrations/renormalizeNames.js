#!/usr/bin/env node
/**
 * renormalizeNames.js
 *
 * Recomputes products.normalized_name and product_aliases.normalized using
 * the current lib/normalize.js. Run whenever the normalizer's strip-lists
 * change, otherwise stored keys stop matching runtime lookups and the
 * exact/alias tiers silently degrade to fuzzy/Claude.
 *
 * Idempotent — safe to re-run. Alias rows whose new key collides with an
 * existing alias are deleted (the surviving alias already covers that key).
 *
 * Target selection mirrors database/db.js (USE_POSTGRESQL=true or
 * NODE_ENV=production → PostgreSQL, else local SQLite). Override with
 * --pg or --sqlite.
 *
 * Usage:
 *   node scripts/migrations/renormalizeNames.js [--pg|--sqlite] [--dry-run]
 */
require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });
const { normalizeName } = require('../../lib/normalize');

const args   = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const usePg  = args.includes('--pg') ||
  (!args.includes('--sqlite') &&
    (process.env.USE_POSTGRESQL === 'true' || process.env.NODE_ENV === 'production'));

async function runPg() {
  const { Pool } = require('pg');
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  try {
    const stats = { products: 0, aliases: 0, collisions: 0 };

    const { rows: products } = await pool.query('SELECT id, name, normalized_name FROM products');
    for (const p of products) {
      const next = normalizeName(p.name);
      if (next === p.normalized_name) continue;
      stats.products++;
      if (dryRun) { console.log(`  product ${p.id}: "${p.normalized_name}" → "${next}"`); continue; }
      await pool.query('UPDATE products SET normalized_name = $1 WHERE id = $2', [next, p.id]);
    }

    const { rows: aliases } = await pool.query('SELECT id, alias, normalized FROM product_aliases');
    for (const a of aliases) {
      const next = normalizeName(a.alias);
      if (next === a.normalized) continue;
      if (dryRun) { stats.aliases++; console.log(`  alias ${a.id}: "${a.normalized}" → "${next}"`); continue; }
      try {
        await pool.query('UPDATE product_aliases SET normalized = $1 WHERE id = $2', [next, a.id]);
        stats.aliases++;
      } catch (err) {
        if (err.code === '23505') { // unique_violation — another alias owns this key
          await pool.query('DELETE FROM product_aliases WHERE id = $1', [a.id]);
          stats.collisions++;
        } else {
          throw err;
        }
      }
    }
    return stats;
  } finally {
    await pool.end();
  }
}

function runSqlite() {
  const sqlite = require('../../database/sqlite');
  const db = sqlite.getDb();
  const stats = { products: 0, aliases: 0, collisions: 0 };

  const products = db.prepare('SELECT id, name, normalized_name FROM products').all();
  const updateProduct = db.prepare('UPDATE products SET normalized_name = ? WHERE id = ?');
  for (const p of products) {
    const next = normalizeName(p.name);
    if (next === p.normalized_name) continue;
    stats.products++;
    if (dryRun) { console.log(`  product ${p.id}: "${p.normalized_name}" → "${next}"`); continue; }
    updateProduct.run(next, p.id);
  }

  const aliases = db.prepare('SELECT id, alias, normalized FROM product_aliases').all();
  const updateAlias = db.prepare('UPDATE product_aliases SET normalized = ? WHERE id = ?');
  const deleteAlias = db.prepare('DELETE FROM product_aliases WHERE id = ?');
  for (const a of aliases) {
    const next = normalizeName(a.alias);
    if (next === a.normalized) continue;
    if (dryRun) { stats.aliases++; console.log(`  alias ${a.id}: "${a.normalized}" → "${next}"`); continue; }
    try {
      updateAlias.run(next, a.id);
      stats.aliases++;
    } catch (err) {
      if (/UNIQUE/i.test(err.message)) {
        deleteAlias.run(a.id);
        stats.collisions++;
      } else {
        throw err;
      }
    }
  }
  return stats;
}

(async () => {
  console.log(`[renormalize] Target: ${usePg ? 'PostgreSQL (DATABASE_URL)' : 'local SQLite'}${dryRun ? ' — DRY RUN' : ''}`);
  const stats = usePg ? await runPg() : runSqlite();
  console.log(`[renormalize] ${dryRun ? 'Would update' : 'Updated'} ${stats.products} products, ${stats.aliases} aliases; ${stats.collisions} alias collisions removed`);
})().catch((err) => {
  console.error('[renormalize] FAILED:', err.message);
  process.exit(1);
});
