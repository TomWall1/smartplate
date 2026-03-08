/**
 * woolworthsEnrich.js
 *
 * Enriches Woolworths deal objects with product image URLs and direct product
 * links by calling the unofficial Woolworths product search API.
 *
 * Flow for each deal:
 *   1. Normalise deal name to a clean keyword (reuses recipeMatcher logic)
 *   2. Check product-image-cache.json — if found, use cached data (no API call)
 *   3. If not found — call Woolworths search API, parse result, save to cache
 *   4. If API returns nothing — store null entry so we skip it next week
 *
 * After all deals are processed, the caller should call imageCache.flush()
 * to persist new cache entries to disk.
 */

const axios       = require('axios');
const imageCache  = require('./imageCache');
const recipeMatcher = require('./recipeMatcher');

const WOO_BASE = 'https://www.woolworths.com.au';

const SESSION_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
  'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
  'Accept-Language': 'en-AU,en;q=0.9',
  'sec-ch-ua': '"Chromium";v="124", "Google Chrome";v="124", "Not-A.Brand";v="99"',
  'sec-ch-ua-mobile': '?0',
  'sec-ch-ua-platform': '"Windows"',
  'sec-fetch-dest': 'document',
  'sec-fetch-mode': 'navigate',
  'sec-fetch-site': 'none',
  'Upgrade-Insecure-Requests': '1',
};

const SEARCH_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

// ── In-process session cache (avoids homepage fetch per deal) ─────────────────
let _session = null; // { cookies: string, expiresAt: number }

const MAX_SESSION_RETRIES   = 3;
const SESSION_RETRY_DELAY   = 5000; // ms

async function _getSessionCookies() {
  if (_session && Date.now() < _session.expiresAt) {
    return _session.cookies;
  }

  console.log('[WoolworthsEnrich] Fetching new session cookies...');

  let lastErr;
  for (let attempt = 1; attempt <= MAX_SESSION_RETRIES; attempt++) {
    try {
      const res = await axios.get(WOO_BASE, {
        timeout: 15000,
        headers: SESSION_HEADERS,
      });

      const cookies = (res.headers['set-cookie'] ?? [])
        .map(c => c.split(';')[0])
        .join('; ');

      // Cache session for 20 minutes
      _session = { cookies, expiresAt: Date.now() + 20 * 60 * 1000 };
      return cookies;
    } catch (err) {
      lastErr = err;
      const status = err.response?.status;
      if (status === 403 && attempt < MAX_SESSION_RETRIES) {
        console.warn(
          `[WoolworthsEnrich] Session fetch 403 (attempt ${attempt}/${MAX_SESSION_RETRIES}) — retrying in ${SESSION_RETRY_DELAY / 1000}s...`
        );
        await new Promise(r => setTimeout(r, SESSION_RETRY_DELAY));
      } else {
        break;
      }
    }
  }

  throw lastErr;
}

// ── Woolworths product search API ─────────────────────────────────────────────

async function _searchWoolworthsProduct(keyword, cookies) {
  const url  = `${WOO_BASE}/apis/ui/Search/products`;
  const body = {
    SearchTerm:           keyword,
    PageNumber:           1,
    PageSize:             5,
    SortType:             'TraderRelevance',
    IsSpecial:            false,
    ExcludeSearchTypes:   ['UntraceableVendors'],
  };
  const headers = {
    'User-Agent':     SEARCH_USER_AGENT,
    'Content-Type':   'application/json',
    'Accept':         'application/json, text/plain, */*',
    'Accept-Language':'en-AU,en;q=0.9',
    'Origin':         WOO_BASE,
    'Referer':        `${WOO_BASE}/shop/search/products?searchTerm=${encodeURIComponent(keyword)}`,
    ...(cookies ? { Cookie: cookies } : {}),
  };

  const res = await axios.post(url, body, { headers, timeout: 20000 });
  return res.data;
}

/**
 * Parse the Woolworths search response into a simple { imageUrl, productUrl, stockcode } object.
 * Returns null if no usable product is found.
 *
 * Response structure: data.Products[i] = { Products: [...productVariants], Name, DisplayName }
 * Actual product data lives in data.Products[i].Products[0].
 */
function _parseSearchResult(data) {
  const productGroups = data?.Products ?? [];

  for (const group of productGroups) {
    const variants = group.Products ?? [];
    if (variants.length === 0) continue;

    const product = variants[0];
    const stockcode = product.Stockcode?.toString() ?? null;
    if (!stockcode) continue;

    const imageUrl = product.MediumImageFile ?? product.SmallImageFile ?? null;
    const productUrl = product.UrlFriendlyName
      ? `${WOO_BASE}/shop/productdetails/${stockcode}/${product.UrlFriendlyName}`
      : null;

    return { imageUrl, productUrl, stockcode };
  }

  return null;
}

// ── Main enrichment entry point ───────────────────────────────────────────────

/**
 * Enrich an array of Woolworths deal objects with imageUrl and productUrl fields.
 * Uses the persistent image cache — only calls the Woolworths API for cache misses.
 *
 * @param {Array} deals — raw deal objects from SaleFinder (store === 'woolworths')
 * @returns {Promise<Array>} The same deals with imageUrl/productUrl/stockcode attached
 */
async function enrichDeals(deals) {
  if (deals.length === 0) return deals;

  console.log(`[WoolworthsEnrich] Enriching ${deals.length} Woolworths deals with product images...`);
  const startTime = Date.now();

  let hits   = 0;
  let misses  = 0;
  let errors  = 0;
  let cookies = '';

  // Fetch session cookies once for all API calls in this run.
  // If all retries fail, skip enrichment — deals are returned without images.
  try {
    cookies = await _getSessionCookies();
  } catch (err) {
    console.warn(
      `[WoolworthsEnrich] Could not fetch session cookies after ${MAX_SESSION_RETRIES} attempts: ${err.message}. ` +
      'Skipping image enrichment — deals will load without product images.'
    );
    return deals;
  }

  const enriched = [];

  for (const deal of deals) {
    const keyword = recipeMatcher.normalizeDealName(deal.name);
    if (!keyword) {
      enriched.push(deal);
      continue;
    }

    // ── Cache hit ──────────────────────────────────────────────────────────
    const cached = imageCache.get(keyword);
    if (cached !== undefined) {
      hits++;
      enriched.push({
        ...deal,
        imageUrl:   cached.imageUrl,
        productUrl: cached.productUrl,
        stockcode:  cached.stockcode,
      });
      continue;
    }

    // ── Cache miss — call Woolworths API ───────────────────────────────────
    misses++;
    let result = null;

    try {
      const data = await _searchWoolworthsProduct(keyword, cookies);
      result = _parseSearchResult(data);
    } catch (err) {
      errors++;
      // If session expired (403/401), try refreshing cookies once
      if (err.response?.status === 403 || err.response?.status === 401) {
        try {
          _session = null; // force refresh
          cookies = await _getSessionCookies();
          const data = await _searchWoolworthsProduct(keyword, cookies);
          result = _parseSearchResult(data);
          errors--; // recovered
        } catch (retryErr) {
          console.warn(`[WoolworthsEnrich] Retry failed for "${keyword}": ${retryErr.message}`);
        }
      } else {
        console.warn(`[WoolworthsEnrich] API error for "${keyword}": ${err.message}`);
      }
    }

    // Store in cache regardless of outcome (null = don't retry next week)
    imageCache.set(keyword, result ?? { imageUrl: null, productUrl: null, stockcode: null });

    enriched.push({
      ...deal,
      imageUrl:   result?.imageUrl   ?? null,
      productUrl: result?.productUrl ?? null,
      stockcode:  result?.stockcode  ?? null,
    });

    // Polite delay between API calls (only needed for cache misses)
    await new Promise(r => setTimeout(r, 150));
  }

  const elapsed   = ((Date.now() - startTime) / 1000).toFixed(1);
  const total     = hits + misses;
  const hitRate   = total > 0 ? Math.round((hits / total) * 100) : 0;
  const withImage = enriched.filter(d => d.imageUrl).length;

  console.log(
    `[WoolworthsEnrich] Done in ${elapsed}s — ` +
    `${hits} cache hits, ${misses} API calls, ${errors} errors. ` +
    `Hit rate: ${hitRate}%. ${withImage}/${deals.length} deals have images.`
  );

  imageCache.setLastRunStats({
    hits,
    misses,
    errors,
    total,
    hitRate,
    withImage,
    elapsedSeconds: parseFloat(elapsed),
  });

  return enriched;
}

module.exports = { enrichDeals };
