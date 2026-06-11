require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const { Pool } = require('pg');

const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error('✗ Missing DATABASE_URL in backend/.env');
  process.exit(1);
}

const pool = new Pool({ connectionString: DATABASE_URL, ssl: { rejectUnauthorized: false } });

async function main() {
  const client = await pool.connect();
  try {
    console.log('=== Database Check ===\n');

    // 1. Check if recipes table exists
    const tableRes = await client.query(`
      SELECT EXISTS (
        SELECT 1 FROM information_schema.tables
        WHERE table_schema = 'public' AND table_name = 'recipes'
      ) AS exists
    `);
    const tableExists = tableRes.rows[0].exists;
    console.log(`recipes table: ${tableExists ? '✓ exists' : '✗ missing'}`);

    if (!tableExists) {
      console.log('\n→ Run: node scripts/migrations/addRecipesTable.js');
      return;
    }

    // 2. Check specific columns
    const colRes = await client.query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_schema = 'public' AND table_name = 'recipes'
      ORDER BY ordinal_position
    `);
    const cols = colRes.rows.map(r => r.column_name);
    const CHECK = ['source', 'metadata', 'is_active', 'ingredients', 'enriched_at'];
    console.log('\nColumns:');
    for (const c of CHECK) {
      const found = cols.includes(c);
      const row   = colRes.rows.find(r => r.column_name === c);
      console.log(`  ${found ? '✓' : '✗'} ${c}${found ? ` (${row.data_type})` : ' — MISSING'}`);
    }
    console.log(`  (${cols.length} total columns: ${cols.join(', ')})`);

    // 3. Row count + enriched count
    const countRes = await client.query(`
      SELECT
        COUNT(*)                                    AS total,
        COUNT(*) FILTER (WHERE metadata IS NOT NULL) AS enriched,
        COUNT(*) FILTER (WHERE is_active = false)    AS inactive
      FROM recipes
    `);
    // is_active column might not exist yet — handle gracefully
    const row = countRes.rows[0];
    console.log(`\nRow counts:`);
    console.log(`  Total recipes:    ${row.total}`);
    console.log(`  Enriched (metadata): ${row.enriched}`);
    console.log(`  Inactive:         ${row.inactive ?? 'n/a (column missing)'}`);

    // 4. Recommendation
    const missingIsActive = !cols.includes('is_active');
    const missingMetadata = !cols.includes('metadata');
    const missingSource   = !cols.includes('source');

    console.log('\n=== Recommendation ===');
    if (missingSource || missingMetadata) {
      console.log('→ Run: node scripts/migrations/addRecipesTable.js  (table structure incomplete)');
    } else if (missingIsActive) {
      console.log('→ Run: node scripts/migrations/addRecipeControlFlags.js  (missing is_active column)');
    } else if (parseInt(row.enriched, 10) === 0) {
      console.log('→ Run: node scripts/enrichRecipes.js  (table ready, no enrichment yet)');
    } else {
      console.log(`✓ Everything looks good — ${row.enriched}/${row.total} recipes enriched`);
    }

  } catch (err) {
    // Retry without is_active in case that column truly doesn't exist
    if (err.message.includes('is_active')) {
      try {
        const client2 = await pool.connect();
        const r = await client2.query('SELECT COUNT(*) AS total, COUNT(*) FILTER (WHERE metadata IS NOT NULL) AS enriched FROM recipes');
        client2.release();
        console.log(`\nRow counts (is_active column missing):`);
        console.log(`  Total recipes: ${r.rows[0].total}`);
        console.log(`  Enriched:      ${r.rows[0].enriched}`);
        console.log('\n=== Recommendation ===');
        console.log('→ Run: node scripts/migrations/addRecipeControlFlags.js  (missing is_active column)');
        return;
      } catch { /* fall through */ }
    }
    console.error('✗ Query error:', err.message);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('✗ Connection error:', err.message);
  process.exit(1);
});
