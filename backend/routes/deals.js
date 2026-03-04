const express = require('express');
const router = express.Router();
const dealService = require('../services/dealService');

// Get current deals
router.get('/current', async (req, res) => {
  try {
    console.log('Fetching current deals...');
    const deals = await dealService.getCurrentDeals();
    console.log(`Successfully fetched ${deals.length} deals`);
    res.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error.message);
    res.status(503).json({
      error: 'Failed to fetch deals',
      message: error.message,
    });
  }
});

// Manually trigger deal update
router.post('/refresh', async (req, res) => {
  try {
    console.log('Manual deal refresh requested...');
    await dealService.updateAllDeals();
    console.log('Deal refresh completed successfully');
    res.json({
      message: 'Deals updated successfully',
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('Error updating deals:', error.message);
    res.status(500).json({
      error: 'Failed to update deals',
      message: error.message,
    });
  }
});

// Get deals by store
router.get('/store/:storeName', async (req, res) => {
  try {
    const { storeName } = req.params;
    console.log(`Fetching deals for store: ${storeName}`);
    const deals = await dealService.getCurrentDeals();
    const storeDeals = deals.filter(deal =>
      deal.store && deal.store.toLowerCase() === storeName.toLowerCase()
    );
    console.log(`Found ${storeDeals.length} deals for ${storeName}`);
    res.json(storeDeals);
  } catch (error) {
    console.error('Error fetching store deals:', error.message);
    res.status(500).json({
      error: 'Failed to fetch store deals',
      message: error.message,
    });
  }
});

// Health check
router.get('/health', async (req, res) => {
  res.json({
    status: 'OK',
    service: 'deals',
    timestamp: new Date().toISOString(),
    dataSource: 'SaleFinder API',
  });
});

module.exports = router;
