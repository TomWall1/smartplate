const fs         = require('fs');
const path       = require('path');
const imageCache = require('./imageCache');

// Import store services
let woolworthsService, colesService, igaService;
try { woolworthsService = require('./woolworths'); } catch (e) { console.warn('Woolworths service unavailable:', e.message); }
try { colesService      = require('./coles');      } catch (e) { console.warn('Coles service unavailable:', e.message); }
try { igaService        = require('./iga');        } catch (e) { console.warn('IGA service unavailable:', e.message); }

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

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
 * Falls back to a live fetch + cache-save if the file doesn't exist.
 */
const getCurrentDeals = async () => {
  const cache = loadCache();
  if (cache) {
    const deals = cacheToFlatArray(cache);
    console.log(`DealService: Serving ${deals.length} deals from cache (last updated ${cache.lastUpdated})`);
    return deals;
  }

  // No cache — do a live fetch and save it for next time
  console.log('DealService: No cache found, performing initial live fetch...');
  const byStore = await _fetchLive();
  saveCache(byStore);
  return cacheToFlatArray(byStore);
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
};
