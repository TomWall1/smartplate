const express     = require('express');
const router      = express.Router();
const dealService = require('../services/dealService');
const imageCache  = require('../services/imageCache');

// GET /api/deals/current — serve from cache (instant)
router.get('/current', async (req, res) => {
  try {
    // If startup fetch is still running and no stale cache exists, return 503
    if (!dealService.isReady()) {
      return res.status(503).json({
        status: 'loading',
        message: "We're getting this week's deals ready — check back in 30 seconds.",
      });
    }
    const deals = await dealService.getCurrentDeals();
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
router.get('/store/:storeName', async (req, res) => {
  try {
    const { storeName } = req.params;
    const deals = await dealService.getDealsByStore(storeName);
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
router.get('/status', (req, res) => {
  const loading = dealService.isLoading();
  const info    = dealService.getCacheInfo();
  res.json({
    loading,
    lastUpdated: info?.lastUpdated ?? null,
    counts: info?.counts ?? { woolworths: 0, coles: 0, iga: 0, total: 0 },
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

module.exports = router;
