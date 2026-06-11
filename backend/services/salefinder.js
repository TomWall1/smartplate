/**
 * SaleFinder Embed API Client
 *
 * Fetches live supermarket catalogue specials from the SaleFinder embed API.
 * API base: https://embed.salefinder.com.au/
 *
 * Endpoints used:
 *   catalogue/getNavbar/{saleId}          → category list (JSONP)
 *   productlist/category/{saleId}         → product items (JSONP)
 *
 * Current catalogue IDs are discovered by scraping salefinder.com.au.
 * State-specific catalogue IDs are stored in backend/data/state-catalogue-ids.json
 * and refreshed weekly by running scripts/discoverStateCatalogues.js.
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const STATE_IDS_PATH = path.join(__dirname, '..', 'data', 'state-catalogue-ids.json');

function loadStateIds() {
  try {
    return JSON.parse(fs.readFileSync(STATE_IDS_PATH, 'utf8'));
  } catch {
    return {};
  }
}

const BASE_URL = 'https://embed.salefinder.com.au/';

// ── JSONP helper ────────────────────────────────────────────────────

function parseJSONP(data) {
  if (typeof data !== 'string' || data.length < 3) return null;
  try {
    return JSON.parse(data.substring(1, data.length - 1).replace(/[\r\n\t]/g, ''));
  } catch {
    return null;
  }
}

// ── Discover current catalogue IDs from salefinder.com.au ───────────

async function discoverCatalogueIds(retailerSlug) {
  const url = `https://www.salefinder.com.au/${retailerSlug}-catalogue`;
  console.log(`[SaleFinder] Discovering catalogues from ${url}`);
  const res = await axios.get(url, {
    timeout: 15000,
    headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
  });

  const $ = cheerio.load(res.data);
  const catalogues = [];
  const slugLower = retailerSlug.toLowerCase();

  $('a[href*="-catalogue/"]').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(new RegExp(`/${slugLower}-catalogue/([^/]+)/(\\d+)/`, 'i'));
    if (match) {
      const name = match[1].replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
      const id = parseInt(match[2]);
      if (!catalogues.find(c => c.id === id)) {
        catalogues.push({ id, name });
      }
    }
  });

  if (catalogues.length === 0) {
    // Log a sample of the HTML to help debug if the page structure changed
    const allLinks = [];
    $('a[href*="catalogue"]').each((_, el) => allLinks.push($(el).attr('href')));
    console.warn(`[SaleFinder] No catalogues found for ${retailerSlug}. Sample links on page: ${allLinks.slice(0, 10).join(', ') || '(none)'}`);
  } else {
    console.log(`[SaleFinder] Found ${catalogues.length} catalogue(s) for ${retailerSlug}: ${catalogues.map(c => `${c.name}(${c.id})`).join(', ')}`);
  }

  return catalogues;
}

// ── Parse category links from HTML ──────────────────────────────────

function parseCategoriesFromHTML($) {
  const categories = [];
  const seen = new Set();

  $('a[href*="categoryId"], .sf-navcategory-link').each((_, el) => {
    const href = $(el).attr('href') || '';
    const match = href.match(/categoryId=([\d,]+)/);
    if (match && !seen.has(match[1])) {
      seen.add(match[1]);
      // Strip trailing numbers (Coles appends item counts, e.g., "Pantry66")
      const rawName = $(el).text().trim();
      const name = rawName.replace(/\d+$/, '').trim();
      categories.push({ name, ids: match[1] });
    }
  });

  return categories;
}

// ── Fetch categories (tries two methods) ────────────────────────────

async function getCategories(catalogueId, retailerId, locationId) {
  // Method 1: getNavbar endpoint (works for Coles)
  try {
    const res = await axios.get(`${BASE_URL}catalogue/getNavbar/${catalogueId}`, {
      params: { retailerId },
      timeout: 15000,
    });
    const parsed = parseJSONP(res.data);
    if (parsed?.content) {
      const cats = parseCategoriesFromHTML(cheerio.load(parsed.content));
      if (cats.length > 0) return cats;
    }
  } catch (err) {
    console.warn(`[SaleFinder] getNavbar failed for catalogue ${catalogueId}: ${err.message}`);
  }

  // Method 2: productlist navbar (works for Woolworths)
  try {
    const res = await axios.get(`${BASE_URL}productlist/category/${catalogueId}`, {
      params: { locationId, categoryId: '1', rows_per_page: 1, saleGroup: 0 },
      timeout: 15000,
    });
    const parsed = parseJSONP(res.data);
    if (parsed?.content) {
      const cats = parseCategoriesFromHTML(cheerio.load(parsed.content));
      if (cats.length > 0) return cats;
    }
  } catch (err) {
    console.warn(`[SaleFinder] productlist failed for catalogue ${catalogueId}: ${err.message}`);
  }

  console.warn(`[SaleFinder] No categories found for catalogue ${catalogueId} (both methods returned empty)`);
  return [];
}

// ── Fetch items for given category IDs ──────────────────────────────

async function getItems(catalogueId, categoryIds, locationId, nameSelector) {
  const res = await axios.get(`${BASE_URL}productlist/category/${catalogueId}`, {
    params: {
      locationId,
      categoryId: categoryIds,
      rows_per_page: 500,
      saleGroup: 0,
    },
    timeout: 30000,
  });

  const parsed = parseJSONP(res.data);
  if (!parsed || !parsed.content) return [];

  const $ = cheerio.load(parsed.content);
  const items = [];

  $('.sf-item').each((_, el) => {
    const $item = $(el);

    const name = (
      $item.find(nameSelector).text().trim() ||
      $item.find('.sf-item-heading').text().trim() ||
      $item.find('a[title]').attr('title') || ''
    ).trim();

    const salePriceText = $item.find('.sf-pricedisplay').text().trim();
    const saveAmountText = $item.find('.sf-regprice').text().trim();
    const rawPriceText = $item.find('.sf-regoption').text().trim();

    const salePrice = parseFloat(salePriceText.replace(/[^0-9.]/g, '')) || 0;
    const saveAmount = parseFloat(saveAmountText.replace(/[^0-9.]/g, '')) || 0;
    const regularPrice = salePrice + saveAmount;

    // Extract unit from the price display text (e.g., "$3.50 each" → "each", "$9.50 kg" → "per kg")
    const unitMatch = salePriceText.match(/\d\s*(each|per\s+\w+|kg|g|ml|litre|L|pack|bundle)\b/i);
    const unit = unitMatch ? unitMatch[1].trim() : 'each';

    if (name && salePrice > 0) {
      const discountPercent = regularPrice > salePrice
        ? ((regularPrice - salePrice) / regularPrice) * 100
        : 0;
      items.push({ name, regularPrice, salePrice, saveAmount, discountPercent, unit });
    }
  });

  return items;
}

// ── Category filtering & mapping ────────────────────────────────────

// SaleFinder category name → app category
const CATEGORY_MAP = {
  // Woolworths / IGA category names
  'bakery':                    'Bakery',
  'baking':                    'Pantry',
  'biscuits & snacks':         'Pantry',
  'breakfast foods':           'Pantry',
  'canned & packet food':      'Pantry',
  'condiments':                'Pantry',
  'confectionery':             'Pantry',
  'cooking, seasoning & gravy':'Pantry',
  'dairy':                     'Dairy',
  'deli & chilled':            'Deli',
  'desserts':                  'Pantry',
  'drinks':                    'Drinks',
  'frozen food':               'Frozen',
  'fruit & vegetables':        'Fruit & Vegetables',
  'groceries':                 'Pantry',
  'health foods':              'Pantry',
  'international foods':       'Pantry',
  'jams & spreads':            'Pantry',
  'meat':                      'Meat',
  'seafood':                   'Seafood',
  'baby':                      'Baby',
  'half price special':        'Specials',
  'low price everyday':        'Specials',
  // Coles category names
  'bread & bakery':            'Bakery',
  'meat, seafood & deli':      'Meat',
  'dairy, eggs & meals':       'Dairy',
  'pantry':                    'Pantry',
  'frozen':                    'Frozen',
  'half price specials':       'Specials',
  // Main-site URL slug variants (hyphens replaced with spaces)
  'biscuits and snacks':       'Pantry',
  'breakfast foods':           'Pantry',
  'canned and packet food':    'Pantry',
  'cooking seasoning and gravy':'Pantry',
  'fruit and vegetables':      'Fruit & Vegetables',
  'deli and chilled':          'Deli',
  'health foods':              'Pantry',
  'international foods':       'Pantry',
  'jams and spreads':          'Pantry',
  'frozen food':               'Frozen',
  'beer wine and spirit':      'Drinks',
  'bread and bakery':          'Bakery',
  'meat seafood and deli':     'Meat',
  'dairy eggs and meals':      'Dairy',
  'half price special':        'Specials',
  'low price everyday':        'Specials',
};

// Categories to exclude (non-food)
const EXCLUDED_CATEGORIES = new Set([
  // Woolworths / IGA non-food
  'beauty',
  'beer, wine & spirit',
  'health & wellbeing',
  'home & outdoor',
  'household cleaning',
  'papergoods, wraps & bags',
  'pet care',
  'stationery & media',
  'toiletries',
  // Coles non-food
  'household',
  'health & beauty',
  'pet',
  'clothing',
  'liquor',
]);

function isFoodCategory(categoryName) {
  return !EXCLUDED_CATEGORIES.has(categoryName.toLowerCase());
}

function mapCategory(sfCategoryName) {
  return CATEGORY_MAP[sfCategoryName.toLowerCase()] || 'Other';
}

// Keyword filter to exclude non-food items that sneak into "Specials" or other mixed categories
const NON_FOOD_KEYWORDS = [
  'sim ', 'sim starter', 'prepaid', 'starter pack', 'mobile $', 'autorecharge',
  'deodorant', 'antiperspirant', 'shampoo', 'conditioner', 'body wash',
  'mascara', 'lipstick', 'foundation', 'concealer', 'eyeliner', 'nail polish',
  'moisturiser', 'moisturizer', 'sunscreen', 'lotion', 'cleanser',
  'toothpaste', 'toothbrush', 'mouthwash', 'dental',
  'toilet paper', 'tissues', 'paper towel', 'wipes',
  'laundry', 'dishwash', 'detergent', 'fabric softener',
  'magazine', 'batteries', 'light bulb', 'candle',
  'dog food', 'cat food', 'pet food', 'kitty litter',
  'nappies', 'nappy', 'diaper',
  'hair dye', 'hair colour', 'razor', 'shaving',
];

function isLikelyFood(productName) {
  const lower = productName.toLowerCase();
  return !NON_FOOD_KEYWORDS.some(kw => lower.includes(kw));
}

// ── High-level fetch function ───────────────────────────────────────

/**
 * Fetch food deals for a single catalogue. Returns [] if the catalogue has no food data.
 */
async function fetchCatalogueDeals(catalogue, { retailerId, locationId, nameSelector, store }) {
  const categories = await getCategories(catalogue.id, retailerId, locationId);
  if (categories.length === 0) return [];

  const foodCategories = categories.filter(c => isFoodCategory(c.name));
  if (foodCategories.length === 0) return [];

  const allDeals = [];
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);

  for (const cat of foodCategories) {
    try {
      const items = await getItems(catalogue.id, cat.ids, locationId, nameSelector);
      const appCategory = mapCategory(cat.name);

      for (const item of items) {
        if (item.discountPercent > 0 && isLikelyFood(item.name)) {
          allDeals.push({
            name: item.name,
            category: appCategory,
            price: parseFloat(item.salePrice.toFixed(2)),
            originalPrice: parseFloat(item.regularPrice.toFixed(2)),
            store,
            description: item.name,
            unit: item.unit,
            validUntil,
            discountPercentage: Math.round(item.discountPercent),
          });
        }
      }
    } catch (err) {
      console.warn(`[SaleFinder/${store}] Failed to fetch category "${cat.name}": ${err.message}`);
    }
  }

  // Deduplicate by name (same item can appear in multiple categories)
  const seen = new Set();
  return allDeals.filter(d => {
    if (seen.has(d.name)) return false;
    seen.add(d.name);
    return true;
  });
}

/**
 * Fetch all food specials for a retailer from SaleFinder.
 *
 * @param {Object} config
 * @param {string}  config.slug           - Retailer slug for salefinder.com.au
 * @param {number}  config.retailerId     - SaleFinder retailer ID
 * @param {number}  config.locationId     - SaleFinder location ID (0 if not needed)
 * @param {string}  config.nameSelector   - CSS selector for item name in embed HTML
 * @param {string}  config.store          - Store name for the deal object
 * @param {boolean} [config.preferLargest] - If true, try all catalogues and pick the one with most items
 * @returns {Promise<Array>} Array of deal objects in the app's expected format
 */
async function fetchSpecials({ slug, retailerId, locationId, nameSelector, store, preferLargest }) {
  const catalogues = await discoverCatalogueIds(slug);
  if (catalogues.length === 0) {
    throw new Error(`No catalogues found for ${slug}`);
  }

  console.log(`[SaleFinder/${store}] Found ${catalogues.length} catalogue(s)`);

  if (preferLargest) {
    // Try all catalogues and return the one with the most items
    let bestDeals = [];
    let bestCatalogue = null;

    for (const catalogue of catalogues) {
      const deals = await fetchCatalogueDeals(catalogue, { retailerId, locationId, nameSelector, store });
      console.log(`[SaleFinder/${store}]   ${catalogue.name} (${catalogue.id}): ${deals.length} food deals`);
      if (deals.length > bestDeals.length) {
        bestDeals = deals;
        bestCatalogue = catalogue;
      }
    }

    if (bestDeals.length > 0) {
      console.log(`[SaleFinder/${store}] Using largest: "${bestCatalogue.name}" (${bestCatalogue.id}) with ${bestDeals.length} food deals`);
      return bestDeals;
    }
  } else {
    // Default: try each catalogue until one returns data
    for (const catalogue of catalogues) {
      const deals = await fetchCatalogueDeals(catalogue, { retailerId, locationId, nameSelector, store });
      if (deals.length > 0) {
        console.log(`[SaleFinder/${store}] Using "${catalogue.name}" (${catalogue.id}): ${deals.length} food deals`);
        return deals;
      }
    }
  }

  throw new Error(`No catalogue with food items found for ${slug}`);
}

/**
 * Fetch food specials for a specific Australian state.
 * Uses state-catalogue-ids.json when available, falls back to geo-located discovery.
 *
 * @param {Object} config  - Same as fetchSpecials, plus:
 * @param {string} [config.state]  - Two-letter state code: nsw, vic, qld, wa, sa, tas, nt, act
 */
async function fetchSpecialsForState({ slug, retailerId, locationId, nameSelector, store, state, preferLargest }) {
  // Try state-specific catalogue ID first (embed API)
  if (state) {
    const stateIds = loadStateIds();
    const stateLower = state.toLowerCase();
    const catalogueId = stateIds[slug.toLowerCase()]?.[stateLower];

    if (catalogueId) {
      console.log(`[SaleFinder/${store}] Using state catalogue for ${stateLower.toUpperCase()}: ID ${catalogueId}`);
      const catalogue = { id: catalogueId, name: `${store} ${stateLower.toUpperCase()}` };
      // locationId 0, not the config's Sydney location: the embed API
      // returns EMPTY content when the location doesn't belong to the
      // catalogue's region, which blanked out every non-Sydney state.
      const deals = await fetchCatalogueDeals(catalogue, { retailerId, locationId: 0, nameSelector, store });
      if (deals.length > 0) {
        console.log(`[SaleFinder/${store}] ${deals.length} food deals for ${stateLower.toUpperCase()}`);
        return deals;
      }
      console.warn(`[SaleFinder/${store}] State catalogue ${catalogueId} returned no deals via embed API`);
    }
  }

  // Try geo-located embed API discovery
  try {
    const deals = await fetchSpecials({ slug, retailerId, locationId, nameSelector, store, preferLargest });
    if (deals.length > 0) return deals;
  } catch (err) {
    console.warn(`[SaleFinder/${store}] Embed API discovery failed: ${err.message}`);
  }

  // Final fallback: scrape the main salefinder.com.au catalogue page directly
  console.log(`[SaleFinder/${store}] Embed API returned no deals — trying main-site scrape`);
  const mainSiteDeals = await fetchFromMainSite(slug, store);
  if (mainSiteDeals.length > 0) return mainSiteDeals;

  throw new Error(`No deals found for ${store} via any method (embed API + main-site scrape)`);
}

// ── State catalogue discovery (runs before weekly deal refresh) ───────────────
//
// Classification is by catalogue TITLE from the embed API. The old approach
// probed main-site URLs per state and treated any HTTP 200 as a match;
// SaleFinder started returning 200 for every state path, so every ID
// classified as NSW (probed first) and the saved IDs went stale — at one
// point "Woolworths NSW" pointed at an IGA Victoria catalogue. The embed
// productlist response carries saleName ("Coles Catalogue QLD METRO",
// "IGA VIC Medium", "Weekly Catalogue NSW" = Woolworths), areaName, and the
// validity window, which classify retailer + state + freshness directly.

const PROBE_WINDOW_BEFORE = 180;
const PROBE_WINDOW_AFTER  = 40;
const PROBE_BATCH         = 8;
const PROBE_DELAY_MS      = 200;

const AU_STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act'];
const STATE_TOKEN = /\b(NSW|VIC|QLD|WA|SA|TAS|NT|ACT)\b/;

/**
 * Fetch a catalogue's metadata (saleName, areaName, validity window) from
 * the embed API. Returns null for invalid/empty catalogue IDs.
 */
async function getCatalogueInfo(id) {
  try {
    const res = await axios.get(`${BASE_URL}productlist/category/${id}`, {
      params: { categoryId: '1', rows_per_page: 1, saleGroup: 0 },
      timeout: 10000,
    });
    const parsed = parseJSONP(res.data);
    if (!parsed?.saleName) return null;
    return {
      id,
      saleName:  parsed.saleName,
      areaName:  parsed.areaName || '',
      startDate: (parsed.startDate || '').slice(0, 10),
      endDate:   (parsed.endDate || '').slice(0, 10),
    };
  } catch {
    return null;
  }
}

/** Classify retailer from the saleName. Returns null for non-supermarket sales. */
function _classifyRetailer(info) {
  const sale = info.saleName;
  if (/^coles\b/i.test(sale)) return 'coles';
  if (/^iga\b/i.test(sale))   return 'iga';
  // Woolworths' weekly catalogues are titled "Weekly Catalogue {STATE}".
  if (/^weekly catalogue\b/i.test(sale)) return 'woolworths';
  return null;
}

/** Classify state from saleName/areaName tokens. Returns lowercase state or null. */
function _classifyState(info) {
  const haystack = `${info.saleName} ${info.areaName}`.toUpperCase();
  const m = haystack.match(STATE_TOKEN);
  return m ? m[0].toLowerCase() : null;
}

/**
 * Score a candidate catalogue for selection within a (retailer, state).
 * Higher wins. Prefers the canonical metro/weekly edition over regional,
 * "Specialty", short-window ("3 Day") and small-format variants.
 */
function _scoreCandidate(retailer, state, info) {
  const sale = info.saleName.toLowerCase();
  const area = info.areaName.toLowerCase();
  if (/3 day/i.test(sale)) return -1; // transient mid-week sale, never use

  let score = 0;
  if (retailer === 'woolworths') {
    // Canonical: areaName is exactly the state token (not "QLD Specialty",
    // not regional "NSW-NORTH").
    if (area === state) score += 10;
    else if (area.includes('specialty')) score += 4;
    else score += 1;
  } else if (retailer === 'coles') {
    if (area === `c-${state}-met`) score += 10; // metro edition
    else score += 2;
  } else if (retailer === 'iga') {
    if (sale.includes('large')) score += 6;
    else if (sale.includes('medium')) score += 4;
    else score += 1; // local grocer / country
    const v = sale.match(/v(\d)/);
    if (v) score += parseInt(v[1], 10) * 0.1;
  }
  return score;
}

/**
 * Discover current Salefinder catalogue IDs for all Australian states.
 *
 * 1. Anchor a probe window on the geo-located discovery pages (max ID seen).
 * 2. Fetch metadata for every ID in the window via the embed API.
 * 3. Classify each valid catalogue by retailer + state from its title,
 *    keep only catalogues valid TODAY, and pick the best edition per
 *    (retailer, state).
 *
 * Saves results to backend/data/state-catalogue-ids.json.
 *
 * @returns {boolean} true if any IDs changed, false if unchanged or failed
 */
async function discoverAndSaveStateCatalogues() {
  console.log('[CatalogueDiscovery] Starting title-based catalogue discovery...');
  const existing = loadStateIds();

  // Anchor the window: max ID across all retailers' discovery pages,
  // falling back to the max previously-known ID.
  let anchor = null;
  for (const slug of ['woolworths', 'coles', 'iga']) {
    try {
      const catalogues = await discoverCatalogueIds(slug);
      for (const c of catalogues) anchor = Math.max(anchor ?? 0, c.id);
    } catch (err) {
      console.warn(`[CatalogueDiscovery] ${slug} discovery page failed: ${err.message}`);
    }
  }
  if (!anchor) {
    const knownIds = ['woolworths', 'coles', 'iga']
      .flatMap(slug => Object.values(existing[slug] || {}))
      .filter(v => typeof v === 'number');
    anchor = knownIds.length ? Math.max(...knownIds) : null;
  }
  if (!anchor) {
    console.error('[CatalogueDiscovery] No anchor ID available — keeping existing file');
    return false;
  }

  // Probe the window for catalogue metadata
  const start = anchor - PROBE_WINDOW_BEFORE;
  const end   = anchor + PROBE_WINDOW_AFTER;
  const ids   = Array.from({ length: end - start + 1 }, (_, i) => start + i);
  const infos = [];
  for (let i = 0; i < ids.length; i += PROBE_BATCH) {
    const batch = await Promise.all(ids.slice(i, i + PROBE_BATCH).map(getCatalogueInfo));
    infos.push(...batch.filter(Boolean));
    if (i + PROBE_BATCH < ids.length) await new Promise(r => setTimeout(r, PROBE_DELAY_MS));
  }
  console.log(`[CatalogueDiscovery] ${infos.length} catalogues found in window ${start}–${end} (anchor ${anchor})`);

  // Classify and select: best current catalogue per (retailer, state)
  const today = new Date().toISOString().slice(0, 10);
  const best  = { woolworths: {}, coles: {}, iga: {} }; // retailer → state → {id, score, saleName}
  for (const info of infos) {
    const retailer = _classifyRetailer(info);
    const state    = _classifyState(info);
    if (!retailer || !state) continue;
    if (info.endDate && info.endDate < today) continue;       // expired
    if (info.startDate && info.startDate > today) continue;   // not yet active
    const score = _scoreCandidate(retailer, state, info);
    if (score < 0) continue;
    const cur = best[retailer][state];
    if (!cur || score > cur.score || (score === cur.score && info.id > cur.id)) {
      best[retailer][state] = { id: info.id, score, saleName: info.saleName };
    }
  }

  const output = {
    _comment:     'Salefinder catalogue IDs by retailer and state, classified by catalogue title. These IDs change weekly; run discovery to refresh.',
    _lastUpdated: new Date().toISOString().slice(0, 10),
    _weekOf:      new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86400000).toISOString().slice(0, 10),
  };
  let anyChanged = false;

  for (const retailer of ['woolworths', 'coles', 'iga']) {
    output[retailer] = {};
    for (const state of AU_STATES) {
      output[retailer][state] = best[retailer][state]?.id ?? null;
    }
    // ACT has no dedicated catalogues — use NSW
    if (!output[retailer].act) output[retailer].act = output[retailer].nsw ?? null;

    for (const state of AU_STATES) {
      const prev = existing[retailer]?.[state];
      const next = output[retailer][state];
      if (prev !== next) {
        const label = best[retailer][state]?.saleName ?? '(none)';
        console.log(`[CatalogueDiscovery] ${retailer}/${state}: ${prev ?? 'null'} → ${next ?? 'null'} "${label}"`);
        anyChanged = true;
      }
    }
  }

  try {
    fs.writeFileSync(STATE_IDS_PATH, JSON.stringify(output, null, 2), 'utf8');
    console.log(`[CatalogueDiscovery] Saved to ${STATE_IDS_PATH} (changed: ${anyChanged})`);
  } catch (err) {
    console.error('[CatalogueDiscovery] Failed to save:', err.message);
    return false;
  }

  return anyChanged;
}

// ── Main-site scraper (fallback when embed API fails) ───────────────────────

/**
 * Scrape deals directly from the salefinder.com.au catalogue listing page.
 * This bypasses the embed API entirely and parses server-rendered HTML.
 *
 * The page shows 12 items per page with pagination via ?qs={page},,0,0,0
 *
 * @param {string} retailerSlug - e.g. 'woolworths', 'coles', 'IGA'
 * @param {string} store        - store name for deal objects (e.g. 'woolworths')
 * @returns {Promise<Array>} Array of deal objects
 */
async function fetchFromMainSite(retailerSlug, store) {
  const baseUrl = `https://www.salefinder.com.au/${retailerSlug}-catalogue`;
  console.log(`[SaleFinder/${store}] Trying main-site scrape from ${baseUrl}`);

  const allDeals = [];
  const validUntil = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
  const seen = new Set();
  let page = 1;
  const MAX_PAGES = 40;

  while (page <= MAX_PAGES) {
    const url = page === 1 ? baseUrl : `${baseUrl}?qs=${page},,0,0,0`;
    try {
      const res = await axios.get(url, {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });

      const $ = cheerio.load(res.data);
      const items = [];

      // Each product is in a div.item-landscape containing:
      //   <a class="item-image" data-itemname="..."> (name + link)
      //   <span class="item-details-container"> (price info)
      $('a.item-image').each((_, el) => {
        const $el = $(el);
        const name = ($el.attr('data-itemname') || '').trim();
        const href = $el.attr('href') || '';
        if (!name || seen.has(name)) return;
        seen.add(name);

        // Extract category from URL path: /64998/food-and-beverage/groceries/bakery/product/id/
        const pathParts = href.split('/').filter(Boolean);
        // Find the most specific category (skip generic "food-and-beverage" and "groceries")
        let rawCategory = '';
        for (const part of pathParts.slice(1)) {
          const lower = part.replace(/-/g, ' ');
          if (lower !== 'food and beverage' && lower !== 'groceries' && !part.match(/^\d+$/)) {
            rawCategory = lower;
            break;
          }
        }

        // Parent div.item-landscape contains all product info
        const $wrapper = $el.parent();
        const priceText = $wrapper.find('.price').first().text().trim();
        const priceOptionsText = $wrapper.find('.price-options').text().trim();

        // Parse sale price — must follow a $ sign to avoid matching "Any 2 for $6"
        const priceMatch = priceText.match(/\$([\d.]+)/);
        const salePrice = priceMatch ? parseFloat(priceMatch[1]) : 0;

        // Parse savings amount
        const saveMatch = priceOptionsText.match(/save\s*\$?([\d.]+)/i);
        const saveAmount = saveMatch ? parseFloat(saveMatch[1]) : 0;
        const originalPrice = salePrice + saveAmount;

        // Parse unit
        const unitMatch = priceText.match(/\d\s*(each|per\s+\w+|kg|g|ml|litre|L|pack|bundle)\b/i);
        const unit = unitMatch ? unitMatch[1].trim() : 'each';

        if (salePrice > 0) {
          items.push({ name, salePrice, originalPrice, saveAmount, rawCategory, unit });
        }
      });

      if (items.length === 0) break; // No more items — stop pagination

      for (const item of items) {
        const discountPercent = item.originalPrice > item.salePrice
          ? ((item.originalPrice - item.salePrice) / item.originalPrice) * 100
          : 0;

        // Map category from URL slug to app category
        const appCategory = mapCategory(item.rawCategory) || 'Specials';

        if (isLikelyFood(item.name) && (discountPercent > 0 || item.saveAmount > 0)) {
          allDeals.push({
            name: item.name,
            category: appCategory,
            price: parseFloat(item.salePrice.toFixed(2)),
            originalPrice: parseFloat(item.originalPrice.toFixed(2)),
            store,
            description: item.name,
            unit: item.unit,
            validUntil,
            discountPercentage: Math.round(discountPercent),
          });
        }
      }

      page++;
      // Small delay to be respectful
      if (page <= MAX_PAGES) await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      console.warn(`[SaleFinder/${store}] Main-site page ${page} failed: ${err.message}`);
      break;
    }
  }

  console.log(`[SaleFinder/${store}] Main-site scrape complete: ${allDeals.length} food deals from ${page - 1} pages`);
  return allDeals;
}

module.exports = {
  fetchSpecials,
  fetchSpecialsForState,
  fetchCatalogueDeals,
  fetchFromMainSite,
  discoverCatalogueIds,
  discoverAndSaveStateCatalogues,
  getCatalogueInfo,
  getCategories,
  getItems,
  loadStateIds,
  CATEGORY_MAP,
  EXCLUDED_CATEGORIES,
};
