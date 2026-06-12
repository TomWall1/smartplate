/** Show ingredient names that start with a digit (possible quantity leaks). */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query('SELECT recipes FROM weekly_recipes_cache ORDER BY generated_at DESC LIMIT 1');
  const seen = new Set();
  for (const rec of r.rows[0].recipes) {
    for (const ing of rec.allIngredients || []) {
      if (/^\d/.test(ing) && !seen.has(ing)) { seen.add(ing); console.log(`"${ing}"`); }
    }
  }
  console.log(`${seen.size} distinct digit-leading ingredient names`);
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
