/**
 * Check whether publisher recipe pages can be embedded in an iframe:
 * X-Frame-Options / Content-Security-Policy frame-ancestors headers.
 */
const axios = require('axios');

const PAGES = [
  ['recipetineats', 'https://www.recipetineats.com/chicken-fried-rice/'],
  ['jamieoliver',   'https://www.jamieoliver.com/recipes/fish/spice-island-coconut-fish-curry/'],
  ['womensweekly',  'https://www.womensweeklyfood.com.au/recipe/dinner/bacon-and-egg-burger-18102/'],
  ['donnahay',      'https://www.donnahay.com.au/recipes'],
  ['juliegoodwin',  'https://juliegoodwin.com.au/'],
];

(async () => {
  for (const [name, url] of PAGES) {
    try {
      const res = await axios.get(url, {
        timeout: 20000,
        maxRedirects: 5,
        validateStatus: () => true,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/125 Safari/537.36' },
      });
      const xfo = res.headers['x-frame-options'] || '(none)';
      const csp = res.headers['content-security-policy'] || '';
      const fa = csp.match(/frame-ancestors[^;]*/i)?.[0] || '(no frame-ancestors)';
      const frameable = xfo === '(none)' && fa === '(no frame-ancestors)';
      console.log(`${name}: HTTP ${res.status} | X-Frame-Options: ${xfo} | ${fa} | iframe-embeddable: ${frameable ? 'YES' : 'NO'}`);
    } catch (e) {
      console.log(`${name}: request failed — ${e.message}`);
    }
  }
  process.exit(0);
})();
