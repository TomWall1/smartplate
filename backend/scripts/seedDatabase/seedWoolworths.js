/**
 * scripts/seedDatabase/seedWoolworths.js
 *
 * Queries the Woolworths products API for 100 common ingredient search terms,
 * deduplicates, categorizes new products via Claude, and seeds the database.
 * Expected yield: ~20K products.
 *
 * Usage: node backend/scripts/seedDatabase/seedWoolworths.js
 */

require('dotenv').config({ path: require('path').join(__dirname, '../../.env') });

const https = require('https');
const db    = require('../../database/db');
const { normalizeName } = require('../../services/productLookup');
const { claudeCategorizeBatch, basicFallback } = require('../../services/productCategorizer');

// ── Search terms ──────────────────────────────────────────────────────────────

const SEARCH_TERMS = [
  // Proteins
  'chicken breast', 'chicken thigh', 'chicken mince', 'whole chicken',
  'beef mince', 'beef steak', 'beef roast', 'lamb chops', 'lamb mince',
  'pork chops', 'pork mince', 'bacon rashers', 'ham',
  'salmon fillet', 'salmon portions', 'tuna canned', 'prawns', 'fish fillet',
  'eggs dozen', 'tofu', 'tempeh',

  // Dairy
  'milk full cream', 'milk skim', 'butter unsalted', 'butter salted',
  'cheddar cheese', 'mozzarella', 'parmesan', 'cream cheese', 'brie',
  'sour cream', 'thickened cream', 'yoghurt greek', 'yoghurt natural',
  'ricotta', 'cottage cheese',

  // Vegetables
  'broccoli', 'cauliflower', 'spinach', 'kale', 'lettuce', 'capsicum',
  'zucchini', 'eggplant', 'sweet potato', 'potato', 'pumpkin',
  'carrot', 'celery', 'onion brown', 'onion red', 'spring onion',
  'garlic', 'ginger', 'mushroom', 'tomato', 'cherry tomato',
  'corn cob', 'corn frozen', 'peas frozen', 'green beans',
  'asparagus', 'leek', 'fennel',

  // Fruit
  'apple', 'banana', 'orange', 'lemon', 'lime', 'strawberry',
  'blueberry', 'raspberry', 'mango', 'avocado', 'grape',

  // Grains & Pasta
  'pasta spaghetti', 'pasta penne', 'pasta fettuccine', 'pasta linguine',
  'rice long grain', 'rice jasmine', 'rice basmati', 'risotto rice',
  'bread sourdough', 'bread wholemeal', 'bread white',
  'flour plain', 'flour self raising', 'oats rolled',
  'noodles egg', 'noodles rice', 'couscous', 'quinoa',

  // Canned & Preserved
  'tomatoes canned', 'chickpeas canned', 'lentils canned',
  'kidney beans', 'black beans', 'corn canned', 'coconut cream',
  'coconut milk', 'tuna in oil', 'sardines',

  // Condiments & Sauces
  'olive oil', 'vegetable oil', 'sesame oil',
  'soy sauce', 'fish sauce', 'oyster sauce', 'hoisin sauce',
  'tomato pasta sauce', 'bbq sauce', 'sweet chilli sauce',
  'stock chicken', 'stock beef', 'stock vegetable',
  'worcestershire sauce', 'hot sauce tabasco',

  // Herbs & Spices
  'garlic powder', 'onion powder', 'paprika smoked', 'cumin',
  'coriander ground', 'oregano dried', 'basil dried', 'thyme dried',
  'chilli flakes', 'black pepper',
];

// ── Woolworths API ────────────────────────────────────────────────────────────

const WW_HEADERS = {
  'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
  'Accept':     'application/json, text/plain, */*',
  'Referer':    'https://www.woolworths.com.au/',
};

function fetchWoolworths(searchTerm, pageSize = 36) {
  const url = `https://www.woolworths.com.au/apis/ui/Search/products?` +
    `searchTerm=${encodeURIComponent(searchTerm)}&pageSize=${pageSize}&pageNumber=1`;

  return new Promise((resolve, reject) => {
    https.get(url, { headers: WW_HEADERS }, (res) => {
      if (res.statusCode !== 200) {
        resolve(null); // Non-fatal — skip this term
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

// ── Extract products from Woolworths response ─────────────────────────────────

function extractProducts(data, searchTerm) {
  const products = [];

  const bundles = data?.Products ?? [];
  for (const bundle of bundles) {
    const items = bundle.Products ?? [bundle];
    for (const item of items) {
      if (!item.Name) continue;

      products.push({
        woolworths_id: String(item.Stockcode ?? ''),
        barcode:       item.BarCode ? String(item.BarCode) : null,
        name:          item.Name.trim(),
        brand:         item.Brand ? item.Brand.trim() : null,
        size:          item.PackageSize ?? null,
        price:         item.Price ?? null,
        category:      item.AdditionalAttributes?.categoryname ?? searchTerm,
      });
    }
  }

  return products;
}

// ── Process + save products ───────────────────────────────────────────────────

const CLAUDE_BATCH_SIZE = 10;

async function processAndSave(rawProducts) {
  if (rawProducts.length === 0) return;

  // Split into: already known (by barcode) vs new
  const newOnes  = [];
  const existing = [];

  for (const p of rawProducts) {
    const known = p.barcode ? db.getProductByBarcode(p.barcode) : null;
    if (known) {
      // Merge Woolworths ID onto existing record
      if (p.woolworths_id) {
        db.getDb().prepare(
          'UPDATE products SET woolworths_id = ?, updated_at = datetime(\'now\') WHERE id = ? AND woolworths_id IS NULL'
        ).run(p.woolworths_id, known.id);
      }
      existing.push(known);
    } else {
      // Also check by normalized name
      const norm   = normalizeName(p.name);
      const byName = db.getProductByNormalizedName(norm);
      if (byName) {
        existing.push(byName);
      } else {
        newOnes.push({ ...p, normalized_name: norm });
      }
    }
  }

  if (newOnes.length === 0) return;

  // Categorize new products with Claude in batches
  for (let i = 0; i < newOnes.length; i += CLAUDE_BATCH_SIZE) {
    const batch = newOnes.slice(i, i + CLAUDE_BATCH_SIZE);
    let categorizations;
    try {
      categorizations = await claudeCategorizeBatch(
        batch.map((p) => ({ name: p.name, category: p.category, price: p.price }))
      );
    } catch (err) {
      console.warn('[WWSeed] Claude batch failed, using fallback:', err.message);
      categorizations = batch.map((p) => basicFallback(p.name, p.category));
    }

    for (let j = 0; j < batch.length; j++) {
      const p    = batch[j];
      const cat  = categorizations[j] ?? basicFallback(p.name, p.category);

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
        processing_level:      ['unprocessed','minimally_processed','processed','ultra_processed'].includes(cat.processingLevel) ? cat.processingLevel : null,
        is_hero_ingredient:    cat.isHeroIngredient      ?? false,
        typical_use_case:      cat.typicalUseCase        ?? null,
        purchase_reasonability: cat.purchaseReasonability ?? null,
        satisfies_ingredients: cat.satisfiesIngredients  ?? [],
        source:                'woolworths',
        woolworths_id:         p.woolworths_id,
      });
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  const startTime = Date.now();
  console.log(`[WWSeed] Starting Woolworths seed (${SEARCH_TERMS.length} search terms)...`);

  const stats = { terms: 0, found: 0, newProducts: 0, errors: 0 };
  const seen  = new Set(); // deduplicate within this run

  for (const term of SEARCH_TERMS) {
    stats.terms++;
    process.stdout.write(`[WWSeed] (${stats.terms}/${SEARCH_TERMS.length}) "${term}" ... `);

    let data;
    try {
      data = await fetchWoolworths(term);
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
      const key = p.woolworths_id || p.name;
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
      console.error('[WWSeed] processAndSave error:', err.message);
      stats.errors++;
    }
    const after = db.countProducts();
    stats.newProducts += (after - before);

    // Rate limit: 2s between requests
    await sleep(2000);
  }

  const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  const dbStats = db.getStats();
  console.log('\n[WWSeed] ── Summary ──────────────────────────');
  console.log(`  Terms searched:  ${stats.terms}`);
  console.log(`  Products found:  ${stats.found}`);
  console.log(`  New in DB:       ${stats.newProducts}`);
  console.log(`  Errors:          ${stats.errors}`);
  console.log(`  DB total:        ${dbStats.products} products`);
  console.log(`  Time:            ${elapsed}s`);
  console.log('──────────────────────────────────────────────\n');

  db.closeDb();
}

main().catch((err) => {
  console.error('[WWSeed] Fatal:', err.message);
  process.exit(1);
});
