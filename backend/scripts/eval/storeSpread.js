/** Live hero spread for a store's served artifact, by the TRUE anchor hero
 *  (recipeMatcher._heroKeyFromDeals on the store-isolated deals).
 *  Run: node scripts/eval/storeSpread.js [store] */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const m = require('../../services/recipeMatcher');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const WORDS = ['chicken','beef','lamb','pork','mince','sausage','steak','salmon','fish','prawn','tuna','turkey','duck','bacon','ham','barramundi','snapper'];
const proteinOf = (n) => { n = (n || '').toLowerCase(); return WORDS.find((w) => new RegExp(`\\b${w}s?\\b`).test(n)) || '(veg/other)'; };
const store = (process.argv[2] || 'woolworths').toLowerCase();

(async () => {
  const recipes = (await pool.query('SELECT recipes FROM weekly_recipes_cache ORDER BY generated_at DESC LIMIT 1')).rows[0].recipes;
  const list = recipes
    .filter((rec) => !rec.storeOrder || rec.storeOrder[store] !== undefined)
    .map((rec) => ({ rec, sd: (rec.matchedDeals || []).filter((d) => (d.store || '').toLowerCase() === store) }))
    .filter((x) => x.sd.length)
    .sort((a, b) => (a.rec.storeOrder?.[store] ?? 1e9) - (b.rec.storeOrder?.[store] ?? 1e9));

  const top50 = list.slice(0, 50);
  const byProtein = {}, byHero = {};
  for (const { sd } of top50) {
    const hero = m._heroKeyFromDeals(sd);             // true anchor lane
    const key = hero || '(backfill/no-driver)';
    byHero[key] = (byHero[key] || 0) + 1;
    byProtein[proteinOf(hero)] = (byProtein[proteinOf(hero)] || 0) + 1;
  }
  console.log(`${store.toUpperCase()} served: ${list.length} | distinct hero lanes in top-50: ${Object.keys(byHero).length}`);
  console.log('top-50 (basic) by protein:');
  Object.entries(byProtein).sort((a, b) => b[1] - a[1]).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  console.log('top-50 (basic) by hero lane:');
  Object.entries(byHero).sort((a, b) => b[1] - a[1]).slice(0, 18).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
  await pool.end();
})().catch((e) => { console.error(e.message); process.exit(1); });
