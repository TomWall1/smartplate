/**
 * Map the live SaleFinder catalogue landscape: probe an ID window and print
 * every valid catalogue's saleName/areaName/dates, classified by retailer
 * and state. Ground truth for the title-based discovery rewrite.
 *
 * Usage: node backend/scripts/eval/mapCatalogueLandscape.js [centerId] [span]
 */
const axios = require('axios');

const CENTER = parseInt(process.argv[2] || '66050', 10);
const SPAN   = parseInt(process.argv[3] || '150', 10);
const BATCH  = 8;

const parse = (data) => {
  try { return JSON.parse(data.substring(1, data.length - 1).replace(/[\r\n\t]/g, '')); }
  catch { return null; }
};

async function info(id) {
  try {
    const res = await axios.get(`https://embed.salefinder.com.au/productlist/category/${id}`, {
      params: { categoryId: '1', rows_per_page: 1, saleGroup: 0 },
      timeout: 10000,
    });
    const parsed = parse(res.data);
    if (!parsed?.saleName) return null;
    return {
      id,
      saleName: parsed.saleName,
      areaName: parsed.areaName || '',
      start: (parsed.startDate || '').slice(0, 10),
      end: (parsed.endDate || '').slice(0, 10),
    };
  } catch { return null; }
}

(async () => {
  const ids = Array.from({ length: SPAN * 2 + 1 }, (_, i) => CENTER - SPAN + i);
  const found = [];
  for (let i = 0; i < ids.length; i += BATCH) {
    const batch = await Promise.all(ids.slice(i, i + BATCH).map(info));
    found.push(...batch.filter(Boolean));
    await new Promise(r => setTimeout(r, 200));
  }
  found.sort((a, b) => a.id - b.id);
  const today = new Date().toISOString().slice(0, 10);
  for (const f of found) {
    const fresh = f.end >= today ? 'CURRENT' : 'expired';
    console.log(`${f.id} | ${f.saleName.padEnd(38)} | ${f.areaName.padEnd(30)} | ${f.start}..${f.end} ${fresh}`);
  }
  console.log(`\n${found.length} valid catalogues in ${CENTER - SPAN}..${CENTER + SPAN}; ${found.filter(f => f.end >= today).length} current`);
  process.exit(0);
})();
