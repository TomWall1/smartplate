/**
 * scripts/dashboard.js
 *
 * Comprehensive SmartPlate product intelligence dashboard.
 * Shows DB health, deal cache state, match history, and recipe metrics.
 *
 * Usage: node backend/scripts/dashboard.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const db          = require('../database/db');
const dealService = require('../services/dealService');
const path        = require('path');
const fs          = require('fs');

function fmt(n, dec = 2)  { return typeof n === 'number' ? n.toFixed(dec) : String(n ?? '—'); }
function pct(a, b)         { return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '—'; }
function pad(s, n)         { return String(s).padStart(n); }
function row(label, value) { console.log(`  ${label.padEnd(32)} ${value}`); }

function printHeader(title) {
  const line = '═'.repeat(58);
  console.log(`\n${line}`);
  console.log(`  ${title}`);
  console.log(line);
}

function printSection(title) {
  console.log(`\n  ── ${title} ${'─'.repeat(Math.max(0, 50 - title.length))}`);
}

async function main() {
  const raw = db.getDb();

  printHeader('SmartPlate Product Intelligence Dashboard');

  // ─────────────────────────────────────────────────────────────────────────
  // DATABASE
  // ─────────────────────────────────────────────────────────────────────────
  printSection('DATABASE');

  const total    = db.countProducts();
  const aliases  = db.countAliases();
  row('Total products:', total.toLocaleString());
  row('Total aliases:', aliases.toLocaleString());

  if (total === 0) {
    console.log('\n  ⚠  Database empty. Run seed scripts to populate.\n');
    db.closeDb();
    return;
  }

  // By source
  const bySrc = raw.prepare(`
    SELECT COALESCE(source,'unknown') AS s, COUNT(*) AS n FROM products GROUP BY s ORDER BY n DESC
  `).all();
  row('By source:', bySrc.map(r => `${r.s}(${r.n.toLocaleString()})`).join('  '));

  // By category
  const byCat = raw.prepare(`
    SELECT COALESCE(category,'unset') AS c, COUNT(*) AS n FROM products GROUP BY c ORDER BY n DESC LIMIT 8
  `).all();
  row('By category (top 8):', byCat.map(r => `${r.c}(${r.n.toLocaleString()})`).join('  '));

  // Hero vs non-hero
  const heroCount = raw.prepare('SELECT COUNT(*) AS n FROM products WHERE is_hero_ingredient = 1').get().n;
  row('Hero ingredients:', `${heroCount.toLocaleString()} (${pct(heroCount, total)})`);

  // Coverage: products with satisfies_ingredients populated
  const hasSatisfies = raw.prepare(
    "SELECT COUNT(*) AS n FROM products WHERE satisfies_ingredients != '[]' AND satisfies_ingredients IS NOT NULL"
  ).get().n;
  row('With satisfiesIngredients:', `${hasSatisfies.toLocaleString()} (${pct(hasSatisfies, total)})`);

  // ─────────────────────────────────────────────────────────────────────────
  // DEAL CACHE
  // ─────────────────────────────────────────────────────────────────────────
  printSection('DEAL CACHE');

  const cacheInfo = dealService.getCacheInfo();
  if (!cacheInfo) {
    row('Status:', 'No cache file — run POST /api/deals/refresh');
  } else {
    row('Last updated:', cacheInfo.lastUpdated);
    row('Total deals:', cacheInfo.counts.total.toLocaleString());
    row('By store:', `woolworths(${cacheInfo.counts.woolworths})  coles(${cacheInfo.counts.coles})  iga(${cacheInfo.counts.iga})`);
  }

  // ─────────────────────────────────────────────────────────────────────────
  // MATCH HISTORY
  // ─────────────────────────────────────────────────────────────────────────
  printSection('MATCH HISTORY');

  const matchStats = db.getMatchStats();
  row('Total match events:', matchStats.total.toLocaleString());

  if (matchStats.total > 0) {
    row('By match type:', matchStats.byType.map(r => `${r.match_type}(${r.n})`).join('  '));

    const hitTypes  = new Set(['exact', 'alias', 'normalized', 'fuzzy', 'barcode', 'claude']);
    const hits      = matchStats.byType.filter(r => hitTypes.has(r.match_type)).reduce((s, r) => s + r.n, 0);
    const misses    = matchStats.byType.find(r => r.match_type === 'none')?.n ?? 0;
    const hitRate   = hits + misses > 0 ? (hits / (hits + misses)) * 100 : 0;
    row('Overall hit rate:', `${hitRate.toFixed(1)}% (${hits} hits / ${hits + misses} total)`);

    // Last 24h activity
    const recentHits = raw.prepare(`
      SELECT COUNT(*) AS n FROM match_history
      WHERE matched_at > datetime('now', '-24 hours') AND match_type != 'none'
    `).get().n;
    const recentMiss = raw.prepare(`
      SELECT COUNT(*) AS n FROM match_history
      WHERE matched_at > datetime('now', '-24 hours') AND match_type = 'none'
    `).get().n;
    row('Last 24h:', `${recentHits} hits, ${recentMiss} misses`);

    // Breakdown by tier
    console.log('\n  Hit tier breakdown:');
    for (const { match_type, n } of matchStats.byType) {
      const bar = '█'.repeat(Math.min(30, Math.round((n / matchStats.total) * 30)));
      console.log(`    ${match_type.padEnd(12)} ${pad(n, 6)}  ${bar}`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // RECENT CLAUDE CATEGORIZATIONS
  // ─────────────────────────────────────────────────────────────────────────
  const claudeCount = raw.prepare("SELECT COUNT(*) AS n FROM products WHERE source = 'claude'").get().n;
  if (claudeCount > 0) {
    printSection(`RECENT CLAUDE CATEGORIZATIONS (${claudeCount} total)`);
    const recentClaude = raw.prepare(`
      SELECT name, category, base_ingredient, created_at
      FROM products WHERE source = 'claude'
      ORDER BY created_at DESC LIMIT 8
    `).all();
    for (const p of recentClaude) {
      console.log(`  • ${p.name.substring(0, 48).padEnd(48)} → ${(p.base_ingredient ?? '?').padEnd(15)} [${p.category ?? '?'}]`);
    }
  }

  // ─────────────────────────────────────────────────────────────────────────
  // WEEKLY RECIPES
  // ─────────────────────────────────────────────────────────────────────────
  printSection('WEEKLY RECIPES');

  const recipeService = require('../services/recipeService');
  const meta          = recipeService.getWeeklyRecipesMeta();
  if (!meta) {
    row('Status:', 'No weekly recipes generated yet');
  } else {
    row('Generated at:', meta.generatedAt);
    row('Recipe count:', String(meta.recipeCount));
    row('Deal count:', String(meta.dealCount || '—'));
  }

  const recipes = recipeService.getWeeklyRecipes();
  if (recipes.length > 0) {
    const withSaving = recipes.filter(r => r.totalMealSaving > 0);
    const avgSaving  = withSaving.length > 0
      ? withSaving.reduce((s, r) => s + r.totalPerServingSaving, 0) / withSaving.length
      : 0;
    const topSaving  = Math.max(...recipes.map(r => r.totalMealSaving || 0));
    const proteinPct = recipes.filter(r =>
      (r.matchedDeals || []).some(d => d.productCategory === 'meat' || d.productCategory === 'seafood')
    ).length / recipes.length * 100;

    row('Avg per-serving saving:', `$${fmt(avgSaving)}`);
    row('Best meal saving:', `$${fmt(topSaving)}`);
    row('Protein match rate:', `${proteinPct.toFixed(1)}%`);

    console.log('\n  Top 5 recipes:');
    recipes.slice(0, 5).forEach((r, i) => {
      const score = r.weightedScore ? `score=${fmt(r.weightedScore, 1)}` : `matches=${r.matchScore || '?'}`;
      console.log(`  ${i + 1}. ${r.title.substring(0, 48).padEnd(48)}  ${score}`);
    });
  }

  // ─────────────────────────────────────────────────────────────────────────
  // HEALTH CHECKS
  // ─────────────────────────────────────────────────────────────────────────
  printSection('HEALTH CHECKS');

  const checks = [
    { label: 'Database populated',        pass: total > 1000,            detail: `${total.toLocaleString()} products` },
    { label: 'satisfiesIngredients set',  pass: hasSatisfies / total > 0.5, detail: pct(hasSatisfies, total) },
    { label: 'Hero ingredients tagged',   pass: heroCount > 0,           detail: `${heroCount.toLocaleString()}` },
    { label: 'Deal cache available',      pass: !!cacheInfo,             detail: cacheInfo ? `${cacheInfo.counts.total} deals` : 'missing' },
    { label: 'Weekly recipes generated',  pass: !!meta,                  detail: meta ? `${meta.recipeCount} recipes` : 'not generated' },
  ];

  for (const c of checks) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.label.padEnd(30)} ${c.detail}`);
  }

  console.log('\n' + '═'.repeat(58) + '\n');
  db.closeDb();
}

main().catch(err => {
  console.error('[Dashboard] Fatal:', err.message);
  process.exit(1);
});
