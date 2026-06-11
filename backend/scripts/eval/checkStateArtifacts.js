/** Show per-state artifact rows in the target DB. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const d = await pool.query(`
    SELECT state, jsonb_array_length(data->'deals') AS deals, fetched_at
    FROM state_deals_cache ORDER BY state
  `);
  for (const r of d.rows) console.log(`deals  ${r.state}: ${r.deals} (fetched ${new Date(r.fetched_at).toISOString()})`);
  const rr = await pool.query(`
    SELECT state, jsonb_array_length(recipes) AS recipes, generated_at
    FROM state_recipes_cache ORDER BY state
  `);
  for (const r of rr.rows) console.log(`recipes ${r.state}: ${r.recipes} (generated ${new Date(r.generated_at).toISOString()})`);
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
