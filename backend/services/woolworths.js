const { fetchSpecials } = require('./salefinder');

class WoolworthsService {
  constructor() {
    this.config = {
      slug:         'woolworths',
      retailerId:   126,
      locationId:   4778,   // Sydney
      nameSelector: '.shelfProductTile-descriptionLink',
      store:        'woolworths',
    };
  }

  async fetchDeals() {
    console.log('Fetching Woolworths deals from SaleFinder...');
    const rawDeals = await fetchSpecials(this.config);
    console.log(`Woolworths: ${rawDeals.length} live food deals fetched`);
    return rawDeals;
  }
}

module.exports = new WoolworthsService();
