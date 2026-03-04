const { fetchSpecials } = require('./salefinder');

class IGAService {
  constructor() {
    this.config = {
      slug: 'IGA',
      retailerId: 183,
      locationId: 0,
      nameSelector: '.sf-item-heading',
      store: 'iga',
      preferLargest: true,
    };
  }

  async fetchDeals() {
    console.log('Fetching IGA deals from SaleFinder...');
    const deals = await fetchSpecials(this.config);
    console.log(`IGA: ${deals.length} live food deals fetched`);
    return deals;
  }
}

module.exports = new IGAService();
