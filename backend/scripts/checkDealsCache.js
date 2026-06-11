/**
 * Quick ops check: show the deals_cache rows in the target database.
 * Usage: node scripts/checkDealsCache.js   (uses DATABASE_URL from .env)
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { Pool } = require('pg');

const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query('SELECT id, last_updated, saved_at, pg_column_size(data) AS bytes FROM deals_cache ORDER BY last_updated DESC')
  .then((r) => {
    if (!r.rows.length) console.log('deals_cache: EMPTY');
    r.rows.forEach((x) => console.log(
      `row ${x.id} | lastUpdated: ${new Date(x.last_updated).toISOString()} | saved: ${new Date(x.saved_at).toISOString()} | bytes: ${x.bytes}`
    ));
    return pool.end();
  })
  .catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
