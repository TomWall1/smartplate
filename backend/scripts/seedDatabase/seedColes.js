/**
 * scripts/seedDatabase/seedColes.js
 *
 * Queries the Coles products API for common ingredient search terms,
 * deduplicates with existing DB entries, categorizes new products via Claude,
 * and seeds the database.
 * Expected yield: ~15K products.
 *
 * Usage: node backend/scripts/seedDatabase/seedColes.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const https = require('https');
const db    = require('../../database/db');
const { normalizeName } = require('../../services/productLookup');
const { claudeCategorizeBatch, basicFallback } = require('../../services/productCategorizer');

// ── Search terms (shared with Woolworths for consistency) ─────────────────────

const SEARCH_TERMS = [
  // Proteins
  'chicken breast', 'chicken thigh', 'beef mince', 'beef steak',
  'lamb chops', 'pork chops', 'bacon', 'ham', 'salmon', 'prawns',
  'tuna canned', 'eggs', 'tofu', 'fish fillet',

  // Dairy
  'milk', 'butter', 'cheddar cheese', 'mozzarella', 'parmesan',
  'cream cheese', 'sour cream', 'thickened cream', 'yoghurt',
  'ricotta', 'brie',

  // Vegetables
  'broccoli', 'cauliflower', 'spinach', 'capsicum', 'zucchini',
  'sweet potato', 'potato', 'pumpkin', 'carrot', 'onion',
  'garlic', 'mushroom', 'tomato', 'corn', 'peas frozen',
  'green beans', 'asparagus', 'leek',

  // Fruit
  'apple', 'banana', 'orange', 'lemon', 'strawberry', 'blueberry',
  'mango', 'avocado', 'grape',

  // Grains & Pasta
  'pasta spaghetti', 'pasta penne', 'pasta fettuccine',
  'rice', 'bread', 'flour', 'oats', 'noodles', 'couscous', 'quinoa',

  // Canned & Preserved
  'canned tomatoes', 'chickpeas', 'lentils', 'kidney beans',
  'coconut cream', 'coconut milk', 'tuna in oil',

  // Condiments & Sauces
  'olive oil', 'soy sauce', 'fish sauce', 'oyster sauce',
  'pasta sauce', 'bbq sauce', 'sweet chilli sauce',
  'chicken stock', 'beef stock', 'vegetable stock',

  // Herbs & Spices
  'garlic powder', 'paprika', 'cumin', 'oregano', 'basil dried',
  'chilli flakes', 'black pepper',
];

// ── Coles API ─────────────────────────────────────────────────────────────────

const COLES_HEADERS = {
  'User-Agent':    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':        'application/json, text/plain, */*',
  'Referer':       'https://www.coles.com.au/',
  'Origin':        'https://www.coles.com.au',
};

function fetchColes(searchTerm, page = 1) {
  const url = `https://www.coles.com.au/api/2.0/page/categories/` +
    `search?q=${encodeURIComponent(searchTerm)}&page=${page}&pageSize=48`;

  return new Promise((resolve) => {
    https.get(url, { headers: COLES_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null);
        res.resume();
        return;
      }
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        try { resolve(JSON.parse(data)); }
        catch { resolve(null); }
      });
    }).on('error', () => resolve(null));
  });
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

// ── Extract products ──────────────────────────────────────────────────────────

function extractProducts(data, searchTerm) {
  const products = [];

  const results = data?.results ?? data?.catalogEntryView ?? [];
  for (const item of results) {
    const name = (item.name || item.displayName || '').trim();
    if (!name) continue;

    products.push({
      coles_id: String(item.id ?? item.productId ?? ''),
      barcode:  item.ean ? String(item.ean) : null,
      name,
      brand:    item.brand ?? null,
      size:     item.size ?? item.packageSize ?? null,
      price:    item.pricing?.now ?? item.price ?? null,
      category: item.category ?? searchTerm,
    });
  }

  return products;
}

// ── Process + save ────────────────────────────────────────────────────────────

const CLAUDE_BATCH_SIZE = 10;

async function processAndSave(rawProducts) {
  if (rawProducts.length === 0) return;

  const newOnes = [];

  for (const p of rawProducts) {
    const known = p.barcode ? db.getProductByBarcode(p.barcode) : null;
    if (known) {
      if (p.coles_id) {
        db.getDb().prepare(
          'UPDATE products SET coles_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND coles_id IS NULL'
        ).run(p.coles_id, known.id);
      }
    } else {
      const norm   = normalizeName(p.name);
      const byName = db.getProductByNormalizedName(norm);
      if (!byName) {
        newOnes.push({ ...p, normalized_name: norm });
      } else if (p.coles_id) {
        db.getDb().prepare(
          'UPDATE products SET coles_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND coles_id IS NULL'
        ).run(p.coles_id, byName.id);
      }
    }
  }

  if (newOnes.length === 0) return;

  for (let i = 0; i < newOnes.length; i += CLAUDE_BATCH_SIZE) {
    const batch = newOnes.slice(i, i + CLAUDE_BATCH_SIZE);
    let categorizations;
    try {
      categorizations = await claudeCategorizeBatch(
        batch.map((p) => ({ name: p.name, category: p.category, price: p.price }))
      );
    } catch (err) {
      console.warn('[ColesSeed] Claude batch failed, using fallback:', err.message);
      categorizations = batch.map((p) => basicFallback(p.name, p.category));
    }

    for (let j = 0; j < batch.length; j++) {
      const p   = batch[j];
      const cat = categorizations[j] ?? basicFallback(p.name, p.category);

      db.insertProduct({
        barcode:               p.barcode,
        name:                  p.name,
        normalized_name:       p.normalized_name,
        brand:                 p.brand,
        size:                  p.size,
        product_type:          cat.productType          ?? null,
        base_ingredient:       cat.baseIngredient        ?? null,
        category:              cat.category              ?? null,
        sub_category:          cat.subCategory           ?? null,
        processing_level:      cat.processingLevel       ?? null,
        is_hero_ingredient:    cat.isHeroIngredient      ?? false,
        typical_use_case:      cat.typicalUseCase        ?? null,
        purchase_reasonability: cat.purchaseReasonability ?? null,
        satisfies_ingredients: cat.satisfiesIngredients  ?? [],
        source:                'coles',
        coles_id:              p.coles_id,
      });
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log(`[ColesSeed] Starting Coles seed (${SEARCH_TERMS.length} search terms)...`);

  const stats = { terms: 0, found: 0, newProducts: 0, errors: 0 };
  const seen  = new Set();

  for (const term of SEARCH_TERMS) {
    stats.terms++;
    process.stdout.write(`[ColesSeed] (${stats.terms}/${SEARCH_TERMS.length}) "${term}" ... `);

    let data;
    try {
      data = await fetchColes(term);
    } catch (err) {
      console.log(`ERROR: ${err.message}`);
      stats.errors++;
      await sleep(2000);
      continue;
    }

    if (!data) {
      console.log('no response');
      await sleep(2000);
      continue;
    }

    const raw = extractProducts(data, term).filter((p) => {
      const key = p.coles_id || p.name;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    stats.found += raw.length;
    console.log(`${raw.length} products`);

    const before = db.countProducts();
    try {
      await processAndSave(raw);
    } catch (err) {
      console.error('[ColesSeed] processAndSave error:', err.message);
      stats.errors++;
    }
    const after = db.countProducts();
    stats.newProducts += (after - before);

    await sleep(2000);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const dbStats = db.getStats();
  console.log('\n[ColesSeed] ── Summary ──────────────────────────');
  console.log(`  Terms searched:  ${stats.terms}`);
  console.log(`  Products found:  ${stats.found}`);
  console.log(`  New in DB:       ${stats.newProducts}`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`  DB total:        ${dbStats.products} products`);
  console.log(`  Time:            ${elapsed}s`);
  console.log('─────────────────────────────────────────────────\n');

  db.closeDb();
}

main().catch((err) => {
  console.error('[ColesSeed] Fatal:', err.message);
  process.exit(1);
});
