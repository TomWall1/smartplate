/**
 * Debug script: run the full protein filter and show which recipes qualify.
 * Run from backend/: node scripts/testProteinFilter.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const dealService   = require('../services/dealService');
const recipeMatcher = require('../services/recipeMatcher');

async function main() {
  console.log('Loading deals...\n');
  const deals = await dealService.getCurrentDeals();
  console.log(`Loaded ${deals.length} deals.\n`);

  // ── Run without protein filter to see the full match landscape ──────────────
  const origFilter = recipeMatcher._hasProteinMatch.bind(recipeMatcher);
  recipeMatcher._hasProteinMatch = () => true;
  const allMatched = recipeMatcher.matchDeals(deals);   // top 20 by matchScore, no protein gate
  recipeMatcher._hasProteinMatch = origFilter;

  // ── Also run with the real filter to get the final set ──────────────────────
  console.log('\n' + '='.repeat(80));
  console.log('RUNNING FULL MATCH WITH PROTEIN FILTER (live code)');
  console.log('='.repeat(80) + '\n');
  const withFilter = recipeMatcher.matchDeals(deals);

  console.log('\n' + '='.repeat(80));
  console.log('RESULTS');
  console.log('='.repeat(80));
  console.log(`\nRecipes in top-20 by score (NO protein gate): ${allMatched.length}`);
  console.log(`Recipes passing protein filter:               ${withFilter.length}\n`);

  if (withFilter.length === 0) {
    console.log('⚠️  No recipes passed the protein filter with today\'s deals.');
    console.log('   This means no library recipe has a protein ingredient on special.');
    console.log('   Deals available today (proteins only):');
    const normDeals = deals.map(d => ({
      ...d,
      keywords: recipeMatcher.normalizeDealName(d.name),
    }));
    const proteins = ['chicken','beef','lamb','pork','mince','sausage','steak',
      'salmon','fish','prawn','shrimp','seafood','tuna','turkey','duck','veal',
      'bacon','ham','barramundi','snapper','trout','cod','schnitzel','rump',
      'fillet','drumstick','wing','breast','thigh'];
    const proteinDeals = normDeals.filter(d =>
      proteins.some(p => d.keywords.split(/\s+/).includes(p))
    );
    proteinDeals.forEach(d => console.log(`  [${d.store}] ${d.name} → "${d.keywords}"`));
  } else {
    console.log('Recipes that PASSED (will appear in weekly list):');
    withFilter.forEach((r, i) => {
      const pDeal = r.matchedDeals.find(d => {
        const words = d.ingredient.toLowerCase().split(/\s+/).map(w => {
          // singularise
          if (w.endsWith('ies')) return w.slice(0, -3) + 'y';
          if (w.endsWith('ves')) return w.slice(0, -3) + 'f';
          if (w.endsWith('s') && !w.endsWith('ss') && !w.endsWith('us') && w.length > 3) return w.slice(0, -1);
          return w;
        });
        const proteins = ['chicken','beef','lamb','pork','mince','sausage','steak',
          'salmon','fish','prawn','shrimp','seafood','tuna','turkey','duck','veal',
          'bacon','ham','barramundi','snapper','trout','cod','schnitzel','rump',
          'fillet','drumstick','wing','breast','thigh'];
        return proteins.some(p => words.includes(p));
      });
      const qual = pDeal ? `"${pDeal.ingredient}" (${pDeal.store})` : '?';
      console.log(`  ${i+1}. "${r.title}"`);
      console.log(`     qualifying protein: ${qual}`);
      console.log(`     all matched: ${r.matchedDeals.map(d => `"${d.ingredient}"`).join(', ')}`);
    });
  }

  console.log('\nRecipes in top-20 that FAILED protein filter:');
  const failedTitles = allMatched.filter(r => !withFilter.some(w => w.title === r.title));
  failedTitles.forEach(r => {
    const ings = r.matchedDeals.map(d => `"${d.ingredient}"`).join(', ');
    console.log(`  ✗ "${r.title}"  matched on: ${ings}`);
  });
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
