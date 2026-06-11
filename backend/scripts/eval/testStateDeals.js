/**
 * Validate the corrected state catalogue IDs: fetch two states per retailer
 * and measure deal-set overlap. Distinct catalogues should show partial
 * overlap (national promos shared, state lines differ); the old bug showed
 * 100% overlap because every state served the same catalogue.
 */
const { fetchCatalogueDeals, loadStateIds } = require('../../services/salefinder');

const CONFIGS = {
  // locationId 0 always: region-mismatched locations blank the catalogue
  woolworths: { retailerId: 126, locationId: 0, nameSelector: '.shelfProductTile-descriptionLink', store: 'woolworths' },
  coles:      { retailerId: 148, locationId: 0, nameSelector: '.sf-item-heading',                  store: 'coles' },
  iga:        { retailerId: 183, locationId: 0, nameSelector: '.sf-item-heading',                  store: 'iga' },
};

(async () => {
  const ids = loadStateIds();
  for (const retailer of ['woolworths', 'coles', 'iga']) {
    const a = ids[retailer]?.nsw;
    const b = ids[retailer]?.vic;
    if (!a || !b) { console.log(`${retailer}: missing nsw/vic id, skipping`); continue; }

    const cfg = CONFIGS[retailer];
    const dealsA = await fetchCatalogueDeals({ id: a, name: `${retailer} nsw` }, cfg);
    const dealsB = await fetchCatalogueDeals({ id: b, name: `${retailer} vic` }, cfg);
    const setA = new Set(dealsA.map(d => d.name));
    const setB = new Set(dealsB.map(d => d.name));
    const shared = [...setA].filter(n => setB.has(n)).length;
    console.log(`${retailer}: NSW(${a})=${setA.size} deals, VIC(${b})=${setB.size} deals, shared=${shared} (${setA.size ? Math.round(shared / setA.size * 100) : 0}% of NSW)`);
    if (a === b) console.log(`  WARNING: same id for both states`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
