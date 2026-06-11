/**
 * Probe the SaleFinder embed API to find where a catalogue's TITLE (which
 * includes the state, e.g. "Weekly Catalogue Nsw") is exposed for an ID.
 * Tries several known IDs and dumps JSONP keys + title-ish fields.
 */
const axios = require('axios');

const parse = (data) => {
  try { return JSON.parse(data.substring(1, data.length - 1).replace(/[\r\n\t]/g, '')); }
  catch { return null; }
};

(async () => {
  const ids = process.argv.slice(2).map(Number);
  if (!ids.length) ids.push(66087); // current woolworths NSW

  for (const id of ids) {
    console.log(`\n=== catalogue ${id} ===`);
    // 1. productlist — look at top-level JSONP keys
    try {
      const res = await axios.get(`https://embed.salefinder.com.au/productlist/category/${id}`, {
        params: { categoryId: '1', rows_per_page: 1, saleGroup: 0 },
        timeout: 15000,
      });
      const parsed = parse(res.data);
      if (parsed) {
        console.log('productlist keys:', Object.keys(parsed).join(', '));
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length < 300 && k !== 'content') console.log(`  ${k}: ${v}`);
        }
        // search content for title-ish markers
        const m = (parsed.content || '').match(/(title|saleName|catalogue[^"]{0,30})"?[^>]{0,80}/i);
        if (m) console.log('  content marker:', m[0].slice(0, 150));
      } else {
        console.log('productlist: unparsable, raw head:', String(res.data).slice(0, 150));
      }
    } catch (e) { console.log('productlist failed:', e.message); }

    // 2. getNavbar
    try {
      const res = await axios.get(`https://embed.salefinder.com.au/catalogue/getNavbar/${id}`, {
        params: { retailerId: 126 },
        timeout: 15000,
      });
      const parsed = parse(res.data);
      if (parsed) {
        console.log('getNavbar keys:', Object.keys(parsed).join(', '));
        for (const [k, v] of Object.entries(parsed)) {
          if (typeof v === 'string' && v.length < 300 && k !== 'content') console.log(`  ${k}: ${v}`);
        }
      }
    } catch (e) { console.log('getNavbar failed:', e.message); }

    // 3. catalogue page title from the main site (no state in URL — does it redirect/canonicalise?)
    try {
      const res = await axios.get(`https://www.salefinder.com.au/catalogues/view/${id}/`, {
        timeout: 15000, maxRedirects: 5, validateStatus: s => s < 500,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const title = String(res.data).match(/<title>([^<]*)<\/title>/i);
      console.log(`catalogues/view status ${res.status}, title: ${title ? title[1].trim() : '(none)'}, finalUrl: ${res.request?.res?.responseUrl || '?'}`);
    } catch (e) { console.log('catalogues/view failed:', e.message); }
  }
  process.exit(0);
})();
