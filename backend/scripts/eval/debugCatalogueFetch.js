/**
 * Debug why specific catalogue IDs return zero deals through
 * fetchCatalogueDeals: inspect category discovery and raw item parsing
 * layer by layer.
 */
const axios = require('axios');
const cheerio = require('cheerio');
const { getCategories, getItems } = require('../../services/salefinder');

const CASES = [
  { label: 'woolworths NSW', id: 66048, retailerId: 126, locationId: 4778, nameSelector: '.shelfProductTile-descriptionLink' },
  { label: 'coles VIC',      id: 66020, retailerId: 148, locationId: 8245, nameSelector: '.sf-item-heading' },
  { label: 'coles NSW (works)', id: 65988, retailerId: 148, locationId: 8245, nameSelector: '.sf-item-heading' },
];

const parse = (data) => {
  try { return JSON.parse(data.substring(1, data.length - 1).replace(/[\r\n\t]/g, '')); }
  catch { return null; }
};

(async () => {
  for (const c of CASES) {
    console.log(`\n=== ${c.label} (${c.id}) ===`);
    const cats = await getCategories(c.id, c.retailerId, c.locationId);
    console.log(`categories: ${cats.length}${cats.length ? ' — ' + cats.slice(0, 6).map(x => x.name).join(', ') : ''}`);

    if (cats.length) {
      const items = await getItems(c.id, cats[0].ids, c.locationId, c.nameSelector);
      console.log(`items in "${cats[0].name}": ${items.length}, with discount: ${items.filter(i => i.discountPercent > 0).length}`);
      if (items[0]) console.log('sample:', JSON.stringify(items[0]));
    } else {
      // Raw probe: what does productlist return without category filtering?
      const res = await axios.get(`https://embed.salefinder.com.au/productlist/category/${c.id}`, {
        params: { locationId: c.locationId, categoryId: '1', rows_per_page: 5, saleGroup: 0 },
        timeout: 15000,
      });
      const parsed = parse(res.data);
      const html = parsed?.content || '';
      const $ = cheerio.load(html);
      console.log(`raw productlist: content ${html.length} chars, .sf-item count: ${$('.sf-item').length}, links with categoryId: ${$('a[href*="categoryId"]').length}`);
      console.log('content head:', html.slice(0, 300).replace(/\s+/g, ' '));
    }
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
