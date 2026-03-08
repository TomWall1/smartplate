const fs         = require('fs');
const path       = require('path');
const imageCache = require('./imageCache');

// Import store services
let woolworthsService, colesService, igaService;
try { woolworthsService = require('./woolworths'); } catch (e) { console.warn('Woolworths service unavailable:', e.message); }
try { colesService      = require('./coles');      } catch (e) { console.warn('Coles service unavailable:', e.message); }
try { igaService        = require('./iga');        } catch (e) { console.warn('IGA service unavailable:', e.message); }

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

// ── Startup fetch tracking ─────────────────────────────────────────────────────
// Lets other services wait for the initial background fetch to complete
// rather than immediately failing with "no deals".

let _startupLoading  = false;
let _startupDone     = null; // Promise that resolves when the startup fetch finishes

/**
 * Register the promise returned by the startup refreshDeals() call.
 * Must be called before awaiting that promise so _startupLoading is true
 * for any concurrent request that arrives while the fetch runs.
 */
function setStartupFetch(fetchPromise) {
  _startupLoading = true;
  _startupDone = new Promise((resolve) => {
    fetchPromise.then(resolve, resolve); // resolve on both fulfil and reject
  }).then(() => {
    _startupLoading = false;
  });
}

/** Returns true while the startup fetch is in progress. */
function isLoading() {
  return _startupLoading;
}

/**
 * Wait up to timeoutMs for the startup fetch to complete.
 * Resolves immediately if no startup fetch is running.
 */
async function waitForDeals(timeoutMs = 180000) {
  if (!_startupLoading || !_startupDone) return;
  console.log(`DealService: waiting up to ${timeoutMs / 1000}s for startup fetch...`);
  const timeout = new Promise((_, reject) =>
    setTimeout(() => reject(new Error('Startup deals fetch timed out')), timeoutMs)
  );
  await Promise.race([_startupDone, timeout]);
}

// ── Cache helpers ──────────────────────────────────────────────────────────────

function loadCache() {
  try {
    const raw = fs.readFileSync(CACHE_PATH, 'utf8');
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

function saveCache(byStore) {
  const cache = {
    lastUpdated:       new Date().toISOString(),
    woolworths:        byStore.woolworths || [],
    coles:             byStore.coles      || [],
    iga:               byStore.iga        || [],
    imageEnrichStats:  {
      ...imageCache.getLastRunStats(),
      totalCacheEntries: imageCache.size(),
    },
  };
  fs.mkdirSync(path.dirname(CACHE_PATH), { recursive: true });
  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache, null, 2), 'utf8');
  return cache;
}

function cacheToFlatArray(cache) {
  return [
    ...cache.woolworths,
    ...cache.coles,
    ...cache.iga,
  ];
}

// ── Live fetch from Salefinder ─────────────────────────────────────────────────

async function _fetchLive() {
  console.log('DealService: Fetching live deals from Salefinder...');

  const tasks = [];
  if (woolworthsService?.fetchDeals) tasks.push({ store: 'woolworths', fn: woolworthsService.fetchDeals() });
  if (colesService?.fetchDeals)      tasks.push({ store: 'coles',      fn: colesService.fetchDeals()      });
  if (igaService?.fetchDeals)        tasks.push({ store: 'iga',        fn: igaService.fetchDeals()        });

  if (tasks.length === 0) throw new Error('No deal services available');

  const results = await Promise.allSettled(tasks.map(t => t.fn));

  const byStore = { woolworths: [], coles: [], iga: [] };

  results.forEach((result, i) => {
    const store = tasks[i].store;
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      byStore[store] = result.value;
      console.log(`DealService: ${store} → ${result.value.length} deals`);
    } else {
      console.error(`DealService: ${store} failed:`, result.reason?.message || 'unknown error');
    }
  });

  const total = Object.values(byStore).reduce((n, arr) => n + arr.length, 0);
  if (total === 0) throw new Error('All deal services returned empty results');

  return byStore;
}

// ── Public API ─────────────────────────────────────────────────────────────────

/**
 * Return all deals as a flat array, reading from cache.
 * Returns [] if no cache file exists — call POST /api/deals/refresh to populate it.
 * Never triggers a live SaleFinder fetch (that belongs in refreshDeals only).
 */
const getCurrentDeals = async () => {
  const cache = loadCache();
  if (cache) {
    const deals = cacheToFlatArray(cache);
    console.log(`DealService: Serving ${deals.length} deals from cache (last updated ${cache.lastUpdated})`);
    return deals;
  }

  console.warn('DealService: No cache file found. Returning empty deals. Call POST /api/deals/refresh to populate.');
  return [];
};

/**
 * Force a live Salefinder fetch, persist to cache, return flat array.
 * Called by POST /api/deals/refresh and the weekly cron job.
 */
const refreshDeals = async () => {
  const byStore = await _fetchLive();
  const cache   = saveCache(byStore);
  console.log(`DealService: Cache refreshed — woolworths:${cache.woolworths.length} coles:${cache.coles.length} iga:${cache.iga.length}`);
  return { cache, deals: cacheToFlatArray(byStore) };
};

/**
 * Return the raw cache object (for health checks etc.)
 */
const getCacheInfo = () => {
  const cache = loadCache();
  if (!cache) return null;
  return {
    lastUpdated: cache.lastUpdated,
    counts: {
      woolworths: cache.woolworths.length,
      coles:      cache.coles.length,
      iga:        cache.iga.length,
      total:      cache.woolworths.length + cache.coles.length + cache.iga.length,
    },
    imageEnrichStats: cache.imageEnrichStats ?? null,
  };
};

const getDealsByStore = async (storeName) => {
  const deals = await getCurrentDeals();
  return deals.filter(d => d.store && d.store.toLowerCase() === storeName.toLowerCase());
};

const getDealsByCategory = async (category) => {
  const deals = await getCurrentDeals();
  return deals.filter(d => d.category && d.category.toLowerCase().includes(category.toLowerCase()));
};

// Keep old name as alias so anything that still calls updateAllDeals() still works
const updateAllDeals = async () => {
  const { deals } = await refreshDeals();
  return deals;
};

module.exports = {
  getCurrentDeals,
  refreshDeals,
  updateAllDeals,
  getDealsByStore,
  getDealsByCategory,
  getCacheInfo,
  setStartupFetch,
  isLoading,
  waitForDeals,
};
