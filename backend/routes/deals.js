const express     = require('express');
const router      = express.Router();
const dealService = require('../services/dealService');
const imageCache  = require('../services/imageCache');
const requireCronSecret = require('../middleware/requireCronSecret');

// GET /api/deals/current — serve from cache (instant)
// Optional ?state=vic serves that state's deal artifact (nsw|vic|qld|wa|sa|tas|nt|act)
router.get('/current', async (req, res) => {
  try {
    // If startup fetch is still running and no stale cache exists, return 503
    if (!dealService.isReady()) {
      return res.status(503).json({
        status: 'loading',
        message: "We're getting this week's deals ready — check back in 30 seconds.",
      });
    }
    const state = (req.query.state || '').toLowerCase();
    const deals = state
      ? await dealService.getDealsByState(state)
      : await dealService.getCurrentDeals();
    res.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error.message);
    res.status(503).json({ error: 'Failed to fetch deals', message: error.message });
  }
});

// POST /api/deals/refresh — force live Salefinder fetch + update cache
// Optional query param: ?state=vic  (nsw|vic|qld|wa|sa|tas|nt|act)
router.post('/refresh', async (req, res) => {
  try {
    const state = (req.query.state || '').toLowerCase() || undefined;
    console.log(`Manual deal refresh requested${state ? ` (state=${state})` : ''}...`);
    const { cache, deals } = await dealService.refreshDeals(state);
    res.json({
      message: 'Deals cache refreshed successfully',
      lastUpdated: cache.lastUpdated,
      counts: {
        woolworths: cache.woolworths.length,
        coles:      cache.coles.length,
        iga:        cache.iga.length,
        total:      deals.length,
      },
    });
  } catch (error) {
    console.error('Error refreshing deals:', error.message);
    res.status(500).json({ error: 'Failed to refresh deals', message: error.message });
  }
});

// GET /api/deals/store/:storeName — deals for a single store from cache
// Optional ?state=vic serves that state's catalogue. Without it this falls back
// to the main (NSW) cache, which is only correct for NSW and ACT — a client
// that omits the state shows a Victorian NSW prices, and the state-aware
// recipes then reference specials that are absent from this list.
router.get('/store/:storeName', async (req, res) => {
  try {
    const { storeName } = req.params;
    const state = (req.query.state || '').toLowerCase();
    const deals = state
      ? (await dealService.getDealsByState(state)).filter(
          (d) => (d.store || '').toLowerCase() === storeName.toLowerCase()
        )
      : await dealService.getDealsByStore(storeName);
    res.json(deals);
  } catch (error) {
    console.error('Error fetching store deals:', error.message);
    res.status(500).json({ error: 'Failed to fetch store deals', message: error.message });
  }
});

// GET /api/deals/health — cache status + image enrichment stats
router.get('/health', (req, res) => {
  const info = dealService.getCacheInfo();
  if (!info) {
    return res.json({
      status: 'no_cache',
      message: 'Cache not yet populated — POST /api/deals/refresh to build it',
      dataSource: 'SaleFinder API',
    });
  }

  const stats = info.imageEnrichStats;
  res.json({
    status:      'ok',
    dataSource:  'cached',
    lastUpdated: info.lastUpdated,
    counts:      info.counts,
    imageCache: stats ? {
      totalEntries:  stats.totalCacheEntries ?? imageCache.size(),
      lastRunHits:   stats.hits    ?? 0,
      lastRunMisses: stats.misses  ?? 0,
      lastRunErrors: stats.errors  ?? 0,
      hitRate:       `${stats.hitRate ?? 0}%`,
      withImages:    stats.withImage ?? 0,
      elapsedSeconds: stats.elapsedSeconds ?? null,
    } : {
      totalEntries: imageCache.size(),
      note: 'No enrichment run recorded yet',
    },
  });
});

// GET /api/deals/status — loading state + cache summary (for frontend loading screens)
router.get('/status', async (req, res) => {
  const loading = dealService.isLoading();
  const info    = dealService.getCacheInfo();

  // Per-state artifact ages. `lastUpdated` describes the main (NSW) cache
  // only, so a state whose artifact stopped rebuilding looked perfectly
  // healthy here — VIC and QLD served June catalogues into late August.
  let states = [];
  try {
    const db = require('../database/db');
    const rows = (await db?.getStateDealsFreshness?.()) ?? [];
    states = rows.map(({ state, fetchedAt }) => ({
      state,
      fetchedAt,
      ageDays: Math.floor((Date.now() - new Date(fetchedAt).getTime()) / 86400000),
    }));
  } catch {
    states = []; // diagnostics must never break the endpoint
  }

  res.json({
    loading,
    lastUpdated: info?.lastUpdated ?? null,
    counts: info?.counts ?? { woolworths: 0, coles: 0, iga: 0, total: 0 },
    states,
    staleStates: states.filter((s) => s.ageDays > 10).map((s) => s.state),
  });
});

// GET /api/deals/cache-status — PI + image coverage breakdown
router.get('/cache-status', async (req, res) => {
  try {
    const info = dealService.getCacheInfo();
    if (!info) {
      return res.json({ status: 'empty', message: 'No cache file exists' });
    }

    const cache = dealService.loadCache();
    const stores = ['woolworths', 'coles', 'iga'];
    const storeStats = {};

    for (const s of stores) {
      const deals = cache[s] || [];
      const withPI  = deals.filter(d => d.productIntelligence).length;
      const withImg = deals.filter(d => d.productImage?.startsWith('http')).length;
      storeStats[s] = {
        total:   deals.length,
        pi:      withPI,
        images:  withImg,
        piPct:   deals.length ? `${((withPI  / deals.length) * 100).toFixed(1)}%` : '0%',
        imgPct:  deals.length ? `${((withImg / deals.length) * 100).toFixed(1)}%` : '0%',
      };
    }

    const allDeals  = [...(cache.woolworths || []), ...(cache.coles || []), ...(cache.iga || [])];
    const totalPI   = allDeals.filter(d => d.productIntelligence).length;
    const totalImg  = allDeals.filter(d => d.productImage?.startsWith('http')).length;

    res.json({
      status:      'ok',
      lastUpdated: info.lastUpdated,
      counts:      info.counts,
      productIntelligence: {
        enriched: totalPI,
        total:    allDeals.length,
        coverage: allDeals.length ? `${((totalPI / allDeals.length) * 100).toFixed(1)}%` : '0%',
      },
      images: {
        enriched: totalImg,
        total:    allDeals.length,
        coverage: allDeals.length ? `${((totalImg / allDeals.length) * 100).toFixed(1)}%` : '0%',
      },
      byStore: storeStats,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deals/enrich-pi — trigger PI enrichment on current cache without re-fetching deals
router.post('/enrich-pi', async (req, res) => {
  try {
    const cache = dealService.loadCache();
    if (!cache) {
      return res.status(404).json({ error: 'No cache to enrich — POST /api/deals/refresh first' });
    }

    const total = (cache.woolworths?.length || 0) + (cache.coles?.length || 0) + (cache.iga?.length || 0);
    console.log(`Manual PI enrichment triggered — ${total} deals`);

    // Fire enrichment in background so endpoint returns immediately
    dealService.enrichPIAndPersist({
      woolworths: cache.woolworths || [],
      coles:      cache.coles      || [],
      iga:        cache.iga        || [],
    }).catch(err => console.error('Manual PI enrichment error:', err.message));

    res.json({
      success:   true,
      message:   `PI enrichment started for ${total} deals — check /cache-status in ~2 minutes`,
      dealCount: total,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// POST /api/deals/clear-image-cache — wipe the image cache so it rebuilds from scratch
router.post('/clear-image-cache', (req, res) => {
  imageCache.clear();
  res.json({
    message: 'Product image cache cleared. Next deal refresh will rebuild it from the Woolworths API.',
  });
});


// POST /api/deals/ingest ------------------------------------------------
// Receives one state's deals from the headless catalogue fetcher, which runs
// in GitHub Actions because Playwright cannot live on this instance.
//
// Guarded by the cron secret: this writes the artifact every user in that
// state reads, so it is exactly as sensitive as the pipeline triggers.
router.post('/ingest', requireCronSecret, async (req, res) => {
  const state = String(req.body?.state || '').toLowerCase();
  const deals = req.body?.deals;

  const VALID = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'act', 'nt'];
  if (!VALID.includes(state)) return res.status(400).json({ error: `unknown state: ${state}` });
  if (!Array.isArray(deals) || deals.length === 0) {
    return res.status(400).json({ error: 'deals must be a non-empty array' });
  }

  // A refresh that loses most of the previous deals is far more likely to be
  // a broken fetch than a genuinely empty week. Today's incident replaced 145
  // Woolworths deals with 4 and saved it without hesitation. Refuse, unless
  // explicitly forced.
  const force = req.query.force === 'true';
  try {
    const db = require('../database/db');
    const existing = await db?.getStateDeals?.(state);
    const previous = existing?.data?.deals?.length ?? 0;
    if (!force && previous > 0 && deals.length < previous * 0.5) {
      console.warn(`[deals/ingest] ${state}: refusing ${deals.length} deals, previous was ${previous}`);
      return res.status(409).json({
        error: 'implausible drop in deal count',
        received: deals.length,
        previous,
        hint: 're-send with ?force=true if this is genuine',
      });
    }

    await db.saveStateDeals(state, {
      state,
      deals,
      fetchedAt: new Date().toISOString(),
      source: 'catalogue-fetcher',
    });
    dealService.clearStateDealCaches();
    console.log(`[deals/ingest] ${state}: stored ${deals.length} deals (previous ${previous})`);
    res.json({ ok: true, state, stored: deals.length, previous });
  } catch (err) {
    console.error(`[deals/ingest] ${state} failed:`, err.message);
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
