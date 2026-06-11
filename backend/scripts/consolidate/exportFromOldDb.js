// Export all data from smartplate-production to JSON files
const { Pool } = require('pg');
const fs = require('fs');
const path = require('path');

const oldDbUrl = process.env.OLD_DATABASE_URL;
if (!oldDbUrl) {
  console.error('ERROR: Set OLD_DATABASE_URL environment variable');
  process.exit(1);
}

const pool = new Pool({ connectionString: oldDbUrl, ssl: { rejectUnauthorized: false } });

async function exportTable(name, query = `SELECT * FROM ${name} ORDER BY id`) {
  try {
    const result = await pool.query(query);
    return result.rows;
  } catch (err) {
    console.log(`  ⚠ Skipping ${name}: ${err.message}`);
    return null;
  }
}

async function exportData() {
  console.log('Exporting data from smartplate-production...\n');

  const exportDir = path.join(__dirname, 'exports');
  if (!fs.existsSync(exportDir)) fs.mkdirSync(exportDir, { recursive: true });

  // List all tables
  const tables = await pool.query(`
    SELECT table_name FROM information_schema.tables
    WHERE table_schema = 'public' ORDER BY table_name
  `);
  console.log('Tables found:', tables.rows.map(r => r.table_name).join(', '), '\n');

  const manifest = {};

  for (const { table_name } of tables.rows) {
    process.stdout.write(`Exporting ${table_name}...`);
    const rows = await exportTable(table_name);
    if (rows !== null) {
      fs.writeFileSync(
        path.join(exportDir, `${table_name}.json`),
        JSON.stringify(rows, null, 2)
      );
      manifest[table_name] = rows.length;
      console.log(` ✓ ${rows.length} rows`);
    }
  }

  fs.writeFileSync(path.join(exportDir, 'manifest.json'), JSON.stringify(manifest, null, 2));

  await pool.end();
  console.log('\n✅ Export complete! Files saved to:', exportDir);
  console.log('\nSummary:');
  Object.entries(manifest).forEach(([t, c]) => console.log(`  ${t}: ${c} rows`));
}

exportData().catch(err => {
  console.error('Export failed:', err);
  process.exit(1);
});
