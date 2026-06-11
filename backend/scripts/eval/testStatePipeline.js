/**
 * End-to-end test of the Phase 3 state pipeline against the target DB:
 *   1. Load the prod deals snapshot into the local in-memory mirror
 *      (stands in for a fully-enriched national cache)
 *   2. refreshStateDeals() — fetch all states live, persist artifacts
 *   3. generateAllStateRecipes() — per-state recipe artifacts
 *   4. Verify rows + spot-check VIC deals/recipes differ from national
 *
 * Run with USE_POSTGRESQL=true to exercise (and pre-warm) prod.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');

(async () => {
  const db = require('../../database/db');

  // Stage the prod national cache as the local file so dealService boots with it
  const row = await db.getDealsCache();
  if (!row?.data) throw new Error('no deals_cache row');
  fs.writeFileSync(
    path.join(__dirname, '..', '..', 'data', 'cached-deals.json'),
    JSON.stringify(row.data), 'utf8'
  );
  console.log(`[test] staged national cache (${row.data.lastUpdated})`);

  const dealService = require('../../services/dealService');
  await dealService.refreshStateDeals();

  const recipeService = require('../../services/recipeService');
  await recipeService.generateAllStateRecipes();

  // Verify
  const national = await dealService.getCurrentDeals();
  const natNames = new Set(national.map(d => `${d.store}||${d.name}`));
  for (const state of ['vic', 'qld', 'wa', 'sa', 'tas', 'nt']) {
    const dRow = await db.getStateDeals(state);
    const rRow = await db.getStateRecipes(state);
    const deals = dRow?.data?.deals ?? [];
    const unique = deals.filter(d => !natNames.has(`${d.store}||${d.name}`)).length;
    console.log(`[verify] ${state}: deals=${deals.length} (unique vs national: ${unique}, missing: ${dRow?.data?.missingRetailers?.join(',') || 'none'}) | recipes=${rRow?.recipes?.length ?? 0}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
