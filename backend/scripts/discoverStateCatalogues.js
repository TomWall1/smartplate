#!/usr/bin/env node

/**
 * discoverStateCatalogues.js
 *
 * CLI wrapper around the title-based catalogue discovery in
 * services/salefinder.js. (The old URL-probing logic that lived here
 * misclassified every catalogue as NSW once SaleFinder started returning
 * HTTP 200 for every state path — at one point "Woolworths NSW" pointed at
 * an IGA Victoria catalogue.)
 *
 * Probes the live SaleFinder embed API, classifies catalogues by title
 * (retailer + state + validity window) and saves the per-state IDs to
 * backend/data/state-catalogue-ids.json.
 *
 * Usage: node backend/scripts/discoverStateCatalogues.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });
const { discoverAndSaveStateCatalogues, loadStateIds } = require('../services/salefinder');

(async () => {
  const changed = await discoverAndSaveStateCatalogues();
  console.log(`\nDiscovery complete (changed: ${changed}). Current map:`);
  console.log(JSON.stringify(loadStateIds(), null, 2));
  process.exit(0);
})().catch((e) => { console.error('FAIL:', e.message); process.exit(1); });
