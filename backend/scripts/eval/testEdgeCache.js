/**
 * Smoke test: matchEdgeService judges novel pairs once, persists verdicts,
 * and serves them from the edge store (zero calls) on the next run.
 * Uses the local SQLite DB. Usage: node backend/scripts/eval/testEdgeCache.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const svc = require('../../services/matchEdgeService');

const mk = () => [{
  title: 'Test recipe',
  matchedDeals: [
    { ingredient: 'chicken breast', dealName: 'Lilydale Chicken Breast Fillets 500g' },
    { ingredient: 'lemon',          dealName: 'Remedy Ginger Lemon Kombucha 750ml' },
    { ingredient: 'butter',         dealName: 'Western Star Butter Block 500g' },
  ],
}];

(async () => {
  const r1 = mk();
  const s1 = await svc.filterRecipesByEdges(r1);
  console.log(`run1: judged ${s1.judged}, calls ${s1.calls} | survivors: ${r1[0].matchedDeals.map(d => d.ingredient).join(', ')}`);

  const r2 = mk();
  const s2 = await svc.filterRecipesByEdges(r2);
  console.log(`run2: hits ${s2.cacheHits}, calls ${s2.calls} | survivors: ${r2[0].matchedDeals.map(d => d.ingredient).join(', ')}`);

  const lemonRejected = !r2[0].matchedDeals.some(d => d.ingredient === 'lemon');
  if (s2.calls === 0 && s2.cacheHits === 3 && lemonRejected) {
    console.log('EDGE CACHE OK — kombucha rejected, verdicts persisted, second run free');
  } else {
    console.error('EDGE CACHE TEST FAILED');
    process.exitCode = 1;
  }
  process.exit();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
