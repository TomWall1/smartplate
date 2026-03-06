const express    = require('express');
const router     = express.Router();
const dealService = require('../services/dealService');

// GET /api/deals/current — serve from cache (instant)
router.get('/current', async (req, res) => {
  try {
    const deals = await dealService.getCurrentDeals();
    res.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error.message);
    res.status(503).json({ error: 'Failed to fetch deals', message: error.message });
  }
});

// POST /api/deals/refresh — force live Salefinder fetch + update cache
router.post('/refresh', async (req, res) => {
  try {
    console.log('Manual deal refresh requested...');
    const { cache, deals } = await dealService.refreshDeals();
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

// GET /api/deals/health — cache status
router.get('/health', (req, res) => {
  const info = dealService.getCacheInfo();
  if (!info) {
    return res.json({
      status: 'no_cache',
      message: 'Cache not yet populated — POST /api/deals/refresh to build it',
      dataSource: 'SaleFinder API',
    });
  }
  res.json({
    status: 'ok',
    dataSource: 'cached',
    lastUpdated: info.lastUpdated,
    counts: info.counts,
  });
});

module.exports = router;
