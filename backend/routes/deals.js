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