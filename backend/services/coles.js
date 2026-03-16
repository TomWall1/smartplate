const { fetchSpecialsForState } = require('./salefinder');

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

  async fetchDeals(state) {
    console.log(`Fetching Coles deals from SaleFinder${state ? ` (${state.toUpperCase()})` : ''}...`);
    const rawDeals = await fetchSpecialsForState({ ...this.config, state });
    console.log(`Coles: ${rawDeals.length} live food deals fetched`);
    return rawDeals;
  }
}

module.exports = new ColesService();
