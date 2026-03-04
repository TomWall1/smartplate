// Import services
let woolworthsService, colesService, igaService;

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

try {
  igaService = require('./iga');
} catch (error) {
  console.warn('Failed to load IGA service:', error.message);
}

// In-memory storage for MVP (replace with database later)
let currentDeals = [];
let lastUpdate = null;

const getCurrentDeals = async () => {
  // If no deals or data is older than 24 hours, fetch new data
  if (!currentDeals.length || !lastUpdate || (Date.now() - lastUpdate) > 24 * 60 * 60 * 1000) {
    console.log('Deal data is stale, updating...');
    await updateAllDeals();
  }
  return currentDeals;
};

const updateAllDeals = async () => {
  console.log('Updating deals from all stores...');

  const dealPromises = [];

  if (woolworthsService && typeof woolworthsService.fetchDeals === 'function') {
    dealPromises.push(
      woolworthsService.fetchDeals().catch(error => {
        console.error('Woolworths deals failed:', error.message);
        return [];
      })
    );
  }

  if (colesService && typeof colesService.fetchDeals === 'function') {
    dealPromises.push(
      colesService.fetchDeals().catch(error => {
        console.error('Coles deals failed:', error.message);
        return [];
      })
    );
  }

  if (igaService && typeof igaService.fetchDeals === 'function') {
    dealPromises.push(
      igaService.fetchDeals().catch(error => {
        console.error('IGA deals failed:', error.message);
        return [];
      })
    );
  }

  if (dealPromises.length === 0) {
    throw new Error('No deal services available');
  }

  const dealResults = await Promise.allSettled(dealPromises);

  const allDeals = [];
  dealResults.forEach((result, index) => {
    if (result.status === 'fulfilled' && Array.isArray(result.value)) {
      allDeals.push(...result.value);
      console.log(`Service ${index} returned ${result.value.length} deals`);
    } else {
      console.error(`Service ${index} failed:`, result.reason?.message || 'Unknown error');
    }
  });

  if (allDeals.length === 0) {
    throw new Error('All deal services returned empty results');
  }

  currentDeals = allDeals;
  lastUpdate = Date.now();
  console.log(`Successfully updated ${allDeals.length} deals`);
  return currentDeals;
};

const getDealsByStore = (storeName) => {
  return currentDeals.filter(deal =>
    deal.store && deal.store.toLowerCase() === storeName.toLowerCase()
  );
};

const getDealsByCategory = (category) => {
  return currentDeals.filter(deal =>
    deal.category && deal.category.toLowerCase().includes(category.toLowerCase())
  );
};

module.exports = {
  getCurrentDeals,
  updateAllDeals,
  getDealsByStore,
  getDealsByCategory,
};
