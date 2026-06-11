/**
 * routes/diagnostics.js
 * Unauthenticated scraper diagnostics, mounted at /api/admin BEFORE the
 * admin router (see commit 0579823 — route ordering matters so these are
 * not shadowed). Handlers moved verbatim from server.js.
 */
const express = require('express');

const router = express.Router();

// Quick test: is the Anthropic API key on this instance alive?
// Makes one minimal Haiku call and reports the outcome (or the API error).
router.get('/test-claude', async (req, res) => {
  try {
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.json({ ok: false, error: 'ANTHROPIC_API_KEY not set' });
    }
    const Anthropic = require('@anthropic-ai/sdk');
    const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
    const started = Date.now();
    const response = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 16,
      messages: [{ role: 'user', content: 'Reply with the single word: ok' }],
    });
    res.json({
      ok: true,
      model: response.model,
      reply: response.content[0]?.text ?? null,
      latencyMs: Date.now() - started,
    });
  } catch (err) {
    res.json({
      ok: false,
      errorType: err.constructor?.name ?? 'Error',
      status: err.status ?? null,
      error: err.message,
    });
  }
});

// Quick test: main-site scraper for Woolworths
router.get('/test-mainsite', async (req, res) => {
  try {
    const axios = require('axios');
    const cheerio = require('cheerio');
    const { fetchFromMainSite } = require('../services/salefinder');

    // 1. Test the scraper function
    const deals = await fetchFromMainSite('woolworths', 'woolworths');

    // 2. Also dump raw HTML to debug selectors
    const rawPage = await axios.get('https://www.salefinder.com.au/woolworths-catalogue', {
      timeout: 15000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const $ = cheerio.load(rawPage.data);
    const selectors = {
      'a.item-image': $('a.item-image').length,
      'a.item-name': $('a.item-name').length,
      '.price': $('.price').length,
      '.price-options': $('.price-options').length,
      '.item': $('.item').length,
      '[data-itemname]': $('[data-itemname]').length,
    };
    // Get first product area HTML
    const firstItemImage = $('a.item-image').first();
    const firstParent = firstItemImage.parent().html()?.substring(0, 600) || 'NOT FOUND';
    // Also try broader container
    const firstGrandparent = firstItemImage.parent().parent().html()?.substring(0, 800) || 'NOT FOUND';

    res.json({
      timestamp: new Date().toISOString(),
      scraperResult: { deals: deals.length, sample: deals.slice(0, 3) },
      pageLength: rawPage.data.length,
      selectors,
      firstParentHTML: firstParent,
      firstGrandparentHTML: firstGrandparent,
    });
  } catch (err) {
    res.status(500).json({ error: err.message, stack: err.stack?.split('\n').slice(0, 5) });
  }
});

// Quick diagnostic: test if SaleFinder scraper can discover catalogues
router.get('/test-salefinder', async (req, res) => {
  try {
    const axios = require('axios');
    const { discoverCatalogueIds, getCategories, getItems, loadStateIds, fetchFromMainSite } = require('../services/salefinder');

    const RETAILER_CONFIG = {
      woolworths: { retailerId: 126, locationId: 4778, nameSelector: '.shelfProductTile-descriptionLink' },
      coles:      { retailerId: 148, locationId: 8245, nameSelector: '.sf-item-heading' },
      iga:        { retailerId: 183, locationId: 0,    nameSelector: '.sf-item-heading' },
    };

    const stateIds = loadStateIds();
    const results = {};

    for (const retailer of ['woolworths', 'coles', 'iga']) {
      const cfg = RETAILER_CONFIG[retailer];
      try {
        // 1. Discover from main site
        const catalogues = await discoverCatalogueIds(retailer === 'iga' ? 'IGA' : retailer);
        results[retailer] = {
          discoveredCatalogues: catalogues.map(c => ({ id: c.id, name: c.name })),
          stateIdNsw: stateIds[retailer]?.nsw || null,
        };

        // 2. Test discovered ID with correct retailer config
        if (catalogues.length > 0) {
          const catId = catalogues[0].id;
          const cats = await getCategories(catId, cfg.retailerId, cfg.locationId);
          results[retailer].discovered_categories = cats.length;

          // Raw probe on discovered ID
          try {
            const raw = await axios.get(`https://embed.salefinder.com.au/productlist/category/${catId}`, {
              params: { locationId: cfg.locationId, categoryId: '1', rows_per_page: 5, saleGroup: 0 },
              timeout: 10000,
            });
            results[retailer].discovered_rawLength = raw.data?.length || 0;
            results[retailer].discovered_rawSample = (typeof raw.data === 'string' ? raw.data : '').substring(0, 400);
          } catch (err) {
            results[retailer].discovered_rawError = err.message;
          }
        }

        // 3. Test state catalogue ID (from state-catalogue-ids.json)
        const stateId = stateIds[retailer]?.nsw;
        if (stateId) {
          const cats = await getCategories(stateId, cfg.retailerId, cfg.locationId);
          results[retailer].stateId_categories = cats.length;

          try {
            const raw = await axios.get(`https://embed.salefinder.com.au/productlist/category/${stateId}`, {
              params: { locationId: cfg.locationId, categoryId: '1', rows_per_page: 5, saleGroup: 0 },
              timeout: 10000,
            });
            results[retailer].stateId_rawLength = raw.data?.length || 0;
            results[retailer].stateId_rawSample = (typeof raw.data === 'string' ? raw.data : '').substring(0, 400);
          } catch (err) {
            results[retailer].stateId_rawError = err.message;
          }
        }

        // 4. Try fetching from main salefinder page directly (scrape specials page)
        try {
          const pageUrl = `https://www.salefinder.com.au/${retailer === 'iga' ? 'IGA' : retailer}-specials`;
          const pageRes = await axios.get(pageUrl, { timeout: 15000, headers: { 'User-Agent': 'Mozilla/5.0' } });
          const cheerio = require('cheerio');
          const $ = cheerio.load(pageRes.data);
          // Look for embedded catalogue/sale IDs in the page
          const embedIds = [];
          $('iframe[src*="salefinder"], [data-sale-id], [data-catalogue-id]').each((_, el) => {
            const src = $(el).attr('src') || '';
            const saleId = $(el).attr('data-sale-id') || $(el).attr('data-catalogue-id') || '';
            const match = src.match(/\/(\d+)/);
            if (match) embedIds.push(match[1]);
            if (saleId) embedIds.push(saleId);
          });
          // Also check for sale IDs in script tags
          const scriptText = $('script').text();
          const saleMatches = scriptText.match(/saleId['":\s]+(\d+)/g) || [];
          results[retailer].specialsPage = {
            status: pageRes.status,
            embedIds: [...new Set(embedIds)],
            saleIdsInScripts: saleMatches.slice(0, 5),
          };
        } catch (err) {
          results[retailer].specialsPageError = err.message;
        }

      } catch (err) {
        results[retailer] = { error: err.message };
      }
    }

    // Test main-site scraper for Woolworths specifically
    try {
      const mainSiteDeals = await fetchFromMainSite('woolworths', 'woolworths');
      results.woolworths_mainsite = {
        deals: mainSiteDeals.length,
        sample: mainSiteDeals.slice(0, 3).map(d => ({ name: d.name, price: d.price, originalPrice: d.originalPrice, category: d.category })),
      };
    } catch (err) {
      results.woolworths_mainsite = { error: err.message };
    }

    // Also dump raw HTML from page 1 so we can check selectors
    try {
      const rawPage = await axios.get('https://www.salefinder.com.au/woolworths-catalogue', {
        timeout: 15000,
        headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      });
      const cheerio = require('cheerio');
      const $ = cheerio.load(rawPage.data);
      const itemImages = $('a.item-image').length;
      const itemNames = $('a.item-name').length;
      const prices = $('.price').length;
      const priceOptions = $('.price-options').length;
      const sfItems = $('.sf-item').length;
      // Get sample of the first product container
      const firstProduct = $('a.item-image').first().parent().html()?.substring(0, 500) || 'no a.item-image found';
      results.woolworths_rawHTML = {
        pageLength: rawPage.data.length,
        selectors: { 'a.item-image': itemImages, 'a.item-name': itemNames, '.price': prices, '.price-options': priceOptions, '.sf-item': sfItems },
        firstProductHTML: firstProduct,
      };
    } catch (err) {
      results.woolworths_rawHTML = { error: err.message };
    }

    res.json({ timestamp: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;
