/**
 * Measure the hero-ingredient problem across the served recipe artifact:
 * how many recipes have NO protein/centerpiece deal among their matched
 * deals, and how much of the claimed savings comes from pantry/bulk items.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

const PROTEIN_CATS = new Set(['meat', 'seafood']);
const PROTEIN_WORDS = ['chicken', 'beef', 'lamb', 'pork', 'mince', 'sausage', 'steak', 'salmon',
  'fish', 'prawn', 'shrimp', 'tuna', 'turkey', 'duck', 'bacon', 'ham', 'barramundi'];
const PANTRY_CATS = new Set(['oils_fats', 'condiments', 'sauces', 'grains', 'canned_preserved', 'herbs_spices', 'snacks', 'beverages']);

const hasProteinDeal = (r) => (r.matchedDeals || []).some((d) =>
  PROTEIN_CATS.has(d.productCategory) ||
  PROTEIN_WORDS.some((p) => new RegExp(`\\b${p}s?\\b`).test((d.ingredient || '').toLowerCase()))
);

(async () => {
  const res = await pool.query('SELECT recipes FROM weekly_recipes_cache ORDER BY generated_at DESC LIMIT 1');
  const recipes = res.rows[0].recipes;

  let noProtein = 0, pantrySavings = 0, totalSavings = 0, pantryOnly = 0;
  const examples = [];
  recipes.forEach((r, i) => {
    const protein = hasProteinDeal(r);
    if (!protein) {
      noProtein++;
      if (examples.length < 8) examples.push(`#${i + 1} ${r.title} — deals: ${(r.matchedDeals || []).map(d => d.ingredient).join(', ')}`);
    }
    let pantryOnlyFlag = (r.matchedDeals || []).length > 0;
    for (const d of r.matchedDeals || []) {
      totalSavings += d.saving || 0;
      if (PANTRY_CATS.has(d.productCategory)) pantrySavings += d.saving || 0;
      else pantryOnlyFlag = pantryOnlyFlag && false;
    }
    if (pantryOnlyFlag) pantryOnly++;
  });

  console.log(`recipes: ${recipes.length}`);
  console.log(`recipes with NO protein/centerpiece deal: ${noProtein} (${Math.round(noProtein / recipes.length * 100)}%)`);
  console.log(`recipes whose deals are pantry-ONLY: ${pantryOnly}`);
  console.log(`pantry/bulk share of all claimed savings: $${pantrySavings.toFixed(0)} of $${totalSavings.toFixed(0)} (${Math.round(pantrySavings / totalSavings * 100)}%)`);
  console.log('\nexamples without protein deals:');
  examples.forEach((e) => console.log('  ' + e));
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
