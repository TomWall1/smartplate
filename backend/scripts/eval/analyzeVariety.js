/**
 * Diagnose recipe variety for Woolworths: library composition, how many
 * recipes are MATCHABLE per hero against current WW deals (before the 400-pool
 * cap + round-robin), and per named hero deal how many recipes map to it.
 * Read-only. Run: node scripts/eval/analyzeVariety.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const recipeMatcher = require('../../services/recipeMatcher');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const PROTEINS = ['chicken','beef','lamb','pork','mince','sausage','steak','salmon','fish','prawn','tuna','turkey','duck','veal','bacon','ham','barramundi','snapper'];
const heroOf = (name) => { name = (name||'').toLowerCase(); return PROTEINS.find(p => new RegExp(`\\b${p}s?\\b`).test(name)) || '(veg/other)'; };

(async () => {
  // ── Library composition by primaryProtein ──
  const lib = recipeMatcher.loadLibrary();
  const byProtein = {};
  lib.forEach(r => { const p = (r.metadata?.primaryProtein || 'none').toLowerCase(); byProtein[p] = (byProtein[p]||0)+1; });
  console.log(`LIBRARY: ${lib.length} recipes. By primaryProtein:`);
  Object.entries(byProtein).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // ── WW deals ──
  const row = (await pool.query('SELECT data FROM deals_cache ORDER BY last_updated DESC LIMIT 1')).rows[0].data;
  const ww = row.woolworths || (Array.isArray(row.deals) ? row.deals.filter(d => (d.store||'').toLowerCase()==='woolworths') : []);
  console.log(`\nWW deals: ${ww.length}`);

  // hero (meat/seafood) WW deals
  const heroDeals = ww.filter(d => recipeMatcher._isDriverDeal({
    ingredient: '', dealName: d.name, store: d.store, price: d.price, originalPrice: d.originalPrice,
    discountPercentage: d.discountPercentage, productCategory: d.productIntelligence?.category,
  }) || ['meat','seafood'].includes(d.productIntelligence?.category));
  console.log(`WW driver-ish deals: ${heroDeals.length}`);

  // ── Matchable recipes (NO pool cap) ──
  const candidates = await recipeMatcher.scoreCandidates(ww, 999999);
  console.log(`\nMATCHABLE recipes (matchScore>0, before 400 cap): ${candidates.length}`);

  // tally matchable recipes by their top driver hero
  const tally = {};
  for (const r of candidates) {
    const drivers = (r.matchedDeals||[]).filter(d => recipeMatcher._isDriverDeal(d));
    if (!drivers.length) continue;
    let anchor = null, bw = -1;
    for (const d of drivers) { const w = recipeMatcher._getIngredientWeight(d); if (w>bw){bw=w;anchor=d;} }
    const hero = heroOf(anchor.ingredient) !== '(veg/other)' ? heroOf(anchor.ingredient) : heroOf(anchor.dealName);
    tally[hero] = (tally[hero]||0)+1;
  }
  console.log(`\nMATCHABLE recipes per hero (what selection COULD draw from):`);
  Object.entries(tally).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  // ── Named example deals: how many recipes map to each ──
  const targets = ['whole chicken','prawn','lamb leg','leg of lamb','beef chuck','chuck','salmon'];
  console.log(`\nNamed deal coverage (WW deals matching the term → recipes that include that deal):`);
  for (const t of targets) {
    const matchingDeals = ww.filter(d => (d.name||'').toLowerCase().includes(t));
    if (!matchingDeals.length) { console.log(`  "${t}": NO WW deal found`); continue; }
    const dealNames = new Set(matchingDeals.map(d => (d.name||'').toLowerCase()));
    const recipeCount = candidates.filter(r => (r.matchedDeals||[]).some(d => dealNames.has((d.dealName||'').toLowerCase()))).length;
    console.log(`  "${t}": ${matchingDeals.length} WW deal(s) [e.g. "${matchingDeals[0].name}"] → ${recipeCount} matchable recipes`);
  }
  // ── Reproduce the WW selection (approx — no edge verify) ──
  const bucketTally = {};
  candidates.forEach(r => { const b = recipeMatcher._getProteinBucket(r); bucketTally[b] = (bucketTally[b]||0)+1; });
  console.log(`\nMatchable candidates by proteinBucket (= the round-robin groups): ${JSON.stringify(bucketTally)}`);

  const selected = recipeMatcher.selectStoreMenu(candidates, 50);
  const selTally = {};
  for (const r of selected) {
    const drivers = (r.matchedDeals||[]).filter(d => recipeMatcher._isDriverDeal(d));
    let a = null, bw = -1;
    for (const d of drivers) { const w = recipeMatcher._getIngredientWeight(d); if (w>bw){bw=w;a=d;} }
    const h = a ? (heroOf(a.ingredient) !== '(veg/other)' ? heroOf(a.ingredient) : heroOf(a.dealName)) : '(none)';
    selTally[h] = (selTally[h]||0)+1;
  }
  console.log(`\nSELECTED top-50 (free tier) by hero:`);
  Object.entries(selTally).sort((a,b)=>b[1]-a[1]).forEach(([k,v]) => console.log(`  ${k}: ${v}`));

  await pool.end();
})().catch(e => { console.error('FAIL:', e.message); process.exit(1); });
