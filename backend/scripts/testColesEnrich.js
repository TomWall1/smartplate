/**
 * testColesEnrich.js
 *
 * Standalone test for Coles product image enrichment.
 * Verifies BUILD_ID extraction and product search without running the full server.
 *
 * Run: node backend/scripts/testColesEnrich.js
 */

const { enrichDeals } = require('../services/colesEnrich');
const imageCache      = require('../services/imageCache');

// Small set of representative Coles deal names (as SaleFinder would return them)
const TEST_DEALS = [
  { name: 'Coles RSPCA Approved Chicken Breast Fillets', store: 'coles', price: 9.00, originalPrice: 14.00 },
  { name: 'Coles Beef Mince 500g',                      store: 'coles', price: 5.00, originalPrice: 7.00  },
  { name: 'Coles Salmon Fillets 400g',                   store: 'coles', price: 8.50, originalPrice: 12.00 },
  { name: 'Coles Full Cream Milk 2L',                    store: 'coles', price: 2.20, originalPrice: 3.00  },
  { name: 'Coles Free Range Eggs 12 Pack',               store: 'coles', price: 5.50, originalPrice: 7.50  },
];

(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Coles Enrich — Integration Test                   ');
  console.log('═══════════════════════════════════════════════════\n');

  console.log(`Testing with ${TEST_DEALS.length} deals...\n`);

  try {
    const enriched = await enrichDeals(TEST_DEALS);

    console.log('\n─── Results ────────────────────────────────────────');
    let withImage = 0;
    enriched.forEach((deal, i) => {
      const status = deal.imageUrl ? '✓ IMAGE' : '✗ no image';
      console.log(`\n[${i + 1}] ${status}`);
      console.log(`     Name:       ${deal.name}`);
      console.log(`     imageUrl:   ${deal.imageUrl ?? '(none)'}`);
      console.log(`     productUrl: ${deal.productUrl ?? '(none)'}`);
      console.log(`     stockcode:  ${deal.stockcode ?? '(none)'}`);
      if (deal.imageUrl) withImage++;
    });

    console.log(`\n─── Summary ─────────────────────────────────────────`);
    console.log(`  ${withImage}/${TEST_DEALS.length} deals enriched with images`);
    console.log(`  Cache entries after run: ${imageCache.size()}`);

    // Flush so we can inspect the cache file
    imageCache.flush();
    console.log('  Cache flushed to disk.');

  } catch (err) {
    console.error('\nTest failed:', err.message);
    process.exit(1);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Done');
  console.log('═══════════════════════════════════════════════════');
})();
