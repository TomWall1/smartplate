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

// Tighter caps on endpoints that trigger scraping or Claude pipelines.
// Generous for any human/cron usage; stops an abusive IP from burning API spend.
const pipelineLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 3, // full scrape/generation pipelines — weekly cron calls this once
});
const aiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30, // per-request Claude work (personalised suggestions, pantry match)
});
app.use('/api/recipes/generate-weekly', pipelineLimiter);
app.use('/api/deals/refresh',           pipelineLimiter);
app.use('/api/admin/refresh-deals',     pipelineLimiter);
app.use('/api/recipes/suggestions',     aiLimiter);
app.use('/api/pantry/match',            aiLimiter);

// Import routes
const dealsRoutes       = require('./routes/deals');
const recipesRoutes     = require('./routes/recipes');
const usersRoutes       = require('./routes/users');
const premiumRoutes     = require('./routes/premium');
const adminRoutes       = require('./routes/admin');
const pantryRoutes      = require('./routes/pantry');
const feedbackRoutes    = require('./routes/feedback');
const authRoutes        = require('./routes/auth');
const diagnosticsRoutes = require('./routes/diagnostics');

// Routes — diagnostics must stay registered before the admin router
// (unauthenticated scraper checks; see commit 0579823 on route ordering).
app.use('/api/admin',    diagnosticsRoutes);
app.use('/api/deals',    dealsRoutes);
app.use('/api/recipes',  recipesRoutes);
app.use('/api/users',    usersRoutes);
app.use('/api/premium',  premiumRoutes);
app.use('/api/admin',    adminRoutes);
app.use('/api/pantry',   pantryRoutes);
app.use('/api/feedback', feedbackRoutes);
app.use('/api/auth',     authRoutes);

// External cron trigger — used by GitHub Actions for the weekly refresh.
// This is the ONLY writer of the deals/recipes artifacts (boot never computes).
// Idempotent: a run-lock rejects concurrent triggers, and a freshness guard
// skips the pipeline when deals were already refreshed recently (duplicate
// trigger, Action retry, manual + scheduled overlap). Override with ?force=true.
// Returns 202 immediately in all cases; the `status` field says what happened.
let _pipelineRunning = false;
const PIPELINE_FRESHNESS_MS = 12 * 60 * 60 * 1000; // 12 hours

app.post('/api/admin/refresh-deals', (req, res) => {
  const skipDiscovery = req.query.skipDiscovery === 'true';
  const force         = req.query.force === 'true';

  if (_pipelineRunning) {
    console.log('External cron: trigger ignored — pipeline already running');
    return res.status(202).json({
      success: true,
      status: 'already-running',
      message: 'Pipeline already in progress — duplicate trigger ignored.',
      timestamp: new Date().toISOString(),
    });
  }

  const dealService = require('./services/dealService');
  const info  = dealService.getCacheInfo();
  const ageMs = info?.lastUpdated ? Date.now() - new Date(info.lastUpdated).getTime() : Infinity;
  if (!force && ageMs < PIPELINE_FRESHNESS_MS) {
    const ageH = (ageMs / 3600000).toFixed(1);
    console.log(`External cron: trigger skipped — deals are only ${ageH}h old`);
    return res.status(202).json({
      success: true,
      status: 'skipped-fresh',
      message: `Deals refreshed ${ageH}h ago (< 12h) — skipping. Use ?force=true to override.`,
      timestamp: new Date().toISOString(),
    });
  }

  console.log(`External cron: triggered deal refresh (discovery: ${!skipDiscovery}, force: ${force})`);
  _pipelineRunning = true;
  res.status(202).json({
    success: true,
    status: 'started',
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
    // Step 2: Deal refresh (national/NSW baseline; enrichment continues in background)
    const dealService = require('./services/dealService');
    const { cache } = await dealService.refreshDeals();
    const total = (cache.woolworths?.length || 0) + (cache.coles?.length || 0) + (cache.iga?.length || 0);
    console.log(`External cron: deal refresh complete — ${total} deals`);

    // Step 3: Regenerate national weekly recipes against the new deals
    try {
      const recipeService = require('./services/recipeService');
      console.log('External cron: regenerating weekly recipes against new deals...');
      const recipes = await recipeService.generateWeeklyRecipes();
      console.log(`External cron: recipe generation complete — ${recipes.length} recipes`);
    } catch (err) {
      console.error('External cron: recipe generation failed:', err.message);
    }

    // Step 4: Per-state deal artifacts. Waits for the background image/PI
    // enrichment of the national cache so shared deals can copy enrichment.
    try {
      console.log('External cron: waiting for enrichment, then building state artifacts...');
      await dealService.waitForEnrichment();
      await dealService.refreshStateDeals();
    } catch (err) {
      console.error('External cron: state deal artifacts failed:', err.message);
    }
    dealService.clearStateDealCaches();

    // Step 5: Per-state recipe artifacts (edge verdicts shared with step 3,
    // so this is matching + composition, near-zero tokens)
    try {
      const recipeService = require('./services/recipeService');
      await recipeService.generateAllStateRecipes();
      console.log('External cron: state recipe artifacts complete');
    } catch (err) {
      console.error('External cron: state recipe generation failed:', err.message);
    }
  })()
    .catch((err) => console.error('External cron: pipeline error:', err.message))
    .finally(() => { _pipelineRunning = false; });
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

    // Non-blocking startup deals check — READ-ONLY.
    // Boot loads the freshest deals from the database (which survives deploys
    // and Render cold starts) and serves them, whatever their age. It never
    // scrapes and never regenerates recipes: the weekly pipeline (GitHub
    // Actions → POST /api/admin/refresh-deals) is the only writer. The old
    // stale-check here re-ran the full pipeline — including paid Claude
    // recipe generation — on every cold start, because the baked-in repo
    // snapshot of cached-deals.json is always months old.
    // Sole exception: a true first-run bootstrap with no deals anywhere.
    (async () => {
      try {
        const dealService = require('./services/dealService');
        await dealService.loadDealsFromDb();

        const info = dealService.getCacheInfo();
        if (info && info.counts.total > 0) {
          dealService.setDealsReady();
          const ageDays = info.lastUpdated
            ? ((Date.now() - new Date(info.lastUpdated).getTime()) / 86400000).toFixed(1)
            : '?';
          console.log(`Startup: deals ready (${info.counts.total} deals, ${ageDays}d old) — boot is read-only; refresh happens via the weekly pipeline`);
          return;
        }

        // Bootstrap: no deals in DB or on disk (first deployment ever).
        console.log('Startup: no deals anywhere — running one-time bootstrap fetch...');
        try {
          const { discoverAndSaveStateCatalogues } = require('./services/salefinder');
          const changed = await discoverAndSaveStateCatalogues();
          console.log(`Startup: catalogue discovery complete (changed: ${changed})`);
        } catch (err) {
          console.warn(`Startup: catalogue discovery failed — continuing: ${err.message}`);
        }

        const fetchPromise = dealService.refreshDeals();
        dealService.setStartupFetch(fetchPromise);
        const { cache } = await fetchPromise;
        console.log(`Startup bootstrap complete — woolworths:${cache.woolworths.length} coles:${cache.coles.length} iga:${cache.iga.length}`);
      } catch (err) {
        console.error('Startup deals check failed:', err.message);
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
          // Boot never generates (a persistent DB failure here would otherwise
          // re-buy a full Claude generation on every cold start). Trigger
          // POST /api/admin/refresh-deals to populate.
          console.error('Startup ALERT: no weekly recipes in DB or filesystem — users see an empty recipe list until the weekly pipeline runs');
        }
      } catch (err) {
        console.error('Startup: recipe check failed:', err.message);
      }
    })();
  });

  // NOTE: the in-process node-cron schedule was removed. It duplicated the
  // GitHub Actions trigger (.github/workflows/weekly-refresh.yml) at the same
  // hour, double-running the paid pipeline whenever the instance was awake,
  // and never fired when the free-tier instance was asleep. GitHub Actions is
  // the single scheduler; it wakes the server first, then POSTs the trigger.
}

// Export for serverless adapters (Vercel etc.)
module.exports = app;