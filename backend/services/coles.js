const { fetchSpecials } = require('./salefinder');
const { enrichDeals }   = require('./colesEnrich');
const imageCache        = require('./imageCache');

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

    // Enrich with product images from Coles _next/data API (cache-first)
    const enrichedDeals = await enrichDeals(rawDeals);

    // Persist any new cache entries to disk
    imageCache.flush();

    return enrichedDeals;
  }
}

module.exports = new ColesService();
