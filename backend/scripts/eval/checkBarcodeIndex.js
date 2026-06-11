/** Check prod products table: barcode uniqueness + existing indexes. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const dupes = await pool.query(`
    SELECT barcode, COUNT(*) AS n FROM products
    WHERE barcode IS NOT NULL GROUP BY barcode HAVING COUNT(*) > 1 LIMIT 5
  `);
  console.log('duplicate non-null barcodes:', dupes.rows.length ? JSON.stringify(dupes.rows) : 'none');

  const idx = await pool.query(`
    SELECT indexname, indexdef FROM pg_indexes WHERE tablename = 'products'
  `);
  for (const r of idx.rows) console.log(r.indexname, '::', r.indexdef.includes('UNIQUE') ? 'UNIQUE' : 'plain');

  const counts = await pool.query(`
    SELECT COUNT(*) AS total, COUNT(barcode) AS with_barcode FROM products
  `);
  console.log('products:', JSON.stringify(counts.rows[0]));
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
