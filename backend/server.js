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
const dealsRoutes = require('./routes/deals');
const recipesRoutes = require('./routes/recipes');
const usersRoutes = require('./routes/users');

// Routes
app.use('/api/deals', dealsRoutes);
app.use('/api/recipes', recipesRoutes);
app.use('/api/users', usersRoutes);

// External cron trigger — used by cron-job.org / GitHub Actions for weekly refresh
// Returns 202 immediately; refresh runs in background to avoid proxy timeouts.
app.post('/api/admin/refresh-deals', (req, res) => {
  console.log('External cron: triggered deal refresh (background)');
  res.status(202).json({
    success: true,
    message: 'Deal refresh started in background.',
    timestamp: new Date().toISOString(),
  });
  const dealService = require('./services/dealService');
  dealService.refreshDeals()
    .then(({ cache }) => {
      const total = (cache.woolworths?.length || 0) + (cache.coles?.length || 0) + (cache.iga?.length || 0);
      console.log(`External cron: deal refresh complete — ${total} deals`);
    })
    .catch((err) => console.error('External cron: deal refresh error:', err.message));
});

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    message: 'SmartPlate API is running',
    version: '1.0.0',
    database: process.env.USE_POSTGRESQL === 'true' || process.env.NODE_ENV === 'production' ? 'PostgreSQL' : 'SQLite',
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
        if (isEmpty) {
          console.log('Cache empty on startup — fetching live deals...');
          const fetchPromise = dealService.refreshDeals();
          dealService.setStartupFetch(fetchPromise);
          const { cache } = await fetchPromise;
          console.log(`Startup fetch complete — woolworths:${cache.woolworths.length} coles:${cache.coles.length} iga:${cache.iga.length}`);
        } else {
          console.log(`Startup: deals cache OK (${info.counts.total} deals, last updated ${info.lastUpdated})`);
        }
      } catch (err) {
        console.error('Startup fetch failed:', err.message);
      }
    })();

    // ── Weekly recipes check — generate in background if missing ───────────────
    (async () => {
      try {
        const recipeService = require('./services/recipeService');
        const fs   = require('fs');
        const path = require('path');

        const tmpPath  = '/tmp/weekly-recipes.json';
        const dataPath = path.join(__dirname, 'data', 'weekly-recipes.json');

        const existing =
          (fs.existsSync(tmpPath)  && JSON.parse(fs.readFileSync(tmpPath,  'utf8')).recipes?.length) ||
          (fs.existsSync(dataPath) && JSON.parse(fs.readFileSync(dataPath, 'utf8')).recipes?.length) ||
          0;

        if (existing > 0) {
          console.log(`Startup: weekly recipes OK (${existing} recipes)`);
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

  // ── Weekly deals refresh — every Wednesday at 11:00 pm AEST ────────────────
  // Woolworths and Coles catalogues update Wednesday evening.
  // node-cron uses the server's local time by default; we set timezone explicitly.
  const cron = require('node-cron');
  cron.schedule('0 23 * * 3', async () => {
    console.log('Cron: Starting scheduled weekly deals refresh...');
    try {
      const dealService = require('./services/dealService');
      const { cache } = await dealService.refreshDeals();
      console.log(`Cron: Deals refreshed — ${cache.woolworths.length} WW, ${cache.coles.length} Coles, ${cache.iga.length} IGA`);
    } catch (err) {
      console.error('Cron: Deals refresh failed:', err.message);
    }
  }, { timezone: 'Australia/Sydney' });

  console.log('Cron: Scheduled weekly deals refresh every Wednesday at 11 pm AEST');
}

// Export for serverless adapters (Vercel etc.)
module.exports = app;