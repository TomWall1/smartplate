/**
 * Test how locationId affects productlist results per catalogue:
 * the Sydney locationIds appear to blank out other states' catalogues.
 */
const axios = require('axios');
const cheerio = require('cheerio');

const parse = (data) => {
  try { return JSON.parse(data.substring(1, data.length - 1).replace(/[\r\n\t]/g, '')); }
  catch { return null; }
};

async function probe(id, locationId) {
  const params = { categoryId: '1', rows_per_page: 10, saleGroup: 0 };
  if (locationId !== undefined) params.locationId = locationId;
  const res = await axios.get(`https://embed.salefinder.com.au/productlist/category/${id}`, { params, timeout: 15000 });
  const parsed = parse(res.data);
  const html = parsed?.content || '';
  const $ = cheerio.load(html);
  return { content: html.length, items: $('.sf-item').length, catLinks: $('a[href*="categoryId"]').length };
}

(async () => {
  const cases = [
    ['woolworths NSW 66048', 66048],
    ['woolworths VIC 66045', 66045],
    ['coles VIC 66020', 66020],
    ['coles NSW 65988', 65988],
    ['iga NSW 66083', 66083],
  ];
  for (const [label, id] of cases) {
    const omitted = await probe(id, undefined);
    const zero    = await probe(id, 0);
    const sydney  = await probe(id, id === 65988 || id === 66020 ? 8245 : 4778);
    console.log(`${label}: omitted={c:${omitted.content},items:${omitted.items},cats:${omitted.catLinks}} zero={c:${zero.content},items:${zero.items},cats:${zero.catLinks}} sydneyLoc={c:${sydney.content},items:${sydney.items},cats:${sydney.catLinks}}`);
  }
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
