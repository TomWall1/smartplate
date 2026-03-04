const { fetchSpecials } = require('./salefinder');

class ColesService {
  constructor() {
    this.config = {
      slug: 'coles',
      retailerId: 148,
      locationId: 8245,   // Sydney
      nameSelector: '.sf-item-heading',
      store: 'coles',
    };
  }

  async fetchDeals() {
    console.log('Fetching Coles deals from SaleFinder...');
    const deals = await fetchSpecials(this.config);
    console.log(`Coles: ${deals.length} live food deals fetched`);
    return deals;
  }
}

module.exports = new ColesService();
