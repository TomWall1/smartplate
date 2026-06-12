/** Verify stored recipe artifacts respect the content boundary. */
require('dotenv').config({ path: require('path').join(__dirname, '..', '..', '.env') });
const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });

(async () => {
  const r = await pool.query('SELECT recipes FROM weekly_recipes_cache ORDER BY generated_at DESC LIMIT 1');
  const recipes = r.rows[0].recipes;
  const sample = recipes[0];
  console.log('national recipes:', recipes.length);
  console.log('sample:', sample.title, '|', sample.source);
  console.log('steps:', JSON.stringify(sample.steps), '| instructions:', JSON.stringify(sample.instructions), '| description:', JSON.stringify(sample.description));
  console.log('embedAllowed:', sample.embedAllowed, '| sourceUrl:', sample.sourceUrl);
  console.log('ingredients sample:', JSON.stringify(sample.allIngredients.slice(0, 5)));
  const withSteps = recipes.filter(x => (x.steps || []).length > 0 || x.instructions).length;
  const withEmbed = recipes.filter(x => typeof x.embedAllowed === 'boolean').length;
  const quantified = recipes.filter(x => (x.allIngredients || []).some(i => /^\d/.test(i))).length;
  console.log(`recipes with steps/instructions: ${withSteps} (expect 0) | with embedAllowed: ${withEmbed}/${recipes.length} | with leading-digit ingredients: ${quantified} (expect 0)`);
  await pool.end();
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
