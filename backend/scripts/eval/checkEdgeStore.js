/** Show match_edges + recipe_meta store sizes in the target DB. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const edges = await pool.query(`
    SELECT COUNT(*) AS n, COUNT(*) FILTER (WHERE verdict) AS valid,
           MIN(decided_at) AS oldest, MAX(decided_at) AS newest
    FROM match_edges
  `);
  console.log('match_edges:', JSON.stringify(edges.rows[0]));
  const costs = await pool.query('SELECT COUNT(*) AS n FROM recipe_meta');
  console.log('recipe_meta:', JSON.stringify(costs.rows[0]));
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
