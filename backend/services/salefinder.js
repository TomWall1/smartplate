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
  } catch {}

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
  } catch {}

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
  // Try state-specific catalogue ID first
  if (state) {
    const stateIds = loadStateIds();
    const stateLower = state.toLowerCase();
    const catalogueId = stateIds[slug.toLowerCase()]?.[stateLower];

    if (catalogueId) {
      console.log(`[SaleFinder/${store}] Using state catalogue for ${stateLower.toUpperCase()}: ID ${catalogueId}`);
      const catalogue = { id: catalogueId, name: `${store} ${stateLower.toUpperCase()}` };
      const deals = await fetchCatalogueDeals(catalogue, { retailerId, locationId, nameSelector, store });
      if (deals.length > 0) {
        console.log(`[SaleFinder/${store}] ${deals.length} food deals for ${stateLower.toUpperCase()}`);
        return deals;
      }
      console.warn(`[SaleFinder/${store}] State catalogue ${catalogueId} returned no deals, falling back to discovery`);
    }
  }

  // Fall back to geo-located discovery
  return fetchSpecials({ slug, retailerId, locationId, nameSelector, store, preferLargest });
}

// ── State catalogue discovery (runs before weekly deal refresh) ───────────────

const PROBE_BEFORE    = 120;
const PROBE_AFTER     = 30;
const PROBE_BATCH     = 6;
const PROBE_DELAY_MS  = 250;

// State slug candidates tried in order when probing a catalogue ID
const STATE_SLUGS = {
  woolworths: ['weekly-catalogue', 'weekly-specials-catalogue'],
  coles:      ['catalogue',        'weekly-catalogue'],
  iga:        ['catalogue',        'weekly-specials'],
};

const RETAILER_PROBES = [
  { slug: 'woolworths', slugVariants: STATE_SLUGS.woolworths },
  { slug: 'coles',      slugVariants: STATE_SLUGS.coles      },
  { slug: 'iga',        slugVariants: STATE_SLUGS.iga        },
];

const AU_STATES = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act'];

async function _probeId(id) {
  try {
    const res = await axios.get(`https://embed.salefinder.com.au/productlist/category/${id}`, {
      params: { categoryId: '1', rows_per_page: 1, saleGroup: 0 },
      timeout: 10000,
    });
    if (typeof res.data !== 'string' || res.data.length < 10) return false;
    try {
      const parsed = JSON.parse(res.data.substring(1, res.data.length - 1).replace(/[\r\n\t]/g, ''));
      return !!(parsed?.content && parsed.content.length > 20);
    } catch {
      return false;
    }
  } catch {
    return false;
  }
}

async function _findStateForId(retailerSlug, catalogueId, slugVariants) {
  for (const state of AU_STATES) {
    for (const variant of slugVariants) {
      const url = `https://www.salefinder.com.au/${retailerSlug}-catalogue/${variant}-${state}/${catalogueId}/catalogue2`;
      try {
        const res = await axios.get(url, {
          timeout: 8000,
          maxRedirects: 3,
          headers: { 'User-Agent': 'Mozilla/5.0 (compatible; SmartPlate/1.0)' },
          validateStatus: s => s < 500,
        });
        if (res.status === 200 && typeof res.data === 'string' && res.data.length > 100) {
          return state;
        }
      } catch {
        // try next variant
      }
    }
  }
  return null;
}

/**
 * Discover current Salefinder catalogue IDs for all Australian states.
 * Probes a window of IDs around the geo-located NSW baseline to find
 * state-specific catalogues for Woolworths, Coles, and IGA.
 *
 * Saves results to backend/data/state-catalogue-ids.json.
 * Called automatically by the weekly cron job before deal refresh.
 *
 * @returns {boolean} true if any IDs changed, false if unchanged or failed
 */
async function discoverAndSaveStateCatalogues() {
  console.log('[CatalogueDiscovery] Starting weekly catalogue ID discovery...');
  const existing = loadStateIds();
  const output   = {
    _comment:     existing._comment || 'Salefinder catalogue IDs by retailer and state. These IDs change weekly.',
    _lastUpdated: new Date().toISOString().slice(0, 10),
    _weekOf:      new Date(Date.now() - ((new Date().getDay() + 6) % 7) * 86400000).toISOString().slice(0, 10),
  };
  let anyChanged = false;

  for (const { slug, slugVariants } of RETAILER_PROBES) {
    output[slug] = {};

    // Get baseline NSW catalogue from geo-located page
    let baseId = null;
    try {
      const catalogues = await discoverCatalogueIds(slug);
      if (catalogues.length > 0) {
        baseId = Math.max(...catalogues.map(c => c.id));
        console.log(`[CatalogueDiscovery] ${slug}: baseline NSW ID = ${baseId}`);
      }
    } catch (err) {
      console.warn(`[CatalogueDiscovery] ${slug}: discovery page failed — ${err.message}`);
    }

    if (!baseId) {
      console.warn(`[CatalogueDiscovery] ${slug}: no baseline ID found, keeping existing`);
      output[slug] = existing[slug] || {};
      continue;
    }

    // Probe IDs in window around baseline
    const probeStart = baseId - PROBE_BEFORE;
    const probeEnd   = baseId + PROBE_AFTER;
    const ids        = Array.from({ length: probeEnd - probeStart + 1 }, (_, i) => probeStart + i);
    const validIds   = [];

    for (let i = 0; i < ids.length; i += PROBE_BATCH) {
      const batch   = ids.slice(i, i + PROBE_BATCH);
      const results = await Promise.all(batch.map(id => _probeId(id).then(v => v ? id : null)));
      validIds.push(...results.filter(Boolean));
      if (i + PROBE_BATCH < ids.length) await new Promise(r => setTimeout(r, PROBE_DELAY_MS));
    }

    console.log(`[CatalogueDiscovery] ${slug}: ${validIds.length} valid IDs found in range ${probeStart}–${probeEnd}`);

    // Resolve state for each valid ID
    const stateMap = {};
    for (const id of validIds) {
      const state = await _findStateForId(slug, id, slugVariants);
      if (state) {
        // Keep the highest ID per state (most recent catalogue)
        if (!stateMap[state] || id > stateMap[state]) stateMap[state] = id;
      }
    }

    // Populate output, fall back to existing for missing states
    for (const state of AU_STATES) {
      output[slug][state] = stateMap[state] ?? existing[slug]?.[state] ?? null;
    }
    // ACT uses NSW catalogue if not found separately
    if (!output[slug].act) output[slug].act = output[slug].nsw ?? null;

    // Log changes
    for (const state of AU_STATES) {
      const prev = existing[slug]?.[state];
      const next = output[slug][state];
      if (prev !== next && next) {
        console.log(`[CatalogueDiscovery] ${slug}/${state}: ${prev ?? 'null'} → ${next}`);
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

module.exports = {
  fetchSpecials,
  fetchSpecialsForState,
  discoverCatalogueIds,
  discoverAndSaveStateCatalogues,
  getCategories,
  getItems,
  loadStateIds,
  CATEGORY_MAP,
  EXCLUDED_CATEGORIES,
};
