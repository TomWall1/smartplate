require('dotenv').config();
const express = require('express');
const cors = require('cors');
const rateLimit = require('express-rate-limit');

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - Allow requests from Vercel frontend
const corsOptions = {
  origin: [
    'http://localhost:3000', // Local development
    'https://smartplate-beryl.vercel.app', // Vercel frontend
    'https://smartplate.vercel.app', // Alternative Vercel URL
    'https://dealtodish.com', // Production domain
    'https://www.dealtodish.com', // Production domain (www)
    /\.vercel\.app$/, // Any Vercel app subdomain
  ],
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

// Middleware
app.use(cors(corsOptions));
app.use(express.json());

// Handle preflight requests
app.options('*', cors(corsOptions));

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100 // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Import routes
const dealsRoutes   = require('./routes/deals');
const recipesRoutes = require('./routes/recipes');
const usersRoutes   = require('./routes/users');
const premiumRoutes = require('./routes/premium');
const adminRoutes   = require('./routes/admin');
const pantryRoutes    = require('./routes/pantry');
const feedbackRoutes  = require('./routes/feedback');
const authRoutes      = require('./routes/auth');

// Routes
app.use('/api/deals',    dealsRoutes);
app.use('/api/recipes',  recipesRoutes);
app.use('/api/users',    usersRoutes);
app.use('/api/premium',  premiumRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/pantry',   pantryRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/auth',     authRoutes);

// Quick diagnostic: test if SaleFinder scraper can discover catalogues
app.get('/api/admin/test-salefinder', async (req, res) => {
  try {
    const axios = require('axios');
    const { discoverCatalogueIds, getCategories, getItems, loadStateIds } = require('./services/salefinder');

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
    res.json({ timestamp: new Date().toISOString(), results });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// External cron trigger — used by cron-job.org / GitHub Actions for weekly refresh
// Returns 202 immediately; refresh runs in background to avoid proxy timeouts.
app.post('/api/admin/refresh-deals', (req, res) => {
  const skipDiscovery = req.query.skipDiscovery === 'true';
  console.log(`External cron: triggered deal refresh (discovery: ${!skipDiscovery})`);
  res.status(202).json({
    success: true,
    message: 'Deal refresh pipeline started in background.',
    timestamp: new Date().toISOString(),
  });

  (async () => {
    // Step 1: Catalogue discovery (unless skipped)
    if (!skipDiscovery) {
      try {
        const { discoverAndSaveStateCatalogues } = require('./services/salefinder');
        const changed = await discoverAndSaveStateCatalogues();
        console.log(`External cron: catalogue discovery complete (changed: ${changed})`);
      } catch (err) {
        console.warn(`External cron: catalogue discovery failed — continuing: ${err.message}`);
      }
    }
    // Step 2: Deal refresh
    const dealService = require('./services/dealService');
    const { cache } = await dealService.refreshDeals();
    const total = (cache.woolworths?.length || 0) + (cache.coles?.length || 0) + (cache.iga?.length || 0);
    console.log(`External cron: deal refresh complete — ${total} deals`);
    dealService.clearStateDealCaches();

    // Step 3: Regenerate weekly recipes against the new deals
    try {
      const recipeService = require('./services/recipeService');
      console.log('External cron: regenerating weekly recipes against new deals...');
      const recipes = await recipeService.generateWeeklyRecipes();
      console.log(`External cron: recipe generation complete — ${recipes.length} recipes`);
    } catch (err) {
      console.error('External cron: recipe generation failed:', err.message);
    }
  })().catch((err) => console.error('External cron: pipeline error:', err.message));
});

// Health check
app.get('/health', (req, res) => {
  const dealService = require('./services/dealService');
  const info = dealService.getCacheInfo();
  const staleMs = info?.lastUpdated ? Date.now() - new Date(info.lastUpdated).getTime() : null;
  const staleDays = staleMs ? (staleMs / (24 * 60 * 60 * 1000)).toFixed(1) : null;

  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'SmartPlate API is running',
    version: '1.0.0',
    database: process.env.USE_POSTGRESQL === 'true' || process.env.NODE_ENV === 'production' ? 'PostgreSQL' : 'SQLite',
    deals: info ? {
      lastUpdated: info.lastUpdated,
      staleDays,
      isStale: staleDays > 8,
      counts: info.counts,
    } : { error: 'no cache' },
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    message: 'SmartPlate API',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/health',
      deals: '/api/deals/current',
      recipes: '/api/recipes/suggestions',
      recipeHealth: '/api/recipes/health'
    }
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Server Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: err.message,
    timestamp: new Date().toISOString()
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ 
    error: 'Route not found',
    path: req.originalUrl,
    method: req.method,
    timestamp: new Date().toISOString()
  });
});

// Start server (skipped on Vercel which uses module.exports instead)
if (!process.env.VERCEL) {
  app.listen(PORT, () => {
    console.log(`SmartPlate API running on port ${PORT}`);
    console.log(`Environment: ${process.env.NODE_ENV || 'development'}`);

    // Non-blocking startup cache check — populate deals if cache is empty.
    // Registers the fetch promise with dealService so other endpoints can
    // wait for it rather than failing immediately with "no deals".
    (async () => {
      try {
        const dealService = require('./services/dealService');
        const info = dealService.getCacheInfo();
        const isEmpty = !info || info.counts.total === 0;
        const STALE_MS = 8 * 24 * 60 * 60 * 1000; // 8 days
        const isStale = info?.lastUpdated && (Date.now() - new Date(info.lastUpdated).getTime() > STALE_MS);

        if (isEmpty || isStale) {
          if (isStale) {
            // Serve stale deals immediately while refresh runs in background
            dealService.setDealsReady();
            console.log(`Startup: deals cache is stale (last updated ${info.lastUpdated}) — serving stale data while refreshing...`);
          } else {
            console.log('Cache empty on startup — fetching live deals...');
          }

          // Run catalogue discovery first so we have working embed IDs
          try {
            const { discoverAndSaveStateCatalogues } = require('./services/salefinder');
            console.log('Startup: running catalogue discovery before deal refresh...');
            const changed = await discoverAndSaveStateCatalogues();
            console.log(`Startup: catalogue discovery complete (changed: ${changed})`);
          } catch (err) {
            console.warn(`Startup: catalogue discovery failed — continuing: ${err.message}`);
          }

          const fetchPromise = dealService.refreshDeals();
          dealService.setStartupFetch(fetchPromise);
          const { cache } = await fetchPromise;
          console.log(`Startup fetch complete — woolworths:${cache.woolworths.length} coles:${cache.coles.length} iga:${cache.iga.length}`);

          // If any store got 0 deals, log a warning
          for (const store of ['woolworths', 'coles', 'iga']) {
            if ((cache[store]?.length || 0) === 0) {
              console.error(`Startup WARNING: ${store} returned 0 deals — scraper may need attention`);
            }
          }

          // Stale deals were refreshed — regenerate recipes too
          if (isStale) {
            console.log('Startup: deals were stale — regenerating weekly recipes...');
            const recipeService = require('./services/recipeService');
            recipeService.generateWeeklyRecipes()
              .then(recipes => console.log(`Startup: regenerated ${recipes.length} weekly recipes after stale refresh`))
              .catch(err => console.error('Startup: recipe regeneration failed:', err.message));
          }
        } else {
          // Fresh cache exists — mark deals as ready immediately so endpoints can serve
          dealService.setDealsReady();
          console.log(`Startup: deals cache OK (${info.counts.total} deals, last updated ${info.lastUpdated})`);
        }
      } catch (err) {
        console.error('Startup fetch failed:', err.message);
      }
    })();

    // ── Weekly recipes check — load from DB, then generate if still missing ────
    (async () => {
      try {
        const recipeService = require('./services/recipeService');

        // Step 1: Try to restore persisted recipes from the database into /tmp.
        // This is the key fix for Render deploys wiping /tmp on every restart.
        const loadedFromDb = await recipeService.loadWeeklyRecipesFromDb();

        if (loadedFromDb) {
          // DB had recipes — /tmp is now populated; nothing more to do.
          return;
        }

        // Step 2: Check if /tmp or the bundled data file has recipes (local dev fallback).
        const fs   = require('fs');
        const path = require('path');
        const tmpPath  = '/tmp/weekly-recipes.json';
        const dataPath = path.join(__dirname, 'data', 'weekly-recipes.json');

        const existing =
          (fs.existsSync(tmpPath)  && JSON.parse(fs.readFileSync(tmpPath,  'utf8')).recipes?.length) ||
          (fs.existsSync(dataPath) && JSON.parse(fs.readFileSync(dataPath, 'utf8')).recipes?.length) ||
          0;

        if (existing > 0) {
          console.log(`Startup: weekly recipes OK from filesystem (${existing} recipes)`);
        } else {
          console.log('Startup: no weekly recipes found — generating in background...');
          recipeService.generateWeeklyRecipes()
            .then(recipes => console.log(`Startup: generated ${recipes.length} weekly recipes`))
            .catch(err  => console.error('Startup: recipe generation failed:', err.message));
        }
      } catch (err) {
        console.error('Startup: recipe check failed:', err.message);
      }
    })();
  });

  // ── Weekly pipeline — every Wednesday at 4:00 am AEDT ──────────────────────
  // Pipeline: (1) discover catalogue IDs → (2) refresh deals → (3) regenerate recipes
  // Woolworths and Coles catalogues go live at the start of Wednesday.
  const cron = require('node-cron');
  cron.schedule('0 17 * * 2', async () => {
    console.log('Cron: Starting weekly pipeline (catalogue discovery → deal refresh → recipe generation)...');

    // Step 1: Discover current catalogue IDs for all states
    try {
      const { discoverAndSaveStateCatalogues } = require('./services/salefinder');
      const changed = await discoverAndSaveStateCatalogues();
      console.log(`Cron: Catalogue discovery complete (IDs changed: ${changed})`);
    } catch (err) {
      console.warn(`Cron: Catalogue discovery failed — using previous IDs: ${err.message}`);
    }

    // Step 2: Refresh deals (uses updated catalogue IDs)
    try {
      const dealService = require('./services/dealService');
      const { cache } = await dealService.refreshDeals();
      console.log(`Cron: Deals refreshed — ${cache.woolworths.length} WW, ${cache.coles.length} Coles, ${cache.iga.length} IGA`);
      dealService.clearStateDealCaches();
    } catch (err) {
      console.error('Cron: Deals refresh failed:', err.message);
    }

    // Step 3: Regenerate weekly recipes against the new deals
    try {
      const recipeService = require('./services/recipeService');
      console.log('Cron: Regenerating weekly recipes against new deals...');
      const recipes = await recipeService.generateWeeklyRecipes();
      console.log(`Cron: Recipe generation complete — ${recipes.length} recipes`);
    } catch (err) {
      console.error('Cron: Recipe generation failed:', err.message);
    }
  }, { timezone: 'Australia/Sydney' });

  console.log('Cron: Scheduled weekly pipeline every Tuesday 5pm UTC (Wednesday 4am AEDT)');
}

// Export for serverless adapters (Vercel etc.)
module.exports = app;