/**
 * Diagnostic: reproduce the prod weekly-recipe generation failure locally.
 * 1. Pulls the current deals snapshot from the prod deals_cache (DATABASE_URL)
 * 2. Writes it into the local cached-deals.json (restore with git checkout)
 * 3. Runs recipeService.generateWeeklyRecipes() against the local SQLite KB
 *    and the local ANTHROPIC_API_KEY, printing the full error on failure.
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const fs = require('fs');
const path = require('path');
const { Pool } = require('pg');

const CACHE_PATH = path.join(__dirname, '..', 'data', 'cached-deals.json');

(async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, ssl: { rejectUnauthorized: false } });
  const r = await pool.query('SELECT data FROM deals_cache ORDER BY last_updated DESC LIMIT 1');
  await pool.end();
  if (!r.rows[0]) throw new Error('No deals_cache row in prod DB');
  const cache = typeof r.rows[0].data === 'string' ? JSON.parse(r.rows[0].data) : r.rows[0].data;
  const total = (cache.woolworths?.length || 0) + (cache.coles?.length || 0) + (cache.iga?.length || 0);
  console.log(`[repro] Prod snapshot: ${total} deals, lastUpdated ${cache.lastUpdated}`);

  fs.writeFileSync(CACHE_PATH, JSON.stringify(cache), 'utf8');
  console.log('[repro] Wrote prod snapshot to local cached-deals.json');

  const recipeService = require('../services/recipeService');
  const started = Date.now();
  try {
    const recipes = await recipeService.generateWeeklyRecipes();
    console.log(`[repro] SUCCESS — ${recipes.length} recipes in ${((Date.now() - started) / 1000).toFixed(0)}s`);
  } catch (err) {
    console.error(`[repro] FAILED after ${((Date.now() - started) / 1000).toFixed(0)}s`);
    console.error('[repro] message:', err.message);
    console.error('[repro] stack:', err.stack);
    process.exitCode = 1;
  }
})().catch((e) => { console.error('[repro] setup failed:', e.message); process.exit(1); });
