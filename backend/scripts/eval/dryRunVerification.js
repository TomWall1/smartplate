/**
 * Dry run of Step 1b (score → pool → verify → select) on the CURRENT library
 * and the deals already in the DB, using ONLY cached verdicts.
 *
 * Read-only and offline: it never calls Claude and never writes a row. Pairs
 * with no cached verdict are kept, exactly as production's fail-open does, so
 * the family mix printed here is what the next real run would serve — minus
 * whatever the judge decides about never-seen pairs.
 *
 * Written 2026-08-31 to settle whether edge verification or the pre-fix
 * ingredient parser caused Woolworths to serve 41 pork recipes of 50.
 *
 *   node scripts/eval/dryRunVerification.js [state]
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const { normalizeName } = require('../../lib/normalize');
const recipeMatcher = require('../../services/recipeMatcher');

const STATE = process.argv[2] || 'nsw';
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const familyMix = (list) => {
  const out = {};
  for (const r of list) {
    const hero = recipeMatcher._heroKeyFromDeals(r.matchedDeals || []);
    out[hero ? recipeMatcher._heroFamily(hero) : 'no-hero'] = (out[hero ? recipeMatcher._heroFamily(hero) : 'no-hero'] || 0) + 1;
  }
  return out;
};

(async () => {
  const res = await pool.query('SELECT data FROM state_deals_cache WHERE state = $1', [STATE]);
  const raw = res.rows[0].data;
  const deals = (typeof raw === 'string' ? JSON.parse(raw) : raw).deals || [];
  console.log(`${STATE.toUpperCase()}: ${deals.length} deals\n`);

  const scored = await recipeMatcher.scoreCandidates(deals, 999999);
  const candidates = recipeMatcher.poolForStores(scored, 300);
  console.log(`scored ${scored.length} matchable, pooled ${candidates.length}`);
  console.log(`BEFORE verification: ${JSON.stringify(familyMix(candidates))}\n`);

  // Cache-only verification: same key derivation and same fail-open rule as
  // matchEdgeService.filterRecipesByEdges, minus the judge and the writes.
  const pairs = new Map();
  for (const r of candidates) for (const md of r.matchedDeals || []) {
    const i = normalizeName(md.ingredient || ''), d = normalizeName(md.dealName || '');
    if (i && d) pairs.set(`${i}||${d}`, { ingredientNorm: i, dealNorm: d });
  }
  const all = [...pairs.values()];
  const rows = await pool.query(
    'SELECT ingredient_norm, deal_norm, verdict FROM match_edges WHERE ingredient_norm = ANY($1)',
    [[...new Set(all.map(p => p.ingredientNorm))]]
  );
  const verdicts = new Map();
  for (const r of rows.rows) verdicts.set(`${r.ingredient_norm}||${r.deal_norm}`, r.verdict);
  const hits = all.filter(p => verdicts.has(`${p.ingredientNorm}||${p.dealNorm}`));
  console.log(`unique pairs ${all.length}: ${hits.length} cached (${(hits.length / all.length * 100).toFixed(0)}%), ${all.length - hits.length} would go to Claude`);

  let dropped = 0;
  for (const r of candidates) {
    if (!r.matchedDeals?.length) continue;
    r.matchedDeals = r.matchedDeals.filter(md => {
      const v = verdicts.get(`${normalizeName(md.ingredient || '')}||${normalizeName(md.dealName || '')}`);
      if (v === false) { dropped++; return false; }
      return true;   // valid or never-seen — fail open, as production does
    });
  }
  const verified = candidates.filter(r => (r.matchedDeals || []).length > 0);
  console.log(`dropped ${dropped} deal matches; ${verified.length} recipes survive`);
  console.log(`AFTER  verification: ${JSON.stringify(familyMix(verified))}\n`);

  const selected = recipeMatcher.selectStoreMenu
    ? recipeMatcher.selectStoreMenu(verified.filter(r => (r.matchedDeals || []).some(d => d.store === 'woolworths')), 50, 'woolworths')
    : [];
  if (selected.length) {
    console.log(`WOOLWORTHS top ${Math.min(50, selected.length)}: ${JSON.stringify(familyMix(selected.slice(0, 50)))}`);
    const heroes = {};
    for (const r of selected.slice(0, 50)) {
      const h = recipeMatcher._heroKeyFromDeals(r.matchedDeals || []) || '(none)';
      heroes[h] = (heroes[h] || 0) + 1;
    }
    console.log('hero mix:');
    for (const [h, n] of Object.entries(heroes).sort((a, b) => b[1] - a[1])) console.log(`   ${String(n).padStart(3)}  ${h}`);
  }
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message, e.stack); process.exit(1); });
