const { fetchSpecials } = require('./salefinder');

class WoolworthsService {
  constructor() {
    this.config = {
      slug: 'woolworths',
      retailerId: 126,
      locationId: 4778,   // Sydney
      nameSelector: '.shelfProductTile-descriptionLink',
      store: 'woolworths',
    };
  }

  async fetchDeals() {
    console.log('Fetching Woolworths deals from SaleFinder...');
    const deals = await fetchSpecials(this.config);
    console.log(`Woolworths: ${deals.length} live food deals fetched`);
    return deals;
  }
}

module.exports = new WoolworthsService();
