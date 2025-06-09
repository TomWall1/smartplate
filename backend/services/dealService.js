// Import services
let woolworthsService, colesService;

try {
  woolworthsService = require('./woolworths');
} catch (error) {
  console.warn('Failed to load Woolworths service:', error.message);
}

try {
  colesService = require('./coles');
} catch (error) {
  console.warn('Failed to load Coles service:', error.message);
}

// In-memory storage for MVP (replace with database later)
let currentDeals = [];
let lastUpdate = null;

const getCurrentDeals = async () => {
  try {
    // If no deals or data is older than 24 hours, fetch new data
    if (!currentDeals.length || !lastUpdate || (Date.now() - lastUpdate) > 24 * 60 * 60 * 1000) {
      console.log('Deal data is stale, updating...');
      await updateAllDeals();
    }
    return currentDeals;
  } catch (error) {
    console.error('Error in getCurrentDeals:', error.message);
    // Return mock data if there's any error
    return getMockDeals();
  }
};

const updateAllDeals = async () => {
  try {
    console.log('Updating deals from all stores...');
    
    const dealPromises = [];
    
    // Add Woolworths deals if service is available
    if (woolworthsService && typeof woolworthsService.fetchDeals === 'function') {
      dealPromises.push(
        woolworthsService.fetchDeals().catch(error => {
          console.error('Woolworths deals failed:', error.message);
          return [];
        })
      );
    }
    
    // Add Coles deals if service is available
    if (colesService && typeof colesService.fetchDeals === 'function') {
      dealPromises.push(
        colesService.fetchDeals().catch(error => {
          console.error('Coles deals failed:', error.message);
          return [];
        })
      );
    }
    
    // If no services available, use mock data
    if (dealPromises.length === 0) {
      console.log('No deal services available, using mock data');
      currentDeals = getMockDeals();
      lastUpdate = Date.now();
      return currentDeals;
    }
    
    // Wait for all deal services to complete
    const dealResults = await Promise.allSettled(dealPromises);
    
    // Collect all successful deals
    const allDeals = [];
    dealResults.forEach((result, index) => {
      if (result.status === 'fulfilled' && Array.isArray(result.value)) {
        allDeals.push(...result.value);
        console.log(`Service ${index} returned ${result.value.length} deals`);
      } else {
        console.error(`Service ${index} failed:`, result.reason?.message || 'Unknown error');
      }
    });
    
    // Use results if we got any, otherwise fall back to mock
    if (allDeals.length > 0) {
      currentDeals = allDeals;
      console.log(`Successfully updated ${allDeals.length} deals`);
    } else {
      console.log('No deals from services, using mock data');
      currentDeals = getMockDeals();
    }
    
    lastUpdate = Date.now();
    return currentDeals;
  } catch (error) {
    console.error('Error updating deals:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Fallback to mock data
    currentDeals = getMockDeals();
    lastUpdate = Date.now();
    return currentDeals;
  }
};

const getDealsByStore = (storeName) => {
  try {
    return currentDeals.filter(deal => 
      deal.store && deal.store.toLowerCase() === storeName.toLowerCase()
    );
  } catch (error) {
    console.error('Error filtering deals by store:', error.message);
    return [];
  }
};

const getDealsByCategory = (category) => {
  try {
    return currentDeals.filter(deal => 
      deal.category && deal.category.toLowerCase().includes(category.toLowerCase())
    );
  } catch (error) {
    console.error('Error filtering deals by category:', error.message);
    return [];
  }
};

const getMockDeals = () => {
  return [
    {
      name: "Atlantic Salmon",
      category: "Seafood",
      price: 12.99,
      originalPrice: 18.99,
      store: "woolworths",
      description: "Fresh Atlantic Salmon Fillets",
      unit: "per kg",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 32,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=atlantic%20salmon"
    },
    {
      name: "Free Range Chicken Breast",
      category: "Meat",
      price: 8.99,
      originalPrice: 12.99,
      store: "woolworths",
      description: "Free Range Chicken Breast Fillets",
      unit: "per kg",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 31,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=free%20range%20chicken%20breast"
    },
    {
      name: "Baby Spinach",
      category: "Vegetables",
      price: 2.50,
      originalPrice: 3.99,
      store: "coles",
      description: "Fresh Baby Spinach 100g",
      unit: "per pack",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 37,
      productUrl: "https://www.coles.com.au/search?q=baby%20spinach"
    },
    {
      name: "Greek Style Yogurt",
      category: "Dairy",
      price: 4.50,
      originalPrice: 6.99,
      store: "coles",
      description: "Natural Greek Style Yogurt 500g",
      unit: "per tub",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 36,
      productUrl: "https://www.coles.com.au/search?q=greek%20style%20yogurt"
    },
    {
      name: "Hass Avocados",
      category: "Fruit",
      price: 1.99,
      originalPrice: 2.99,
      store: "woolworths",
      description: "Premium Hass Avocados",
      unit: "each",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 33,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=hass%20avocado"
    },
    {
      name: "Beef Mince",
      category: "Meat",
      price: 7.99,
      originalPrice: 11.99,
      store: "coles",
      description: "Premium Beef Mince 500g",
      unit: "per pack",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 33,
      productUrl: "https://www.coles.com.au/search?q=beef%20mince"
    },
    {
      name: "Mixed Berries",
      category: "Fruit",
      price: 3.99,
      originalPrice: 5.99,
      store: "coles",
      description: "Frozen Mixed Berries 300g",
      unit: "per pack",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 33,
      productUrl: "https://www.coles.com.au/search?q=frozen%20mixed%20berries"
    },
    {
      name: "Brown Rice",
      category: "Pantry",
      price: 2.50,
      originalPrice: 3.99,
      store: "woolworths",
      description: "SunRice Long Grain Brown Rice 1kg",
      unit: "per pack",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 37,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=sunrice%20brown%20rice"
    },
    {
      name: "Extra Virgin Olive Oil",
      category: "Pantry",
      price: 6.99,
      originalPrice: 9.99,
      store: "woolworths",
      description: "Cobram Estate Extra Virgin Olive Oil 500ml",
      unit: "per bottle",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 30,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=cobram%20estate%20olive%20oil"
    },
    {
      name: "Organic Eggs",
      category: "Dairy",
      price: 4.50,
      originalPrice: 6.50,
      store: "woolworths",
      description: "Free Range Organic Eggs 12 pack",
      unit: "per dozen",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 31,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=organic%20eggs%2012%20pack"
    },
    {
      name: "Sweet Potato",
      category: "Vegetables",
      price: 2.90,
      originalPrice: 4.90,
      store: "woolworths",
      description: "Fresh Sweet Potato",
      unit: "per kg",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 41,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=sweet%20potato"
    },
    {
      name: "Pasta",
      category: "Pantry",
      price: 1.50,
      originalPrice: 2.50,
      store: "coles",
      description: "San Remo Durum Wheat Pasta 500g",
      unit: "per pack",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 40,
      productUrl: "https://www.coles.com.au/search?q=san%20remo%20pasta"
    },
    {
      name: "Wholemeal Bread",
      category: "Bakery",
      price: 2.20,
      originalPrice: 3.50,
      store: "woolworths",
      description: "Tip Top Wholemeal Bread 700g",
      unit: "per loaf",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 37,
      productUrl: "https://www.woolworths.com.au/shop/search/products?searchTerm=tip%20top%20wholemeal%20bread"
    },
    {
      name: "Lean Chicken Thighs",
      category: "Meat",
      price: 6.99,
      originalPrice: 9.99,
      store: "coles",
      description: "Free Range Chicken Thighs 1kg",
      unit: "per kg",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 30,
      productUrl: "https://www.coles.com.au/search?q=free%20range%20chicken%20thighs"
    },
    {
      name: "Carrots",
      category: "Vegetables",
      price: 1.50,
      originalPrice: 2.90,
      store: "coles",
      description: "Fresh Carrots 1kg",
      unit: "per kg",
      validUntil: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      discountPercentage: 48,
      productUrl: "https://www.coles.com.au/search?q=fresh%20carrots"
    }
  ];
};

// Initialize with mock data on startup
if (currentDeals.length === 0) {
  currentDeals = getMockDeals();
  lastUpdate = Date.now();
  console.log('Initialized deal service with mock data:', currentDeals.length, 'deals');
}

module.exports = {
  getCurrentDeals,
  updateAllDeals,
  getDealsByStore,
  getDealsByCategory,
  getMockDeals
};