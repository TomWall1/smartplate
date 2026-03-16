const { fetchSpecialsForState } = require('./salefinder');

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

  async fetchDeals(state) {
    console.log(`Fetching IGA deals from SaleFinder${state ? ` (${state.toUpperCase()})` : ''}...`);
    const deals = await fetchSpecialsForState({ ...this.config, state });
    console.log(`IGA: ${deals.length} live food deals fetched`);
    return deals;
  }
}

module.exports = new IGAService();
