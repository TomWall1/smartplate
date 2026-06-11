const path       = require('path');
const imageCache = require('./imageCache');
const { mapWithConcurrency } = require('../lib/concurrency');
const { JsonStore } = require('../lib/jsonStore');

// ── Product intelligence (lazy-loaded so DB is optional) ──────────────────────
let productLookup, productCategorizer, db;
try {
  productLookup     = require('./productLookup');
  productCategorizer = require('./productCategorizer');
  db                = require('../database/db');
  // Verify DB is reachable (async-safe: works with both SQLite and PostgreSQL)
  Promise.resolve(db.countProducts()).then(n => {
    console.log(`[DealService] Product DB ready (${n} products)`);
  }).catch(err => {
    console.warn('[DealService] DB count failed:', err.message);
  });
} catch (e) {
  console.warn('[DealService] Product DB unavailable — enrichment disabled:', e.message);
  productLookup = productCategorizer = db = null;
}

// Import store services
let woolworthsService, colesService, igaService;
try { woolworthsService = require('./woolworths'); } catch (e) { console.warn('Woolworths service unavailable:', e.message); }
try { colesService      = require('./coles');      } catch (e) { console.warn('Coles service unavailable:', e.message); }
try { igaService        = require('./iga');        } catch (e) { console.warn('IGA service unavailable:', e.message); }

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

// In-memory mirror of cached-deals.json with queued atomic writes.
// One synchronous read at startup; after that, reads never touch disk and
// concurrent enrichment phases can't clobber each other's cache updates.
const _dealStore = new JsonStore(CACHE_PATH);
_dealStore.loadSync();

// ── Startup fetch tracking ─────────────────────────────────────────────────────
// Lets other services wait for the initial background fetch to complete
// rather than immediately failing with "no deals".

let _startupLoading  = false;
let _startupDone     = null; // Promise that resolves when the startup fetch finishes
let _dealsReady      = false; // true once we have ANY servable deals (stale or fresh)

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
    _dealsReady = true;
  });
}

/** Mark deals as ready (e.g. stale cache loaded on startup). */
function setDealsReady() {
  _dealsReady = true;
}

/** Returns true once we have any servable deals (stale or fresh). */
function isReady() {
  return _dealsReady;
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

/**
 * Returns the cache object (or null if no cache exists yet).
 * Served from the in-memory mirror — external edits to cached-deals.json
 * while the server is running are not picked up until restart.
 */
function loadCache() {
  return _dealStore.get();
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
  // Mirror updates synchronously; the disk write is queued + atomic.
  _dealStore.set(cache);
  _persistCacheToDb();
  return cache;
}

/**
 * Persist the current cache to the database (fire-and-forget).
 * The DB copy is what survives deploys/restarts — on Render the local file
 * resets to the repo snapshot on every cold start, so without this the
 * server wakes up with months-old deals.
 */
function _persistCacheToDb() {
  const cache = _dealStore.get();
  if (!db?.saveDealsCache || !cache) return;
  Promise.resolve(db.saveDealsCache(cache)).then(() => {
    console.log(`DealService: deals cache persisted to DB (lastUpdated ${cache.lastUpdated})`);
  }).catch((err) => {
    console.warn('DealService: DB persist of deals cache failed:', err.message);
  });
}

/**
 * Load the freshest deals cache from the database into the in-memory mirror.
 * Called once at startup, BEFORE any fetch decision: if the DB copy is newer
 * than the file snapshot (always true on Render cold starts), it wins.
 * Returns true if the DB copy was loaded.
 */
async function loadDealsFromDb() {
  if (!db?.getDealsCache) return false;
  try {
    const row = await db.getDealsCache();
    if (!row?.data?.lastUpdated) return false;

    const fileCache = _dealStore.get();
    const dbTime    = new Date(row.data.lastUpdated).getTime() || 0;
    const fileTime  = fileCache?.lastUpdated ? new Date(fileCache.lastUpdated).getTime() : 0;
    if (dbTime <= fileTime) {
      console.log('DealService: local deals snapshot is current — DB copy not newer');
      return false;
    }

    _dealStore.set(row.data); // refreshes memory + local file mirror
    const total = (row.data.woolworths?.length || 0) + (row.data.coles?.length || 0) + (row.data.iga?.length || 0);
    console.log(`DealService: loaded ${total} deals from DB (lastUpdated ${row.data.lastUpdated})`);
    return true;
  } catch (err) {
    console.warn('DealService: DB load of deals cache failed:', err.message);
    return false;
  }
}

function cacheToFlatArray(cache) {
  return [
    ...cache.woolworths,
    ...cache.coles,
    ...cache.iga,
  ];
}

// ── Raw fetch from Salefinder (no image enrichment) ───────────────────────────

async function _fetchRaw(state) {
  // If no state specified, default to 'nsw' so fetchSpecialsForState uses
  // the state-catalogue-ids.json (which have verified embed IDs) instead of
  // falling back to main-site scrape (which can return non-embed IDs).
  const effectiveState = state || 'nsw';
  const stateLabel = ` (${effectiveState.toUpperCase()})`;
  console.log(`DealService: Fetching raw deals from Salefinder${stateLabel}...`);

  const tasks = [];
  if (woolworthsService?.fetchDeals) tasks.push({ store: 'woolworths', fn: woolworthsService.fetchDeals(effectiveState) });
  if (colesService?.fetchDeals)      tasks.push({ store: 'coles',      fn: colesService.fetchDeals(effectiveState)      });
  if (igaService?.fetchDeals)        tasks.push({ store: 'iga',        fn: igaService.fetchDeals(effectiveState)        });

  if (tasks.length === 0) throw new Error('No deal services available');

  const results = await Promise.allSettled(tasks.map(t => t.fn));

  const byStore = { woolworths: [], coles: [], iga: [] };

  results.forEach((result, i) => {
    const store = tasks[i].store;
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      byStore[store] = result.value;
      console.log(`DealService: ${store} → ${result.value.length} raw deals`);
    } else {
      console.error(`DealService: ${store} failed:`, result.reason?.message || 'unknown error');
    }
  });

  const total = Object.values(byStore).reduce((n, arr) => n + arr.length, 0);
  if (total === 0) throw new Error('All deal services returned empty results');

  return byStore;
}

// ── Product intelligence enrichment ───────────────────────────────────────────

let _enrichStats = { hits: 0, misses: 0, errors: 0 };

/** Attach a knowledge-base product's categorization to a deal (mutates the deal). */
function _attachIntelligence(deal, product, matchType) {
  deal.productIntelligence = {
    productId:            product.id,
    productType:          product.product_type,
    baseIngredient:       product.base_ingredient,
    category:             product.category,
    processingLevel:      product.processing_level,
    isHeroIngredient:     product.is_hero_ingredient,
    satisfiesIngredients: product.satisfies_ingredients,
    matchType,
  };
}

/**
 * Enrich a single deal with product categorization data.
 * Mutates the deal object in-place and returns it.
 *
 * Priority:
 *   1. Look up in knowledge base (cache hit)
 *   2. If not found, call Claude → save to DB (cache miss)
 *   3. If DB unavailable, skip silently
 */
async function enrichDealWithProduct(deal) {
  if (!productLookup || !productCategorizer || !db) return deal;

  try {
    const result = await productLookup.lookupAndRecord(deal.name, deal.store);

    if (result) {
      // Cache hit — attach categorization
      _enrichStats.hits++;
      _attachIntelligence(deal, result.product, result.matchType);
    } else {
      // Cache miss — categorize via Claude and save
      _enrichStats.misses++;
      const cat = await productCategorizer.claudeCategorize(deal.name, deal.category, deal.price);

      const { normalizeName } = productLookup;
      const inserted = await db.insertProduct({
        name:                  deal.name,
        normalized_name:       normalizeName(deal.name),
        product_type:          cat.productType          ?? null,
        base_ingredient:       cat.baseIngredient        ?? null,
        category:              cat.category              ?? null,
        sub_category:          cat.subCategory           ?? null,
        processing_level:      ['unprocessed','minimally_processed','processed','ultra_processed'].includes(cat.processingLevel) ? cat.processingLevel : null,
        is_hero_ingredient:    cat.isHeroIngredient      ?? false,
        typical_use_case:      cat.typicalUseCase        ?? null,
        purchase_reasonability: cat.purchaseReasonability ?? null,
        satisfies_ingredients: cat.satisfiesIngredients  ?? [],
        source:                'claude',
      });

      // Create alias for fast future lookups
      const newId = inserted.lastInsertRowid;
      if (newId) {
        await db.insertAlias(newId, deal.name, normalizeName(deal.name), 'manual');
        await db.recordMatch(deal.name, newId, 'claude', deal.store);
      }

      deal.productIntelligence = {
        productId:            newId ?? null,
        productType:          cat.productType,
        baseIngredient:       cat.baseIngredient,
        category:             cat.category,
        processingLevel:      cat.processingLevel,
        isHeroIngredient:     cat.isHeroIngredient,
        satisfiesIngredients: cat.satisfiesIngredients,
        matchType:            'claude',
      };
    }
  } catch (err) {
    _enrichStats.errors++;
    console.warn(`[DealService] Enrichment failed for "${deal.name}":`, err.message);
  }

  return deal;
}

// Bounded parallelism for the miss path: it can call Claude for categorization,
// so keep it gentle on rate limits. Cache hits are resolved in bulk beforehand.
const ENRICH_CONCURRENCY = 4;

/**
 * Enrich all deals in a flat array with product intelligence.
 * Tiers 1-2 (exact + alias) are resolved for the whole batch in two bulk
 * queries; only genuine misses go through the per-deal path (fuzzy lookup,
 * Claude categorization) with bounded concurrency.
 */
async function enrichDealsWithProducts(deals) {
  if (!productLookup) return deals;

  console.log(`[DealService] Enriching ${deals.length} deals with product intelligence...`);
  _enrichStats = { hits: 0, misses: 0, errors: 0 };

  let resolved = new Map();
  try {
    resolved = await productLookup.findProductsBatch(deals.map(d => d.name));
  } catch (err) {
    console.warn('[DealService] Bulk lookup failed — falling back to per-deal lookups:', err.message);
  }

  const unresolved = [];
  for (const deal of deals) {
    const hit = resolved.get(productLookup.normalizeName(deal.name));
    if (hit) {
      _enrichStats.hits++;
      _attachIntelligence(deal, hit.product, hit.matchType);
      productLookup.recordMatch(deal.name, hit.product.id, hit.matchType, deal.store);
    } else {
      unresolved.push(deal);
    }
  }

  let processed = 0;
  await mapWithConcurrency(unresolved, ENRICH_CONCURRENCY, async (deal) => {
    await enrichDealWithProduct(deal);
    processed++;
    if (processed % 25 === 0) {
      console.log(`[DealService] Enrichment progress: ${processed}/${unresolved.length} uncached (hits: ${_enrichStats.hits}, misses: ${_enrichStats.misses})`);
    }
  });

  const total   = _enrichStats.hits + _enrichStats.misses;
  const hitRate = total > 0 ? ((_enrichStats.hits / total) * 100).toFixed(1) : '0';
  console.log(`[DealService] Enrichment complete — ${_enrichStats.hits} hits, ${_enrichStats.misses} misses (${hitRate}% hit rate), ${_enrichStats.errors} errors`);

  return deals;
}

// ── Phase 2 & 3: background enrichment helpers ────────────────────────────────

/**
 * Write one store's deals back into the cache.
 * Mutations go through the JsonStore write queue, so concurrent writers
 * (images + PI enrichment) can't overwrite each other's data.
 */
function _updateCacheStore(storeName, enrichedDeals, label = '') {
  if (!_dealStore.get()) return;
  _dealStore.update((cache) => {
    cache[storeName] = enrichedDeals;
  });
  _persistCacheToDb(); // keep the DB copy enriched too, or cold starts lose images/PI
  console.log(`DealService: ${storeName} cache updated${label ? ` (${label})` : ''} — ${enrichedDeals.length} deals`);
}

/**
 * Phase 2: Enrich deals with product images, then hand off to Phase 3 (PI).
 * Runs entirely in the background — callers must not await this.
 */
async function _enrichInBackground(byStore) {
  const woolworthsEnrich = require('./woolworthsEnrich');
  const colesEnrich      = require('./colesEnrich');

  // Keep a mutable copy so Phase 3 sees image-enriched deals
  const imageEnriched = {
    woolworths: byStore.woolworths,
    coles:      byStore.coles,
    iga:        byStore.iga,
  };

  // Woolworths images
  if (byStore.woolworths.length > 0) {
    try {
      imageEnriched.woolworths = await woolworthsEnrich.enrichDeals(byStore.woolworths);
      _updateCacheStore('woolworths', imageEnriched.woolworths, 'images');
      imageCache.flush();
    } catch (err) {
      console.error('DealService: Woolworths image enrichment failed:', err.message);
    }
  }

  // Coles images
  if (byStore.coles.length > 0) {
    try {
      imageEnriched.coles = await colesEnrich.enrichDeals(byStore.coles);
      _updateCacheStore('coles', imageEnriched.coles, 'images');
      imageCache.flush();
    } catch (err) {
      console.error('DealService: Coles image enrichment failed:', err.message);
    }
  }

  console.log('DealService: Image enrichment complete — starting PI enrichment...');

  // Phase 3: PI enrichment runs AFTER images so both sets of data land in cache
  // without race conditions (sequential, not concurrent).
  await _enrichPIAndPersist(imageEnriched);
}

/**
 * Phase 3: Enrich deals in byStore with Product Intelligence and write each
 * store back to the cache file as it completes.
 * Safe to call standalone (e.g. from /enrich-pi endpoint).
 */
async function _enrichPIAndPersist(byStore) {
  if (!productLookup) {
    console.log('DealService: PI enrichment skipped — product DB unavailable');
    return;
  }

  console.log('DealService: PI enrichment starting...');
  const start = Date.now();

  for (const storeName of ['woolworths', 'coles', 'iga']) {
    const storeDeals = byStore[storeName];
    if (!storeDeals?.length) continue;
    try {
      const enriched = await enrichDealsWithProducts([...storeDeals]);
      _updateCacheStore(storeName, enriched, 'PI');
    } catch (err) {
      console.error(`DealService: PI enrichment failed for ${storeName}:`, err.message);
    }
  }

  const elapsed = ((Date.now() - start) / 1000).toFixed(1);
  console.log(`DealService: PI enrichment complete in ${elapsed}s`);
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
 * Fetch deals in two phases:
 *   Phase 1 — Fetch raw deals from Salefinder, save to cache immediately.
 *             Returns as soon as the basic cache is written (~30s after start).
 *   Phase 2 — Enrich with product images in the background.
 *             Updates the cache store-by-store as enrichment completes.
 *
 * Called by POST /api/deals/refresh, the weekly cron job, and server startup.
 */
const refreshDeals = async (state) => {
  // Phase 1: raw fetch + immediate cache write
  const byStore = await _fetchRaw(state);
  const cache   = saveCache(byStore);
  console.log(
    `Basic deals cached — ${cache.woolworths.length} woolworths, ` +
    `${cache.coles.length} coles, ${cache.iga.length} IGA deals ready`
  );

  // Phase 2 + 3: image enrichment → PI enrichment, both in background.
  // _enrichInBackground hands off to _enrichPIAndPersist once images are done,
  // so both sets of data persist to cache without race conditions.
  _enrichInBackground(byStore).catch(err => {
    console.error('DealService: Background enrichment error:', err.message);
  });

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

// ── Per-state deal cache (fetched on-demand from Salefinder) ───────────────────

const _stateDealCache = new Map(); // state → { deals, fetchedAt }
const STATE_DEAL_TTL  = 6 * 60 * 60 * 1000; // 6 hours

/**
 * Get food deals for a specific Australian state.
 * NSW uses the main cache; other states are fetched on-demand from Salefinder
 * using the state-catalogue-ids.json lookup and cached in memory for 6 hours.
 *
 * Falls back to the main NSW cache if the state-specific fetch fails.
 */
const getDealsByState = async (state) => {
  const s = (state || 'nsw').toLowerCase();
  if (s === 'nsw') return getCurrentDeals();

  const cached = _stateDealCache.get(s);
  if (cached && Date.now() - cached.fetchedAt < STATE_DEAL_TTL) {
    console.log(`DealService: Serving ${s.toUpperCase()} deals from memory cache (${cached.deals.length} deals)`);
    return cached.deals;
  }

  console.log(`DealService: Fetching state-specific deals for ${s.toUpperCase()}...`);
  try {
    const byStore = await _fetchRaw(s);
    const deals   = cacheToFlatArray(byStore);
    _stateDealCache.set(s, { deals, fetchedAt: Date.now() });
    console.log(`DealService: ${s.toUpperCase()} deal cache built — ${deals.length} deals`);
    return deals;
  } catch (err) {
    console.warn(`DealService: ${s.toUpperCase()} fetch failed (${err.message}), falling back to NSW cache`);
    return getCurrentDeals();
  }
};

/** Invalidate all per-state caches (call after weekly deal refresh). */
const clearStateDealCaches = () => {
  _stateDealCache.clear();
  console.log('DealService: Per-state deal caches cleared');
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
  getDealsByState,
  clearStateDealCaches,
  getCacheInfo,
  loadCache,
  loadDealsFromDb,
  setStartupFetch,
  setDealsReady,
  isReady,
  isLoading,
  waitForDeals,
  enrichDealWithProduct,
  enrichDealsWithProducts,
  enrichPIAndPersist: _enrichPIAndPersist,
};
