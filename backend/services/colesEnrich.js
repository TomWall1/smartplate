/**
 * colesEnrich.js
 *
 * Enriches Coles deal objects with product image URLs and direct product
 * links by calling the Coles _next/data product search endpoint.
 *
 * Flow for each deal:
 *   1. Normalise deal name to a clean keyword (reuses recipeMatcher logic)
 *   2. Check product-image-cache.json for key "coles:{keyword}"
 *   3. Cache hit  → use cached data, no API call
 *   4. Cache miss → call Coles search API, parse result, save to cache
 *   5. No match  → store null entry so we skip next week
 *
 * BUILD_ID strategy (Coles uses rotating Next.js build IDs):
 *   • Memory cache    → valid 30 min, covers one enrichment run
 *   • Disk cache      → persists across restarts; probed before use
 *   • HTML scrape     → fallback when disk cache is stale; may be blocked
 *                       by Akamai on flagged server IPs (graceful skip)
 */

const axios         = require('axios');
const cheerio       = require('cheerio');
const imageCache    = require('./imageCache');
const recipeMatcher = require('./recipeMatcher');

const COLES_BASE = 'https://www.coles.com.au';

const BROWSER_HEADERS = {
  'User-Agent':
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
  'Accept-Language': 'en-AU,en;q=0.9',
};

// ── BUILD_ID management ───────────────────────────────────────────────────────
//
// The Coles _next/data routes include a rotating BUILD_ID in the path.
// Crucially, _next/data API routes bypass Akamai bot detection — only the
// main HTML pages (/, /search, etc.) require the JS challenge. This means:
//   ✓ Probing a stored BUILD_ID always works (no Akamai block)
//   ✓ Product search always works once BUILD_ID is known
//   ✗ Scraping a fresh BUILD_ID from HTML may fail on flagged server IPs

const BUILD_ID_CACHE_KEY = '_coles_build_id';
let _buildIdSession = null; // { buildId: string, expiresAt: number }

function _loadCachedBuildId() {
  const entry = imageCache.get(BUILD_ID_CACHE_KEY);
  return entry?.buildId ?? null;
}

function _storeBuildId(buildId) {
  // Store as a special entry; imageCache.set wraps it with lastSeen etc.
  // We abuse the imageUrl field to persist the buildId string.
  imageCache.set(BUILD_ID_CACHE_KEY, { buildId, imageUrl: null, productUrl: null, stockcode: null });
}

/**
 * Probe whether a given BUILD_ID is still valid.
 * Uses the _next/data endpoint directly — Akamai does NOT protect these routes.
 */
async function _probeBuildId(buildId) {
  try {
    const url = `${COLES_BASE}/_next/data/${buildId}/en/search/products.json`;
    const res = await axios.get(url, {
      params: { q: 'a' },
      timeout: 12000,
      validateStatus: (s) => s < 500,
      headers: { ...BROWSER_HEADERS, 'Accept': 'application/json, */*', 'x-nextjs-data': '1' },
    });
    return res.status === 200;
  } catch {
    return false;
  }
}

/**
 * Scrape a fresh BUILD_ID from a Coles HTML page.
 * Tries /search?q=a, /on-special, / in sequence.
 * May return null if Akamai blocks the request on this server IP.
 */
async function _scrapeBuildId() {
  const PAGES = [
    `${COLES_BASE}/search?q=a`,
    `${COLES_BASE}/on-special`,
    `${COLES_BASE}/`,
  ];

  for (const pageUrl of PAGES) {
    try {
      console.log(`[ColesEnrich] Scraping BUILD_ID from ${pageUrl} ...`);
      const res = await axios.get(pageUrl, {
        timeout: 15000,
        validateStatus: (s) => s < 500,
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
          'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8',
          'Accept-Language': 'en-AU,en;q=0.9',
          'Accept-Encoding': 'gzip, deflate, br',
          'Cache-Control': 'no-cache',
          'Pragma': 'no-cache',
          'sec-ch-ua': '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"',
          'sec-ch-ua-mobile': '?0',
          'sec-ch-ua-platform': '"Windows"',
          'sec-fetch-dest': 'document',
          'sec-fetch-mode': 'navigate',
          'sec-fetch-site': 'none',
          'sec-fetch-user': '?1',
          'Upgrade-Insecure-Requests': '1',
        },
      });

      const $ = cheerio.load(res.data);
      const raw = $('#__NEXT_DATA__').html();
      if (!raw) continue; // Akamai challenge page — no __NEXT_DATA__, try next URL

      const nextData = JSON.parse(raw);
      const buildId  = nextData?.buildId;
      if (buildId) {
        console.log(`[ColesEnrich] Scraped BUILD_ID: ${buildId}`);
        return buildId;
      }
    } catch {
      // Network error — try next URL
    }
  }

  return null;
}

/**
 * Return the current Coles BUILD_ID.
 * Layers: memory cache → disk cache (probed) → HTML scrape.
 * Throws if all strategies fail — caller handles gracefully.
 */
async function _getBuildId() {
  // 1. In-memory (valid 30 min)
  if (_buildIdSession && Date.now() < _buildIdSession.expiresAt) {
    return _buildIdSession.buildId;
  }

  // 2. Disk cache — probe to confirm still valid
  const diskBuildId = _loadCachedBuildId();
  if (diskBuildId) {
    const valid = await _probeBuildId(diskBuildId);
    if (valid) {
      console.log(`[ColesEnrich] Using cached BUILD_ID: ${diskBuildId}`);
      _buildIdSession = { buildId: diskBuildId, expiresAt: Date.now() + 30 * 60 * 1000 };
      return diskBuildId;
    }
    console.log(`[ColesEnrich] Cached BUILD_ID is stale — refreshing...`);
  }

  // 3. Scrape fresh BUILD_ID from a Coles HTML page
  const freshBuildId = await _scrapeBuildId();
  if (!freshBuildId) {
    throw new Error(
      'Could not obtain a valid Coles BUILD_ID. ' +
      'Coles HTML pages may be blocked by Akamai on this server IP. ' +
      'Coles image enrichment will be skipped for this run.'
    );
  }

  _storeBuildId(freshBuildId);
  _buildIdSession = { buildId: freshBuildId, expiresAt: Date.now() + 30 * 60 * 1000 };
  return freshBuildId;
}

// ── Coles product search ───────────────────────────────────────────────────────

async function _searchColesProduct(keyword, buildId) {
  const url = `${COLES_BASE}/_next/data/${buildId}/en/search/products.json`;
  const res = await axios.get(url, {
    params: { q: keyword },
    timeout: 20000,
    headers: {
      ...BROWSER_HEADERS,
      'Accept': 'application/json, text/plain, */*',
      'Referer': `${COLES_BASE}/search?q=${encodeURIComponent(keyword)}`,
      'x-nextjs-data': '1',
    },
  });
  return res.data;
}

/**
 * Build a Coles product slug from individual fields when the API doesn't return one.
 * Format: "{brand}-{name}-{size}-{id}" — lowercase, spaces→hyphens, non-alphanum stripped.
 */
function _buildSlug(...parts) {
  const segment = (s) =>
    (s ?? '')
      .toLowerCase()
      .replace(/[^a-z0-9\s-]/g, '')
      .trim()
      .replace(/\s+/g, '-');

  return parts.map(segment).filter(Boolean).join('-') || null;
}

/**
 * Parse a Coles _next/data search response into { imageUrl, productUrl, stockcode }.
 * Returns null if no usable product is found.
 *
 * Response structure:
 *   pageProps.searchResults.results[] — each has:
 *     id, name, brand, size, slug (sometimes), imageUris[0].uri, pricing
 */
function _parseSearchResult(data, keyword) {
  const results =
    data?.pageProps?.searchResults?.results ??
    data?.pageProps?.initialSearchData?.results ??
    [];

  if (results.length === 0) return null;

  // Log field keys on first unique product type — useful for debugging API changes
  if (_loggedFieldsFor !== keyword.split(' ')[0]) {
    _loggedFieldsFor = keyword.split(' ')[0];
    console.log(`[ColesEnrich] Result fields for "${keyword}": ${Object.keys(results[0]).join(', ')}`);
  }

  for (const product of results) {
    const stockcode = (product.id ?? product.productId ?? product.stockcode)?.toString() ?? null;

    // Image URL — imageUris is an array of { uri } objects
    const imageUri = product.imageUris?.[0]?.uri ?? product.imageUrl ?? null;
    let imageUrl = null;
    if (imageUri) {
      imageUrl = imageUri.startsWith('http')
        ? imageUri
        : `https://productimages.coles.com.au${imageUri}`;
    }

    // Product URL — use slug if present, otherwise construct it
    const slug = product.slug ?? _buildSlug(product.brand, product.name, product.size, stockcode);
    const productUrl = slug ? `${COLES_BASE}/product/${slug}` : null;

    if (imageUrl || productUrl) {
      return { imageUrl, productUrl, stockcode };
    }
  }

  return null;
}

let _loggedFieldsFor = null;

// ── Main enrichment entry point ───────────────────────────────────────────────

const CACHE_PREFIX = 'coles:';

/**
 * Enrich an array of Coles deal objects with imageUrl and productUrl fields.
 * Uses the persistent image cache with "coles:" key prefix.
 *
 * @param {Array} deals — raw deal objects from SaleFinder (store === 'coles')
 * @returns {Promise<Array>} The same deals with imageUrl/productUrl/stockcode attached
 */
async function enrichDeals(deals) {
  if (deals.length === 0) return deals;

  console.log(`[ColesEnrich] Enriching ${deals.length} Coles deals with product images...`);
  const startTime = Date.now();

  let hits   = 0;
  let misses  = 0;
  let errors  = 0;
  let buildId = null;

  // Get BUILD_ID — memory → disk cache (probe) → HTML scrape
  try {
    buildId = await _getBuildId();
  } catch (err) {
    console.warn(`[ColesEnrich] ${err.message}`);
    return deals; // Skip enrichment, return deals without images
  }

  const enriched = [];
  const samples  = [];

  for (const deal of deals) {
    const keyword  = recipeMatcher.normalizeDealName(deal.name);
    const cacheKey = keyword ? `${CACHE_PREFIX}${keyword}` : null;

    if (!cacheKey) {
      enriched.push(deal);
      continue;
    }

    // ── Cache hit ──────────────────────────────────────────────────────────
    const cached = imageCache.get(cacheKey);
    if (cached !== undefined) {
      hits++;
      enriched.push({ ...deal, imageUrl: cached.imageUrl, productUrl: cached.productUrl, stockcode: cached.stockcode });
      continue;
    }

    // ── Cache miss — call Coles API ────────────────────────────────────────
    misses++;
    let result = null;

    try {
      const data = await _searchColesProduct(keyword, buildId);
      result = _parseSearchResult(data, keyword);
    } catch (err) {
      errors++;
      const status = err.response?.status;

      if (status === 404) {
        // BUILD_ID likely rotated mid-run (Coles deployed). Try refreshing once.
        console.warn(`[ColesEnrich] 404 for "${keyword}" — BUILD_ID may have rotated. Refreshing...`);
        try {
          _buildIdSession  = null;
          imageCache.set(BUILD_ID_CACHE_KEY, { buildId: null, imageUrl: null, productUrl: null, stockcode: null });
          buildId = await _getBuildId();
          const data = await _searchColesProduct(keyword, buildId);
          result = _parseSearchResult(data, keyword);
          errors--;
          console.log(`[ColesEnrich] BUILD_ID refreshed to: ${buildId}`);
        } catch (retryErr) {
          console.warn(`[ColesEnrich] BUILD_ID refresh failed: ${retryErr.message}`);
        }
      } else {
        console.warn(`[ColesEnrich] API error for "${keyword}" (${status ?? err.message})`);
      }
    }

    imageCache.set(cacheKey, result ?? { imageUrl: null, productUrl: null, stockcode: null });

    const enrichedDeal = {
      ...deal,
      imageUrl:   result?.imageUrl   ?? null,
      productUrl: result?.productUrl ?? null,
      stockcode:  result?.stockcode  ?? null,
    };
    enriched.push(enrichedDeal);

    if (result?.imageUrl && samples.length < 4) {
      samples.push({ name: deal.name, keyword, imageUrl: result.imageUrl, productUrl: result.productUrl });
    }

    await new Promise(r => setTimeout(r, 150));
  }

  const elapsed   = ((Date.now() - startTime) / 1000).toFixed(1);
  const total     = hits + misses;
  const hitRate   = total > 0 ? Math.round((hits / total) * 100) : 0;
  const withImage = enriched.filter(d => d.imageUrl).length;

  console.log(
    `[ColesEnrich] Done in ${elapsed}s — ` +
    `${hits} cache hits, ${misses} API calls (BUILD_ID: ${buildId}), ${errors} errors. ` +
    `Hit rate: ${hitRate}%. ${withImage}/${deals.length} deals have images.`
  );

  if (samples.length > 0) {
    console.log('[ColesEnrich] Sample enriched Coles deals:');
    samples.forEach((s, i) => {
      console.log(`  [${i + 1}] "${s.name}" → keyword: "${s.keyword}"`);
      console.log(`        imageUrl:   ${s.imageUrl}`);
      console.log(`        productUrl: ${s.productUrl}`);
    });
  }

  return enriched;
}

module.exports = { enrichDeals };
