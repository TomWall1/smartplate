/**
 * Dump unique (ingredient, dealName) candidate pairs produced by the text/PI
 * matcher against the current prod deals snapshot. No Claude calls.
 * Output: backend/scripts/eval/candidate-pairs.json
 *
 * Usage: node backend/scripts/eval/dumpCandidatePairs.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query('SELECT data FROM deals_cache ORDER BY last_updated DESC LIMIT 1');
  await pool.end();
  if (!r.rows[0]) throw new Error('No deals_cache row');
  const cache = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data;
  const deals = [...cache.woolworths, ...cache.coles, ...cache.iga];
  console.log(`Loaded ${deals.length} prod deals (${cache.lastUpdated})`);

  const recipeMatcher = require('../../services/recipeMatcher');
  const matched = await recipeMatcher.matchDeals(deals, 300);

  const pairs = new Map();
  for (const recipe of matched) {
    for (const md of recipe.matchedDeals || []) {
      if (!md.ingredient || !md.dealName) continue;
      const key = `${md.ingredient}||${md.dealName}`;
      if (!pairs.has(key)) {
        pairs.set(key, { ingredient: md.ingredient, dealName: md.dealName, recipes: 0 });
      }
      pairs.get(key).recipes++;
    }
  }

  const out = [...pairs.values()].sort((a, b) => b.recipes - a.recipes);
  const outPath = path.join(__dirname, 'candidate-pairs.json');
  fs.writeFileSync(outPath, JSON.stringify(out, null, 2), 'utf8');
  console.log(`Wrote ${out.length} unique candidate pairs to ${outPath}`);
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
