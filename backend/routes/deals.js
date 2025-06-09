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
    console.error('Stack trace:', error.stack);
    
    // Return fallback mock data
    const fallbackDeals = [
      {
        name: "Atlantic Salmon",
        category: "Seafood",
        price: 12.99,
        originalPrice: 18.99,
        store: "woolworths",
        description: "Fresh Atlantic Salmon Fillets",
        unit: "per kg",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        name: "Chicken Breast",
        category: "Meat",
        price: 8.99,
        originalPrice: 12.99,
        store: "woolworths",
        description: "Free Range Chicken Breast Fillets",
        unit: "per kg",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        name: "Baby Spinach",
        category: "Vegetables",
        price: 2.50,
        originalPrice: 3.99,
        store: "coles",
        description: "Fresh Baby Spinach 100g",
        unit: "per pack",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        name: "Greek Yogurt",
        category: "Dairy",
        price: 4.50,
        originalPrice: 6.99,
        store: "coles",
        description: "Natural Greek Yogurt 500g",
        unit: "per tub",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      },
      {
        name: "Avocados",
        category: "Vegetables",
        price: 1.99,
        originalPrice: 2.99,
        store: "woolworths",
        description: "Premium Avocados",
        unit: "each",
        validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000)
      }
    ];
    
    console.log('Returning fallback deals:', fallbackDeals.length);
    res.json(fallbackDeals);
  }
});

// DEBUG: Test Coles API directly with detailed logging
router.get('/debug/coles-live', async (req, res) => {
  try {
    console.log('\n=== MANUAL COLES API TEST ===');
    const colesService = require('../services/coles');
    
    // This will trigger the new detailed logging
    const deals = await colesService.fetchDeals();
    
    console.log('=== MANUAL TEST COMPLETE ===\n');
    
    res.json({
      status: 'LIVE_TEST_COMPLETE',
      message: 'Check the Vercel function logs for detailed API call information',
      dealsReturned: deals.length,
      firstDeal: deals[0] || null,
      allHaveApiSource: deals.every(deal => deal.apiSource),
      apiSources: [...new Set(deals.map(deal => deal.apiSource))],
      instruction: 'Go to Vercel dashboard > Functions tab > View function logs to see detailed API call logs'
    });
  } catch (error) {
    console.error('Live test error:', error.message);
    res.status(500).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

// DEBUG: Test Coles API directly
router.get('/debug/coles', async (req, res) => {
  try {
    const colesService = require('../services/coles');
    const hasApiKey = !!process.env.COLES_API_KEY;
    
    console.log('DEBUG: Testing Coles API');
    console.log('Has API Key:', hasApiKey);
    
    if (!hasApiKey) {
      return res.json({
        status: 'NO_API_KEY',
        message: 'Coles API key not configured',
        usingMockData: true,
        apiKey: 'Not set',
        mockDataCount: colesService.getMockDeals().length
      });
    }
    
    // Test API call
    console.log('Attempting real API call...');
    const testDeals = await colesService.fetchDeals();
    
    // Check if we got real data or mock data
    const isRealData = testDeals.some(deal => deal.apiSource === 'real-coles-api');
    
    res.json({
      status: 'API_KEY_CONFIGURED',
      message: 'Coles API key is configured',
      dealsFound: testDeals.length,
      isRealData: isRealData,
      usingMockData: !isRealData,
      sampleDeal: testDeals[0] || null,
      apiKeyPrefix: process.env.COLES_API_KEY ? process.env.COLES_API_KEY.substring(0, 8) + '...' : 'Not set',
      apiSources: [...new Set(testDeals.map(deal => deal.apiSource || 'unknown'))]
    });
  } catch (error) {
    console.error('Coles API debug error:', error.message);
    res.json({
      status: 'ERROR',
      message: error.message,
      usingMockData: true,
      error: error.toString()
    });
  }
});

// DEBUG: Get detailed service info
router.get('/debug/status', async (req, res) => {
  try {
    const hasColesKey = !!process.env.COLES_API_KEY;
    const hasSpoonacularKey = !!process.env.SPOONACULAR_API_KEY;
    
    // Get current deals to see what type they are
    const currentDeals = await dealService.getCurrentDeals();
    const colesDeals = currentDeals.filter(deal => deal.store === 'coles');
    
    // Check if deals look like real API data
    const hasRealProductUrls = colesDeals.some(deal => 
      deal.productUrl && 
      !deal.productUrl.includes('search?q=') && 
      deal.productUrl !== '#'
    );
    
    const hasRealApiSource = colesDeals.some(deal => deal.apiSource === 'real-coles-api');
    
    res.json({
      timestamp: new Date().toISOString(),
      environment: process.env.NODE_ENV || 'development',
      apiKeys: {
        coles: hasColesKey ? 'configured' : 'missing',
        spoonacular: hasSpoonacularKey ? 'configured' : 'missing'
      },
      dealsSummary: {
        total: currentDeals.length,
        coles: colesDeals.length,
        woolworths: currentDeals.filter(deal => deal.store === 'woolworths').length
      },
      dataSource: {
        hasRealProductUrls: hasRealProductUrls,
        hasRealApiSource: hasRealApiSource,
        likelySource: hasRealApiSource ? 'Real API' : 'Mock Data',
        sampleColesUrl: colesDeals[0]?.productUrl || 'No Coles deals found',
        apiSources: [...new Set(currentDeals.map(deal => deal.apiSource || 'legacy-mock'))]
      },
      debugEndpoints: {
        liveTest: '/api/deals/debug/coles-live (triggers real API call with logging)',
        status: '/api/deals/debug/status (this endpoint)',
        colesTest: '/api/deals/debug/coles (basic API test)'
      },
      nextSteps: hasColesKey ? 
        'API key configured - use /debug/coles-live to test with full logging' : 
        'Add COLES_API_KEY environment variable to use real data'
    });
  } catch (error) {
    res.status(500).json({
      status: 'ERROR',
      message: error.message
    });
  }
});

// Manually trigger deal update (admin endpoint)
router.post('/refresh', async (req, res) => {
  try {
    console.log('Manual deal refresh requested...');
    await dealService.updateAllDeals();
    console.log('Deal refresh completed successfully');
    res.json({ 
      message: 'Deals updated successfully',
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('Error updating deals:', error.message);
    res.status(500).json({ 
      error: 'Failed to update deals',
      message: error.message,
      timestamp: new Date().toISOString()
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
      message: error.message
    });
  }
});

// Health check for deals service
router.get('/health', async (req, res) => {
  try {
    const hasColesKey = !!process.env.COLES_API_KEY;
    const hasWoolworthsKey = !!process.env.WOOLWORTHS_API_KEY;
    
    res.json({
      status: 'OK',
      service: 'deals',
      timestamp: new Date().toISOString(),
      apiKeys: {
        coles: hasColesKey ? 'configured' : 'missing',
        woolworths: hasWoolworthsKey ? 'configured (not implemented)' : 'missing'
      },
      features: {
        mockData: 'available',
        colesAPI: hasColesKey ? 'available' : 'disabled',
        woolworthsAPI: 'not yet available'
      },
      serviceHealth: {
        dealService: typeof dealService === 'object' ? 'loaded' : 'error',
        methods: {
          getCurrentDeals: typeof dealService.getCurrentDeals === 'function',
          updateAllDeals: typeof dealService.updateAllDeals === 'function'
        }
      }
    });
  } catch (error) {
    console.error('Deals health check error:', error.message);
    res.status(500).json({ 
      error: error.message,
      service: 'deals',
      status: 'ERROR'
    });
  }
});

module.exports = router;