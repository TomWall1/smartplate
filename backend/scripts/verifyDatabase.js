/**
 * scripts/verifyDatabase.js
 *
 * Show database population stats: counts by source, category, processing level,
 * sample products, and top matched products.
 *
 * Usage: node backend/scripts/verifyDatabase.js
 */

const db = require('../database/db');

function pct(n, total) {
  return total > 0 ? ` (${((n / total) * 100).toFixed(1)}%)` : '';
}

function bar(n, max, width = 20) {
  const filled = max > 0 ? Math.round((n / max) * width) : 0;
  return '█'.repeat(filled) + '░'.repeat(width - filled);
}

function printSection(title) {
  console.log(`\n── ${title} ${'─'.repeat(Math.max(0, 55 - title.length))}`);
}

function main() {
  const raw = db.getDb();

  // ── Totals ────────────────────────────────────────────────────────────────
  const total    = db.countProducts();
  const aliases  = db.countAliases();
  const matches  = raw.prepare('SELECT COUNT(*) AS n FROM match_history').get().n;

  printSection('TOTALS');
  console.log(`  Products:       ${total.toLocaleString()}`);
  console.log(`  Aliases:        ${aliases.toLocaleString()}`);
  console.log(`  Match events:   ${matches.toLocaleString()}`);

  if (total === 0) {
    console.log('\n  ⚠  Database is empty — run seed scripts first:');
    console.log('     node backend/scripts/seedDatabase/seedOpenFoodFacts.js');
    console.log('     node backend/scripts/seedDatabase/seedWoolworths.js');
    console.log('     node backend/scripts/seedDatabase/seedColes.js');
    db.closeDb();
    return;
  }

  // ── By source ─────────────────────────────────────────────────────────────
  printSection('BY SOURCE');
  const bySrc = raw.prepare(`
    SELECT COALESCE(source,'unknown') AS source, COUNT(*) AS n
    FROM products GROUP BY source ORDER BY n DESC
  `).all();
  const maxSrc = Math.max(...bySrc.map(r => r.n));
  for (const r of bySrc) {
    console.log(`  ${r.source.padEnd(20)} ${String(r.n.toLocaleString()).padStart(7)}${pct(r.n, total)}  ${bar(r.n, maxSrc)}`);
  }

  // ── By category ───────────────────────────────────────────────────────────
  printSection('BY CATEGORY');
  const byCat = raw.prepare(`
    SELECT COALESCE(category,'unset') AS category, COUNT(*) AS n
    FROM products GROUP BY category ORDER BY n DESC
  `).all();
  const maxCat = Math.max(...byCat.map(r => r.n));
  for (const r of byCat) {
    console.log(`  ${r.category.padEnd(20)} ${String(r.n.toLocaleString()).padStart(7)}${pct(r.n, total)}  ${bar(r.n, maxCat)}`);
  }

  // ── By processing level ───────────────────────────────────────────────────
  printSection('BY PROCESSING LEVEL');
  const byProc = raw.prepare(`
    SELECT COALESCE(processing_level,'unknown') AS level, COUNT(*) AS n
    FROM products GROUP BY processing_level ORDER BY n DESC
  `).all();
  const maxProc = Math.max(...byProc.map(r => r.n));
  for (const r of byProc) {
    console.log(`  ${r.level.padEnd(25)} ${String(r.n.toLocaleString()).padStart(7)}${pct(r.n, total)}  ${bar(r.n, maxProc)}`);
  }

  // ── Hero ingredients ──────────────────────────────────────────────────────
  printSection('HERO INGREDIENTS');
  const heroCount    = raw.prepare('SELECT COUNT(*) AS n FROM products WHERE is_hero_ingredient = 1').get().n;
  const nonHeroCount = total - heroCount;
  console.log(`  Hero (main ingredient):    ${heroCount.toLocaleString()}${pct(heroCount, total)}`);
  console.log(`  Non-hero (condiment/pantry): ${nonHeroCount.toLocaleString()}${pct(nonHeroCount, total)}`);

  // ── Most matched products ─────────────────────────────────────────────────
  printSection('TOP 10 MOST MATCHED PRODUCTS');
  const topMatched = raw.prepare(`
    SELECT name, category, times_matched, source
    FROM products WHERE times_matched > 0
    ORDER BY times_matched DESC LIMIT 10
  `).all();
  if (topMatched.length === 0) {
    console.log('  (none yet — run testProductLookup.js to populate)');
  } else {
    topMatched.forEach((r, i) => {
      console.log(`  ${String(i + 1).padStart(2)}. ${r.name.substring(0, 45).padEnd(45)} ${String(r.times_matched).padStart(4)}x  [${r.category ?? '?'}]`);
    });
  }

  // ── Sample products by source ─────────────────────────────────────────────
  printSection('SAMPLE PRODUCTS BY SOURCE');
  for (const { source } of bySrc.slice(0, 4)) {
    const samples = raw.prepare(`
      SELECT name, brand, category, base_ingredient, processing_level
      FROM products WHERE source = ? ORDER BY RANDOM() LIMIT 3
    `).all(source);
    console.log(`\n  ${source}:`);
    for (const s of samples) {
      console.log(`    • ${s.name.substring(0, 55)}`);
      console.log(`      base: ${s.base_ingredient ?? '?'}  |  cat: ${s.category ?? '?'}  |  level: ${s.processing_level ?? '?'}`);
    }
  }

  // ── Recent aliases ────────────────────────────────────────────────────────
  printSection('RECENT ALIASES');
  const recentAliases = raw.prepare(`
    SELECT pa.alias, pa.source, p.name AS product_name
    FROM product_aliases pa
    JOIN products p ON p.id = pa.product_id
    ORDER BY pa.created_at DESC LIMIT 8
  `).all();
  for (const a of recentAliases) {
    console.log(`  "${a.alias.substring(0, 40).padEnd(40)}" → ${a.product_name.substring(0, 35)} [${a.source}]`);
  }

  console.log('\n' + '─'.repeat(58) + '\n');
  db.closeDb();
}

main();
