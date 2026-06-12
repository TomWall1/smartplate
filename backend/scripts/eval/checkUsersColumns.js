/** List users table columns in the target DB. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

pool.query(`
  SELECT column_name, data_type FROM information_schema.columns
  WHERE table_name = 'users' AND table_schema = 'public'
  ORDER BY ordinal_position
`).then((r) => {
  r.rows.forEach((x) => console.log(`${x.column_name}: ${x.data_type}`));
  return pool.end();
}).catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
