const express = require('express');
const router = express.Router();
const { getCurrentDeals, updateAllDeals } = require('../services/dealService');

// Get current deals
router.get('/current', async (req, res) => {
  try {
    const deals = await getCurrentDeals();
    res.json(deals);
  } catch (error) {
    console.error('Error fetching deals:', error);
    res.status(500).json({ error: 'Failed to fetch deals' });
  }
});

// Manually trigger deal update (admin endpoint)
router.post('/refresh', async (req, res) => {
  try {
    await updateAllDeals();
    res.json({ message: 'Deals updated successfully' });
  } catch (error) {
    console.error('Error updating deals:', error);
    res.status(500).json({ error: 'Failed to update deals' });
  }
});

// Get deals by store
router.get('/store/:storeName', async (req, res) => {
  try {
    const { storeName } = req.params;
    const deals = await getCurrentDeals();
    const storeDeals = deals.filter(deal => deal.store === storeName.toLowerCase());
    res.json(storeDeals);
  } catch (error) {
    console.error('Error fetching store deals:', error);
    res.status(500).json({ error: 'Failed to fetch store deals' });
  }
});

module.exports = router;