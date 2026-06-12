/**
 * Regenerate the national + per-state recipe artifacts WITHOUT re-fetching
 * deals (uses the deal artifacts already in the target DB). Used to roll out
 * stable recipe ids. Run with USE_POSTGRESQL=true to target prod.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');

(async () => {
  const db = require('../../database/db');
  const row = await db.getDealsCache();
  if (!row?.data) throw new Error('no deals_cache row');
  fs.writeFileSync(
    path.join(__dirname, '..', '..', 'data', 'cached-deals.json'),
    JSON.stringify(row.data), 'utf8'
  );
  console.log(`[regen] staged national cache (${row.data.lastUpdated})`);

  const recipeService = require('../../services/recipeService');
  const national = await recipeService.generateWeeklyRecipes();
  console.log(`[regen] national: ${national.length} recipes (sample id: ${national[0].id} "${national[0].title}")`);

  await recipeService.generateAllStateRecipes();

  // Verify id stability: same title → same id across national and VIC
  const vic = await db.getStateRecipes('vic');
  const natById = new Map(national.map(r => [r.id, r.title]));
  let mismatches = 0, sharedCount = 0;
  for (const r of vic?.recipes ?? []) {
    if (natById.has(r.id)) {
      sharedCount++;
      if (natById.get(r.id) !== r.title) { mismatches++; console.log(`MISMATCH id ${r.id}: "${natById.get(r.id)}" vs "${r.title}"`); }
    }
  }
  console.log(`[regen] VIC↔national: ${sharedCount} shared ids, ${mismatches} title mismatches (expect 0)`);
  process.exit(mismatches ? 1 : 0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
