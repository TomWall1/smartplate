const { fetchSpecials }  = require('./salefinder');
const { enrichDeals }    = require('./woolworthsEnrich');
const imageCache         = require('./imageCache');

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

    // Enrich with product images from Woolworths product API (cache-first)
    const enrichedDeals = await enrichDeals(rawDeals);

    // Persist any new cache entries to disk
    imageCache.flush();

    return enrichedDeals;
  }
}

module.exports = new WoolworthsService();
