/**
 * testWoolworthsAPI.js
 *
 * Investigates the unofficial Woolworths product search API.
 * Attempts a product search for "chicken breast" and logs the full
 * response structure, including whether product images are available.
 *
 * Run: node backend/scripts/testWoolworthsAPI.js
 */

const axios = require('axios');

const BASE = 'https://www.woolworths.com.au';

// Browser-like headers that the Woolworths site expects
const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept': 'application/json, text/plain, */*',
  'Accept-Language': 'en-AU,en;q=0.9',
  'Accept-Encoding': 'gzip, deflate, br',
  'Origin': BASE,
  'Referer': `${BASE}/shop/search/products?searchTerm=chicken+breast`,
};

// ── Step 1: GET homepage to establish a session / cookies ─────────────────────
async function getSessionCookies() {
  console.log('Step 1: Fetching homepage to establish session...');
  const response = await axios.get(BASE, {
    headers: BROWSER_HEADERS,
    withCredentials: true,
    timeout: 15000,
  });

  const cookies = (response.headers['set-cookie'] ?? [])
    .map(c => c.split(';')[0])
    .join('; ');

  console.log(`  Status: ${response.status}`);
  console.log(`  Cookies received: ${cookies ? cookies.substring(0, 120) + '...' : '(none)'}`);
  return cookies;
}

// ── Step 2: POST to search endpoint ───────────────────────────────────────────
async function searchProducts(searchTerm, cookies) {
  const url = `${BASE}/apis/ui/Search/products`;
  console.log(`\nStep 2: POST ${url}`);
  console.log(`  SearchTerm: "${searchTerm}"`);

  const body = {
    SearchTerm: searchTerm,
    PageNumber: 1,
    PageSize: 5,
    SortType: 'TraderRelevance',
    IsSpecial: false,
    ExcludeSearchTypes: ['UntraceableVendors'],
  };

  const headers = {
    ...BROWSER_HEADERS,
    'Content-Type': 'application/json',
    ...(cookies ? { Cookie: cookies } : {}),
  };

  const response = await axios.post(url, body, {
    headers,
    timeout: 20000,
  });

  return response.data;
}

// ── Step 3: Search specials endpoint ──────────────────────────────────────────
async function searchSpecials(cookies) {
  const url = `${BASE}/apis/ui/Product/Specials`;
  console.log(`\nStep 3: GET ${url}`);

  const params = {
    pageNumber: 1,
    pageSize: 5,
  };

  const headers = {
    ...BROWSER_HEADERS,
    ...(cookies ? { Cookie: cookies } : {}),
  };

  const response = await axios.get(url, {
    headers,
    params,
    timeout: 20000,
  });

  return response.data;
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function printProductSummary(product, index) {
  const p = product.Price ?? {};
  console.log(`\n  [${index + 1}] ${product.Name ?? '(no name)'}`);
  console.log(`      Brand:        ${product.Brand ?? '(none)'}`);
  console.log(`      Stockcode:    ${product.Stockcode ?? '(none)'}`);
  console.log(`      Price:        $${p.Now ?? p.Price ?? '?'}`);
  console.log(`      Was:          ${p.Was ? '$' + p.Was : '(not on special)'}`);
  console.log(`      IsOnSpecial:  ${product.IsOnSpecial ?? p.IsOnSpecial ?? false}`);
  console.log(`      SaveAmount:   ${p.SaveAmount ? '$' + p.SaveAmount : '(none)'}`);
  console.log(`      SavePercent:  ${p.SavePercent ? p.SavePercent + '%' : '(none)'}`);

  // Image fields — check multiple known patterns
  const imgSmall  = product.SmallImageFile  ?? product.ThumbnailImageFile ?? null;
  const imgMedium = product.MediumImageFile ?? null;
  const imgLarge  = product.LargeImageFile  ?? null;

  // Woolworths CDN pattern: https://cdn0.woolworths.media/content/wowproductimages/medium/{stockcode}.jpg
  const stockcode = product.Stockcode;
  const cdnMedium = stockcode
    ? `https://cdn0.woolworths.media/content/wowproductimages/medium/${stockcode}.jpg`
    : null;

  console.log(`      SmallImage:   ${imgSmall  ?? '(not in response)'}`);
  console.log(`      MediumImage:  ${imgMedium ?? '(not in response)'}`);
  console.log(`      LargeImage:   ${imgLarge  ?? '(not in response)'}`);
  console.log(`      CDN pattern:  ${cdnMedium ?? '(no stockcode)'}`);
  console.log(`      FullKeys:     ${Object.keys(product).join(', ')}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────
(async () => {
  console.log('═══════════════════════════════════════════════════');
  console.log(' Woolworths Unofficial API — Investigation Script   ');
  console.log('═══════════════════════════════════════════════════\n');

  let cookies = '';

  // ── Phase 1: Session ───────────────────────────────────────────────────────
  try {
    cookies = await getSessionCookies();
  } catch (err) {
    console.warn(`  WARNING: Could not fetch homepage (${err.message}). Continuing without cookies.`);
  }

  // ── Phase 2: Product Search ────────────────────────────────────────────────
  console.log('\n─── Product Search ────────────────────────────────');
  try {
    const data = await searchProducts('chicken breast', cookies);

    console.log('\n  Top-level response keys:', Object.keys(data).join(', '));

    const products = data.Products ?? data.products ?? data.SearchResultItems ?? [];
    console.log(`  Products returned: ${products.length}`);

    if (products.length === 0) {
      console.log('\n  No products in response. Raw data:');
      console.log(JSON.stringify(data, null, 2).substring(0, 2000));
    } else {
      products.slice(0, 3).forEach((p, i) => printProductSummary(p, i));

      // Print first product in full to see every field
      console.log('\n  ── First product RAW (full) ──');
      console.log(JSON.stringify(products[0], null, 2).substring(0, 3000));
    }
  } catch (err) {
    console.error(`  FAILED: ${err.response?.status ?? ''} ${err.message}`);
    if (err.response?.data) {
      console.error('  Response body:', JSON.stringify(err.response.data).substring(0, 500));
    }
  }

  // ── Phase 3: Specials ──────────────────────────────────────────────────────
  console.log('\n─── Specials Endpoint ─────────────────────────────');
  try {
    const data = await searchSpecials(cookies);

    console.log('\n  Top-level response keys:', Object.keys(data).join(', '));
    const products = data.Products ?? data.products ?? data.Bundles?.[0]?.Products ?? [];
    console.log(`  Specials returned: ${products.length}`);

    if (products.length > 0) {
      printProductSummary(products[0], 0);
    }
  } catch (err) {
    console.error(`  FAILED: ${err.response?.status ?? ''} ${err.message}`);
    if (err.response?.data) {
      console.error('  Response body:', JSON.stringify(err.response.data).substring(0, 500));
    }
  }

  // ── Phase 4: CDN image URL check ──────────────────────────────────────────
  console.log('\n─── CDN Image URL Pattern Test ────────────────────');
  console.log('  Testing known CDN pattern for stockcode 180837 (Woolworths chicken)...');
  try {
    const testUrl = 'https://cdn0.woolworths.media/content/wowproductimages/medium/180837.jpg';
    const res = await axios.head(testUrl, { timeout: 8000 });
    console.log(`  ${testUrl}`);
    console.log(`  Status: ${res.status} — Content-Type: ${res.headers['content-type']}`);
    console.log('  ✓ CDN image URL pattern is VALID — images are accessible');
  } catch (err) {
    console.error(`  CDN test failed: ${err.response?.status ?? err.message}`);
  }

  console.log('\n═══════════════════════════════════════════════════');
  console.log(' Done');
  console.log('═══════════════════════════════════════════════════');
})();
