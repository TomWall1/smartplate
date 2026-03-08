const { fetchSpecials } = require('./salefinder');

class ColesService {
  constructor() {
    this.config = {
      slug:         'coles',
      retailerId:   148,
      locationId:   8245,   // Sydney
      nameSelector: '.sf-item-heading',
      store:        'coles',
    };
  }

  async fetchDeals() {
    console.log('Fetching Coles deals from SaleFinder...');
    const rawDeals = await fetchSpecials(this.config);
    console.log(`Coles: ${rawDeals.length} live food deals fetched`);
    return rawDeals;
  }
}

module.exports = new ColesService();
