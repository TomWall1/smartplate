#!/usr/bin/env node

/**
 * Salefinder State Catalogue Discoverer
 *
 * Catalogue IDs change every week. This script discovers the current IDs for all
 * Australian states by probing a range of IDs around the known NSW baseline.
 *
 * Strategy:
 *   1. Use discoverCatalogueIds() to get the current NSW catalogue IDs (geo-located)
 *   2. Probe IDs in a window of ±150 around each NSW ID
 *   3. For each valid ID, identify the state from the catalogue HTML/name
 *   4. Save results to backend/data/state-catalogue-ids.json
 *
 * Usage: cd backend && node scripts/discoverStateCatalogues.js
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('path');
const path    = require('path');

const { discoverCatalogueIds, getCategories } = require('../services/salefinder');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'state-catalogue-ids.json');
const BASE_URL    = 'https://www.salefinder.com.au';

// Probe window around the known NSW ID
const PROBE_BEFORE = 150;
const PROBE_AFTER  = 50;

// Parallel batch size (avoid hammering the server)
const BATCH_SIZE   = 8;
const DELAY_MS     = 300;

// State abbreviations to detect in catalogue names/URLs
const STATE_PATTERNS = {
  nsw: /\bnsw\b|new south wales/i,
  vic: /\bvic\b|victoria/i,
  qld: /\bqld\b|queensland/i,
  wa:  /\bwa\b|western australia/i,
  sa:  /\bsa\b|south australia/i,
  tas: /\btas\b|tasmania/i,
  nt:  /\bnt\b|northern territory/i,
  act: /\bact\b|australian capital/i,
};

const RETAIL_PATTERNS = {
  woolworths: /woolworths/i,
  coles:      /coles/i,
  iga:        /\biga\b/i,
};

const http = axios.create({
  timeout: 15000,
  headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Try to get a catalogue's name and state by fetching the salefinder catalogue page.
 * The page URL contains the state slug: /woolworths-catalogue/weekly-catalogue-nsw/64710/
 */
async function getCatalogueInfo(retailerSlug, catalogueId) {
  // Guess state-specific slugs based on current naming pattern
  const states = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act'];
  const slugVariants = [
    `weekly-catalogue-{state}`,
    `weekly-specials-catalogue-{state}`,
    `weekly-catalogue-{state}-metro`,
    `coles-catalogue-{state}-metro`,
  ];

  for (const state of states) {
    for (const slugTemplate of slugVariants) {
      const slug = slugTemplate.replace('{state}', state);
      const url  = `${BASE_URL}/${retailerSlug}-catalogue/${slug}/${catalogueId}/catalogue2`;
      try {
        const res = await http.get(url);
        if (res.status === 200) {
          // Found the state via URL
          const $ = cheerio.load(res.data);
          const name = $('title').text().trim() || `${retailerSlug} ${state.toUpperCase()}`;
          return { state, name, url };
        }
      } catch {
        // 404 or redirect — try next
      }
    }
  }
  return null;
}

/**
 * Quick-test whether a catalogue ID is valid by trying to fetch 1 product.
 * Returns { valid, retailer } or { valid: false }.
 */
async function probeId(id) {
  const url = `https://embed.salefinder.com.au/productlist/category/${id}`;
  try {
    const res = await http.get(url, {
      params: { categoryId: '1', rows_per_page: 1, saleGroup: 0 },
    });

    if (typeof res.data !== 'string' || res.data.length < 10) return { valid: false };

    // JSONP wrapper: ([{...}]) — parse inner JSON
    const inner = res.data.substring(1, res.data.length - 1).replace(/[\r\n\t]/g, '');
    let parsed;
    try { parsed = JSON.parse(inner); } catch { return { valid: false }; }

    if (!parsed?.content || parsed.content.length < 20) return { valid: false };

    // Look for retailer + state hints in the content
    const html = parsed.content;
    let retailer = null;
    for (const [name, pattern] of Object.entries(RETAIL_PATTERNS)) {
      if (pattern.test(html)) { retailer = name; break; }
    }

    let state = null;
    for (const [abbr, pattern] of Object.entries(STATE_PATTERNS)) {
      if (pattern.test(html)) { state = abbr; break; }
    }

    return { valid: true, retailer, state, contentLength: html.length };
  } catch {
    return { valid: false };
  }
}

/**
 * Probe a range of IDs in parallel batches and return valid ones.
 */
async function probeRange(startId, endId) {
  const results = [];
  const ids = Array.from({ length: endId - startId + 1 }, (_, i) => startId + i);

  process.stdout.write(`  Probing IDs ${startId}-${endId} (${ids.length} total):`);

  for (let i = 0; i < ids.length; i += BATCH_SIZE) {
    const batch = ids.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(batch.map(id => probeId(id).then(r => ({ id, ...r }))));

    for (const result of batchResults) {
      if (result.valid) {
        results.push(result);
        process.stdout.write(` ${result.id}✓`);
      }
    }

    if (i + BATCH_SIZE < ids.length) await sleep(DELAY_MS);
  }

  process.stdout.write('\n');
  return results;
}

/**
 * For a retailer, probe around its known NSW catalogue ID to find all state IDs.
 * Falls back to checking for state info via the salefinder.com.au page.
 */
async function discoverStatesForRetailer(retailerSlug, retailerId) {
  console.log(`\nDiscovering catalogues for: ${retailerSlug}`);

  // Step 1: Get baseline NSW catalogue from geo-located page
  let catalogues;
  try {
    catalogues = await discoverCatalogueIds(retailerSlug);
  } catch (err) {
    console.warn(`  Could not fetch base catalogues: ${err.message}`);
    catalogues = [];
  }

  if (catalogues.length === 0) {
    console.warn(`  No catalogues found for ${retailerSlug} via main page. Skipping.`);
    return null;
  }

  const baseId = Math.max(...catalogues.map(c => c.id));
  console.log(`  Base (NSW) catalogue ID: ${baseId}`);
  console.log(`  Probing ${baseId - PROBE_BEFORE} → ${baseId + PROBE_AFTER}…`);

  // Step 2: Probe range
  const probeStart = baseId - PROBE_BEFORE;
  const probeEnd   = baseId + PROBE_AFTER;
  const valid      = await probeRange(probeStart, probeEnd);

  console.log(`  Found ${valid.length} valid catalogue IDs in range`);

  // Step 3: Resolve state for each valid ID
  const stateMap = {};

  for (const entry of valid) {
    // First try: state detected from content HTML
    if (entry.state) {
      if (!stateMap[entry.state] || entry.id > stateMap[entry.state]) {
        stateMap[entry.state] = entry.id;
      }
      continue;
    }

    // Second try: fetch salefinder.com.au catalogue page to find state in URL
    console.log(`  Resolving state for ID ${entry.id}…`);
    const info = await getCatalogueInfo(retailerSlug, entry.id);
    if (info) {
      console.log(`    → ${entry.id} = ${info.state.toUpperCase()} (${info.name})`);
      if (!stateMap[info.state] || entry.id > stateMap[info.state]) {
        stateMap[info.state] = entry.id;
      }
    } else {
      console.log(`    → ${entry.id}: could not determine state`);
    }

    await sleep(500);
  }

  return stateMap;
}

// ── Main ──────────────────────────────────────────────────────────────────────

const RETAILERS = [
  { slug: 'woolworths', id: 2318 },
  { slug: 'coles',      id: 2308 },
  { slug: 'iga',        id: 2293 },
];

async function main() {
  console.log('=== Salefinder State Catalogue Discoverer ===\n');

  // Load existing data as fallback
  let existing = {};
  try {
    existing = JSON.parse(require('fs').readFileSync(OUTPUT_PATH, 'utf8'));
  } catch {}

  const output = {
    _comment:     'Salefinder catalogue IDs by retailer and state. These IDs change weekly. Run scripts/discoverStateCatalogues.js to refresh them.',
    _lastUpdated: new Date().toISOString().slice(0, 10),
    _weekOf:      new Date(Date.now() - (new Date().getDay() || 7) * 86400000 + 86400000).toISOString().slice(0, 10), // Monday of current week
  };

  for (const retailer of RETAILERS) {
    const stateMap = await discoverStatesForRetailer(retailer.slug, retailer.id);

    if (!stateMap || Object.keys(stateMap).length === 0) {
      console.warn(`  Falling back to existing data for ${retailer.slug}`);
      output[retailer.slug] = existing[retailer.slug] || {};
      continue;
    }

    // Fill in any missing states with null
    const allStates = ['nsw', 'vic', 'qld', 'wa', 'sa', 'tas', 'nt', 'act'];
    output[retailer.slug] = {};
    for (const state of allStates) {
      output[retailer.slug][state] = stateMap[state] ?? (existing[retailer.slug]?.[state] ?? null);
    }

    // ACT falls back to NSW if not found separately
    if (!output[retailer.slug].act) {
      output[retailer.slug].act = output[retailer.slug].nsw ?? null;
    }

    console.log(`\n  ${retailer.slug} state map:`);
    for (const [state, id] of Object.entries(output[retailer.slug])) {
      console.log(`    ${state.padEnd(4)} → ${id ?? 'NOT FOUND'}`);
    }
  }

  require('fs').writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
