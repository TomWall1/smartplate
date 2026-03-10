/**
 * scripts/seedDatabase/seedOpenFoodFacts.js
 *
 * Downloads the Open Food Facts Australian products CSV and seeds the database.
 * Expected yield: ~40K food products.
 *
 * Usage: node backend/scripts/seedDatabase/seedOpenFoodFacts.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const https       = require('https');
const fs          = require('fs');
const path        = require('path');
const { pipeline } = require('stream/promises');
const readline    = require('readline');
const zlib        = require('zlib');

const db              = require('../../database/db');
const { normalizeName } = require('../../services/productLookup');

// ── Config ────────────────────────────────────────────────────────────────────

// Full dump URL — large file, ~2GB compressed. We use the smaller country-specific extract.
const OFF_URL  = 'https://static.openfoodfacts.org/data/exports/products.csv.gz';
// Smaller Australian-tagged file
const OFF_AU_URL = 'https://world.openfoodfacts.org/cgi/search.pl?action=process&tagtype_0=countries&tag_contains_0=contains&tag_0=australia&json=1&page_size=1000&fields=code,product_name,brands,quantity,categories,nova_groups,pnns_groups_1,pnns_groups_2&page=1';

const DOWNLOAD_PATH = path.join(__dirname, '../../data/off_products.csv.gz');
const MAX_PRODUCTS  = 60000; // safety cap

// Non-food PNNS groups to skip
const NON_FOOD_GROUPS = new Set([
  'Non food products and drinks',
  'unknown',
]);

// ── NOVA → processingLevel ────────────────────────────────────────────────────

function novaToLevel(nova) {
  switch (String(nova)) {
    case '1': return 'unprocessed';
    case '2': return 'minimally_processed';
    case '3': return 'processed';
    case '4': return 'ultra_processed';
    default:  return null;
  }
}

// ── Category → satisfiesIngredients heuristic ────────────────────────────────

function buildSatisfiesIngredients(name, pnns1, pnns2) {
  const lower = name.toLowerCase();
  const words = lower.replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter((w) => w.length > 2);
  const result = new Set();

  // Add cleaned name
  result.add(lower.replace(/\b\d+(\.\d+)?\s*(g|kg|ml|l)\b/g, '').trim());

  // Add significant words
  words.slice(0, 3).forEach((w) => result.add(w));

  // Category-based additions
  if (pnns2) result.add(pnns2.toLowerCase());

  return [...result].filter(Boolean).slice(0, 6);
}

// ── isHeroIngredient heuristic ────────────────────────────────────────────────

const HERO_PNNS1 = new Set([
  'Meat', 'Fish and seafood', 'Milk and dairy products',
  'Fruits and vegetables', 'Cereals and potatoes', 'Legumes',
]);

function isHeroIngredient(pnns1, nova) {
  if (HERO_PNNS1.has(pnns1) && Number(nova) <= 2) return true;
  return false;
}

// ── Streaming CSV parser ──────────────────────────────────────────────────────

async function* parseCsvStream(stream, delimiter = '\t') {
  const rl = readline.createInterface({ input: stream, crlfDelay: Infinity });
  let headers = null;
  for await (const line of rl) {
    if (!headers) {
      headers = line.split(delimiter).map((h) => h.trim());
      continue;
    }
    const fields = line.split(delimiter);
    const row = {};
    headers.forEach((h, i) => { row[h] = (fields[i] ?? '').trim(); });
    yield row;
  }
}

// ── Download helpers ──────────────────────────────────────────────────────────

function downloadFile(url, dest) {
  return new Promise((resolve, reject) => {
    console.log(`[OFFSeed] Downloading: ${url}`);
    const file = fs.createWriteStream(dest);
    https.get(url, (res) => {
      if (res.statusCode === 301 || res.statusCode === 302) {
        file.close();
        downloadFile(res.headers.location, dest).then(resolve, reject);
        return;
      }
      if (res.statusCode !== 200) {
        reject(new Error(`HTTP ${res.statusCode} for ${url}`));
        return;
      }
      res.pipe(file);
      file.on('finish', () => { file.close(); resolve(); });
    }).on('error', reject);
  });
}

// ── Use Open Food Facts JSON API (page-by-page) instead of bulk CSV ───────────
// The full CSV is 2GB+ which is impractical. We use the search API for AU products.

async function fetchPageJson(page, pageSize = 500) {
  const url = `https://world.openfoodfacts.org/cgi/search.pl?action=process` +
    `&tagtype_0=countries&tag_contains_0=contains&tag_0=australia` +
    `&json=1&page_size=${pageSize}&page=${page}` +
    `&fields=code,product_name,brands,quantity,categories_tags,` +
    `nova_groups,pnns_groups_1,pnns_groups_2`;

  const { default: fetch } = await import('node-fetch').catch(() => {
    // node-fetch may not be installed — fall back to built-in
    return { default: null };
  });

  if (fetch) {
    const res = await fetch(url);
    return res.json();
  }

  // Fallback: use https module
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { 'User-Agent': 'SmartPlate/1.0 (recipe-app)' } }, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch (e) { reject(e); }
      });
    }).on('error', reject);
  });
}

// ── Row → product ─────────────────────────────────────────────────────────────

function rowToProduct(item) {
  const name = (item.product_name || '').trim();
  if (!name || name.length < 2) return null;

  const pnns1 = item.pnns_groups_1 || '';
  const pnns2 = item.pnns_groups_2 || '';

  // Skip non-food
  if (NON_FOOD_GROUPS.has(pnns1)) return null;

  const barcode        = item.code || null;
  const normalizedName = normalizeName(name);
  const brand          = (item.brands || '').split(',')[0].trim() || null;
  const size           = item.quantity || null;
  const novaGroup      = item.nova_groups || null;

  const satisfies = buildSatisfiesIngredients(name, pnns1, pnns2);

  return {
    barcode,
    name,
    normalized_name:       normalizedName,
    brand,
    size,
    product_type:          pnns2 || pnns1 || null,
    base_ingredient:       pnns2 ? pnns2.toLowerCase() : null,
    category:              pnns1ToCategory(pnns1),
    sub_category:          pnns2 || null,
    processing_level:      novaToLevel(novaGroup),
    is_hero_ingredient:    isHeroIngredient(pnns1, novaGroup),
    typical_use_case:      null,
    purchase_reasonability: null,
    satisfies_ingredients: satisfies,
    source:                'open_food_facts',
  };
}

function pnns1ToCategory(pnns1) {
  const map = {
    'Meat':                       'meat',
    'Fish and seafood':           'seafood',
    'Milk and dairy products':    'dairy',
    'Eggs':                       'eggs',
    'Fruits and vegetables':      'vegetables',
    'Cereals and potatoes':       'grains',
    'Legumes':                    'legumes',
    'Fats':                       'oils_fats',
    'Sauces and condiments':      'condiments',
    'Sugary snacks':              'snacks',
    'Salty snacks':               'snacks',
    'Beverages':                  'beverages',
    'Composite foods':            'other',
  };
  return map[pnns1] ?? 'other';
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log('[OFFSeed] Starting Open Food Facts seed...');

  const stats    = { total: 0, inserted: 0, skipped: 0, errors: 0 };
  const BATCH    = 500;
  const PAGE_SIZE = 500;
  let page        = 1;
  let batch       = [];

  const flush = () => {
    if (batch.length === 0) return;
    try {
      const result = db.insertProductBatch(batch);
      stats.inserted += result.inserted + result.updated;
    } catch (err) {
      console.error('[OFFSeed] Batch insert error:', err.message);
      stats.errors += batch.length;
    }
    batch = [];
  };

  while (stats.total < MAX_PRODUCTS) {
    let pageData;
    try {
      pageData = await fetchPageJson(page, PAGE_SIZE);
    } catch (err) {
      console.error(`[OFFSeed] Page ${page} fetch error:`, err.message);
      break;
    }

    const products = pageData?.products ?? [];
    if (products.length === 0) {
      console.log('[OFFSeed] No more products returned — done.');
      break;
    }

    for (const item of products) {
      stats.total++;
      const product = rowToProduct(item);
      if (!product) {
        stats.skipped++;
        continue;
      }
      batch.push(product);
      if (batch.length >= BATCH) flush();
    }

    flush();

    if (stats.total % 1000 === 0 || stats.total <= PAGE_SIZE) {
      const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
      console.log(`[OFFSeed] Page ${page} — ${stats.total} processed, ${stats.inserted} inserted (${elapsed}s)`);
    }

    page++;

    // Polite delay between pages
    await new Promise((r) => setTimeout(r, 500));
  }

  flush();

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const dbStats = db.getStats();
  console.log('\n[OFFSeed] ── Summary ──────────────────────────');
  console.log(`  Pages fetched:   ${page - 1}`);
  console.log(`  Rows processed:  ${stats.total}`);
  console.log(`  Inserted/merged: ${stats.inserted}`);
  console.log(`  Skipped:         ${stats.skipped}`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`  DB total:        ${dbStats.products} products`);
  console.log(`  Time:            ${elapsed}s`);
  console.log('──────────────────────────────────────────────\n');

  db.closeDb();
}

main().catch((err) => {
  console.error('[OFFSeed] Fatal:', err.message);
  process.exit(1);
});
