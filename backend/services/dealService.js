const woolworthsService = require('./woolworths');
const colesService = require('./coles');

// In-memory storage for MVP (replace with database later)
let currentDeals = [];
let lastUpdate = null;

const getCurrentDeals = async () => {
  // If no deals or data is older than 24 hours, fetch new data
  if (!currentDeals.length || !lastUpdate || (Date.now() - lastUpdate) > 24 * 60 * 60 * 1000) {
    await updateAllDeals();
  }
  return currentDeals;
};

const updateAllDeals = async () => {
  try {
    console.log('Updating deals from all stores...');
    
    const [woolworthsDeals, colesDeals] = await Promise.allSettled([
      woolworthsService.fetchDeals(),
      colesService.fetchDeals()
    ]);

    const allDeals = [];
    
    if (woolworthsDeals.status === 'fulfilled') {
      allDeals.push(...woolworthsDeals.value);
    } else {
      console.error('Failed to fetch Woolworths deals:', woolworthsDeals.reason);
    }
    
    if (colesDeals.status === 'fulfilled') {
      allDeals.push(...colesDeals.value);
    } else {
      console.error('Failed to fetch Coles deals:', colesDeals.reason);
    }
    
    currentDeals = allDeals;
    lastUpdate = Date.now();
    
    console.log(`Updated ${allDeals.length} deals`);
    return allDeals;
  } catch (error) {
    console.error('Error updating deals:', error);
    throw error;
  }
};

const getDealsByStore = (storeName) => {
  return currentDeals.filter(deal => deal.store === storeName.toLowerCase());
};

const getDealsByCategory = (category) => {
  return currentDeals.filter(deal => 
    deal.category.toLowerCase().includes(category.toLowerCase())
  );
};

module.exports = {
  getCurrentDeals,
  updateAllDeals,
  getDealsByStore,
  getDealsByCategory
};