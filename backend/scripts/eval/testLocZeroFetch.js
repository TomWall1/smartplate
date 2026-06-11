/** Full fetchCatalogueDeals test with locationId 0 on the failing catalogues. */
const { fetchCatalogueDeals } = require('../../services/salefinder');

(async () => {
  const cases = [
    ['woolworths NSW', 66048, { retailerId: 126, locationId: 0, nameSelector: '.shelfProductTile-descriptionLink', store: 'woolworths' }],
    ['woolworths VIC', 66045, { retailerId: 126, locationId: 0, nameSelector: '.shelfProductTile-descriptionLink', store: 'woolworths' }],
    ['coles VIC',      66020, { retailerId: 148, locationId: 0, nameSelector: '.sf-item-heading', store: 'coles' }],
  ];
  for (const [label, id, cfg] of cases) {
    const deals = await fetchCatalogueDeals({ id, name: label }, cfg);
    console.log(`${label}: ${deals.length} deals${deals[0] ? ` | sample: ${deals[0].name} $${deals[0].price}` : ''}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
