/**
 * scripts/testEndToEnd.js
 *
 * Full pipeline test:
 *   1. Load deals (from cache or trigger a live fetch)
 *   2. Enrich deals with product intelligence
 *   3. Match recipes using weighted scoring
 *   4. Print results + savings breakdown
 *
 * Usage: node backend/scripts/testEndToEnd.js [--refresh]
 *   --refresh  Force a live Salefinder fetch (slow, ~30s)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const dealService   = require('../services/dealService');
const recipeMatcher = require('../services/recipeMatcher');
const db            = require('../database/db');
const { enrichMatchedDealsWithSavings } = require('../services/savingsCalculator');

const FORCE_REFRESH = process.argv.includes('--refresh');

function fmt(n)    { return typeof n === 'number' ? n.toFixed(2) : '?'; }
function pct(a, b) { return b > 0 ? `${((a / b) * 100).toFixed(1)}%` : '0%'; }

async function main() {
  const startTotal = Date.now();
  console.log('\n[E2E] ── SmartPlate End-to-End Test ─────────────────────────────\n');

  // ── Step 1: Get deals ─────────────────────────────────────────────────────
  console.log('[E2E] Step 1: Loading deals...');
  let deals;
  if (FORCE_REFRESH) {
    console.log('[E2E] --refresh flag set — fetching live deals (takes ~30s)...');
    const { deals: fresh } = await dealService.refreshDeals();
    deals = fresh;
  } else {
    deals = await dealService.getCurrentDeals();
    if (deals.length === 0 && dealService.isLoading()) {
      console.log('[E2E] Waiting for startup fetch...');
      await dealService.waitForDeals(180000);
      deals = await dealService.getCurrentDeals();
    }
  }

  if (deals.length === 0) {
    console.log('[E2E] ✗ No deals available. Run with --refresh or POST /api/deals/refresh first.');
    process.exit(1);
  }
  console.log(`[E2E] ✓ ${deals.length} deals loaded`);

  // Store breakdown
  const byStore = {};
  for (const d of deals) {
    byStore[d.store || 'unknown'] = (byStore[d.store || 'unknown'] || 0) + 1;
  }
  console.log(`       ${Object.entries(byStore).map(([s, n]) => `${s}: ${n}`).join(', ')}`);

  // ── Step 2: Enrich with product intelligence ──────────────────────────────
  console.log('\n[E2E] Step 2: Enriching deals with product intelligence...');
  const enrichStart = Date.now();

  const dbStats = db.getStats();
  console.log(`[E2E] DB: ${dbStats.products.toLocaleString()} products, ${dbStats.aliases.toLocaleString()} aliases`);

  const enriched = await dealService.enrichDealsWithProducts([...deals]);
  const enrichTime = Date.now() - enrichStart;

  const piCount   = enriched.filter(d => d.productIntelligence).length;
  const missCount = enriched.length - piCount;
  console.log(`[E2E] ✓ Enrichment complete in ${enrichTime}ms`);
  console.log(`       Cache hits:  ${piCount} (${pct(piCount, enriched.length)})`);
  console.log(`       Cache miss:  ${missCount} (${pct(missCount, enriched.length)}) — Claude categorised`);

  // Category breakdown for enriched deals
  const catCounts = {};
  for (const d of enriched) {
    const cat = d.productIntelligence?.category ?? 'unenriched';
    catCounts[cat] = (catCounts[cat] || 0) + 1;
  }
  const sortedCats = Object.entries(catCounts).sort((a, b) => b[1] - a[1]).slice(0, 8);
  console.log(`       Top categories: ${sortedCats.map(([c, n]) => `${c}(${n})`).join(', ')}`);

  // ── Step 3: Match recipes ─────────────────────────────────────────────────
  console.log('\n[E2E] Step 3: Matching recipes...');
  const matchStart = Date.now();
  const matched    = recipeMatcher.matchDeals(enriched);
  const matchTime  = Date.now() - matchStart;

  console.log(`[E2E] ✓ ${matched.length} recipes matched in ${matchTime}ms`);

  if (matched.length === 0) {
    console.log('[E2E] ✗ No recipes matched — check that recipe library files exist.');
    db.closeDb();
    return;
  }

  // Protein pass rate
  const proteinCount = matched.filter(r =>
    r.matchedDeals.some(d => d.productCategory === 'meat' || d.productCategory === 'seafood')
  ).length;
  const piMatchCount = matched.filter(r =>
    r.matchedDeals.some(d => d.productIntelligence)
  ).length;
  console.log(`       Protein match:  ${proteinCount}/${matched.length} (${pct(proteinCount, matched.length)})`);
  console.log(`       PI-assisted:    ${piMatchCount}/${matched.length} (${pct(piMatchCount, matched.length)})`);

  // ── Step 4: Attach savings ────────────────────────────────────────────────
  const withSavings = matched.map(r => enrichMatchedDealsWithSavings(r, r.matchedDeals));

  // ── Step 5: Print top recipes ─────────────────────────────────────────────
  console.log('\n[E2E] Top 10 recipes (weighted score):\n');
  withSavings.slice(0, 10).forEach((r, i) => {
    const score  = r.weightedScore ?? fmt(r.matchScore);
    const saving = r.totalPerServingSaving != null
      ? `$${fmt(r.totalPerServingSaving)}/serve`
      : `$${fmt(r.totalSaving)} total saved`;

    console.log(`  ${String(i + 1).padStart(2)}. ${r.title.substring(0, 48).padEnd(48)} score=${String(score).padStart(6)}  ${saving}`);

    const deals = r.matchedDeals.slice(0, 4).map(d => {
      const cat = d.productCategory ? `[${d.productCategory}]` : '';
      return `${d.ingredient}${cat}`;
    });
    console.log(`      deals: ${deals.join(', ')}`);
  });

  // ── Step 6: Savings breakdown for top recipe ──────────────────────────────
  console.log('\n[E2E] Savings breakdown — top recipe:');
  const top = withSavings[0];
  console.log(`  "${top.title}" (${top.servings || 4} servings)`);
  for (const deal of top.matchedDeals.slice(0, 6)) {
    const s = deal.savings;
    if (!s) continue;
    const est = s.isEstimate ? ' (est.)' : '';
    console.log(`  • ${deal.dealName.substring(0, 42).padEnd(42)} saves $${fmt(s.totalProductSaving)} total → $${fmt(s.mealSaving)}/meal → $${fmt(s.perServingSaving)}/serve${est}`);
    console.log(`    ${s.breakdown}`);
  }
  if (top.totalMealSaving) {
    console.log(`  ─────`);
    console.log(`  Total meal saving: $${fmt(top.totalMealSaving)}  |  Per serving: $${fmt(top.totalPerServingSaving)}`);
  }

  // ── Summary ───────────────────────────────────────────────────────────────
  const avgScore   = withSavings.reduce((s, r) => s + (r.weightedScore || 0), 0) / withSavings.length;
  const avgSaving  = withSavings.reduce((s, r) => s + (r.totalPerServingSaving || 0), 0) / withSavings.length;
  const topSaving  = Math.max(...withSavings.map(r => r.totalMealSaving || 0));

  console.log('\n[E2E] ── Summary ─────────────────────────────────────────────────');
  console.log(`  Deals fetched:      ${deals.length}`);
  console.log(`  Cache hit rate:     ${pct(piCount, enriched.length)}`);
  console.log(`  Recipes matched:    ${matched.length}`);
  console.log(`  Avg weighted score: ${avgScore.toFixed(1)}`);
  console.log(`  Avg per-serve save: $${fmt(avgSaving)}`);
  console.log(`  Best meal saving:   $${fmt(topSaving)}`);
  console.log(`  Total time:         ${Date.now() - startTotal}ms`);

  const target = 2000;
  const pipelineTime = matchTime + enrichTime;
  if (pipelineTime < target) {
    console.log(`  Speed:              ${pipelineTime}ms ✓ (under ${target}ms target)`);
  } else {
    console.log(`  Speed:              ${pipelineTime}ms ✗ (over ${target}ms target — seed DB to improve)`);
  }

  // ── Acceptance criteria ───────────────────────────────────────────────────
  console.log('\n[E2E] ── Acceptance Criteria ─────────────────────────────────────');
  const criteria = [
    { label: 'DB has products',          pass: dbStats.products > 0,       detail: `${dbStats.products.toLocaleString()} products` },
    { label: 'Cache hit rate ≥ 60%',     pass: piCount / enriched.length >= 0.6, detail: pct(piCount, enriched.length) },
    { label: '50 recipes matched',       pass: matched.length >= 50,       detail: `${matched.length} recipes` },
    { label: 'Protein in 90%+ recipes',  pass: proteinCount / matched.length >= 0.9, detail: pct(proteinCount, matched.length) },
    { label: 'Pipeline under 2s',        pass: pipelineTime < 2000,        detail: `${pipelineTime}ms` },
  ];
  for (const c of criteria) {
    console.log(`  ${c.pass ? '✓' : '✗'} ${c.label.padEnd(30)} ${c.detail}`);
  }

  console.log('\n─────────────────────────────────────────────────────────────────\n');
  db.closeDb();
}

main().catch(err => {
  console.error('[E2E] Fatal:', err.message);
  process.exit(1);
});
