#!/usr/bin/env node

/**
 * Julie Goodwin Scraper
 *
 * Categories scraped:
 *   - /category/poultry/
 *   - /category/seafood/
 *   - /category/vegetables/
 *   - /category/meat/
 *
 * Strategy:
 *   1. Fetch each category listing page to collect recipe URLs
 *   2. Scrape each recipe page via HTML parsing (site uses Elementor, no JSON-LD Recipe schema)
 *   3. Save to backend/data/juliegoodwin-recipes.json
 *
 * Usage: cd backend && node scripts/scrapeJulieGoodwin.js
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const OUTPUT_PATH      = path.join(__dirname, '..', 'data', 'juliegoodwin-recipes.json');
const BASE_URL         = 'https://juliegoodwin.com.au';
const REQUEST_DELAY_MS = 1500;

const CATEGORIES = [
  { name: 'poultry',    url: `${BASE_URL}/category/poultry/`    },
  { name: 'seafood',    url: `${BASE_URL}/category/seafood/`    },
  { name: 'vegetables', url: `${BASE_URL}/category/vegetables/` },
  { name: 'meat',       url: `${BASE_URL}/category/meat/`       },
];

const UNIT_PATTERN = /^(tbsp|tablespoons?|tsp|teaspoons?|cups?|g|kg|ml|l|litres?|liters?|oz|lb|lbs?|bunch|bunches|cloves?|pieces?|slices?|sprigs?|stalks?|heads?|cans?|tins?|packets?|pinch|handful|rashers?|fillets?|strips?)\b/i;

const http = axios.create({
  headers: {
    'User-Agent': 'SmartPlate Recipe Scraper (educational project)',
    'Accept':     'text/html,application/xhtml+xml',
  },
  timeout: 20000,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── HTML entity decoder ───────────────────────────────────────────────────────

function decodeHtml(str) {
  return (str || '')
    .replace(/&amp;/g,  '&')
    .replace(/&lt;/g,   '<')
    .replace(/&gt;/g,   '>')
    .replace(/&quot;/g, '"')
    .replace(/&#039;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\u00a0/g, ' ')
    .trim();
}

// ── Ingredient parser ─────────────────────────────────────────────────────────

function parseIngredient(raw) {
  let text = raw.trim();
  if (!text || text.length < 2) return null;

  // Remove parenthetical notes
  text = text.replace(/\([^)]*\)/g, '').trim();

  // Handle unicode fractions
  const unicodeFractions = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4', '⅛': '1/8' };
  for (const [uf, rep] of Object.entries(unicodeFractions)) {
    text = text.replace(uf, rep);
  }

  let quantity = null;
  const qtyMatch = text.match(/^([\d]+\s+[\d]+\/[\d]+|[\d]+\/[\d]+|[\d]+\.?\d*)\s*/);
  if (qtyMatch) {
    quantity = qtyMatch[1].trim();
    text = text.slice(qtyMatch[0].length).trim();
  }

  let unit = null;
  const unitMatch = text.match(UNIT_PATTERN);
  if (unitMatch) {
    unit = unitMatch[0].trim();
    text = text.slice(unitMatch[0].length).trim();
  }

  // Strip leading "of" connector
  text = text.replace(/^of\s+/, '').trim();

  // Clean trailing commas, dashes
  text = text.replace(/[,\-–]+$/, '').trim();

  const name = text.toLowerCase().trim();

  return name ? { name, quantity, unit, original: raw.trim() } : null;
}

// ── Duration parser ───────────────────────────────────────────────────────────

function parseMinutes(str) {
  if (!str) return null;
  const m = str.match(/(\d+)/);
  return m ? parseInt(m[1]) : null;
}

// ── Tag builder ───────────────────────────────────────────────────────────────

const DIET_KEYWORDS = {
  vegetarian: ['vegetarian', 'vegan', 'plant-based', 'meat-free'],
  vegan: ['vegan', 'plant-based'],
  'gluten-free': ['gluten-free', 'gluten free'],
  'dairy-free': ['dairy-free', 'dairy free'],
};

const MEAL_TYPE_KEYWORDS = {
  breakfast: ['breakfast', 'brunch', 'egg', 'pancake', 'waffle'],
  lunch: ['lunch', 'sandwich', 'wrap', 'salad', 'light meal'],
  dinner: ['dinner', 'main', 'roast', 'curry', 'casserole', 'stew', 'bake'],
  snack: ['snack', 'dip', 'finger food', 'party food', 'entrée'],
};

function buildTags(ingredientNames, categoryName, totalTime) {
  const tags = [];
  const combined = [...ingredientNames, categoryName].join(' ').toLowerCase();

  // Category-based protein tags
  if (categoryName === 'poultry') tags.push('chicken');
  if (categoryName === 'seafood') tags.push('seafood');
  if (categoryName === 'vegetables') tags.push('vegetarian');
  if (categoryName === 'meat') {
    if (combined.includes('beef') || combined.includes('steak') || combined.includes('mince')) tags.push('beef');
    if (combined.includes('pork') || combined.includes('bacon') || combined.includes('ham')) tags.push('pork');
    if (combined.includes('lamb')) tags.push('lamb');
  }

  // Diet tags
  for (const [tag, keywords] of Object.entries(DIET_KEYWORDS)) {
    if (keywords.some(kw => combined.includes(kw))) tags.push(tag);
  }

  // Time-based
  if (totalTime && totalTime <= 20) tags.push('quick');
  if (totalTime && totalTime <= 30) tags.push('under 30 minutes');

  return [...new Set(tags)];
}

// ── Category page URL collector ───────────────────────────────────────────────

async function fetchCategoryUrls(categoryName, categoryUrl) {
  const urls = [];
  const seen = new Set();

  // Julie Goodwin category pages have no pagination (10 or fewer recipes each)
  // Try up to 3 pages just in case
  for (let page = 1; page <= 3; page++) {
    const pageUrl = page === 1 ? categoryUrl : `${categoryUrl}page/${page}/`;

    let data;
    try {
      const res = await http.get(pageUrl);
      data = res.data;
    } catch (err) {
      if (err.response?.status === 404) break; // No more pages
      throw err;
    }

    const $ = cheerio.load(data);
    let newOnPage = 0;

    $('article.post-wrapper').each((_, el) => {
      const link = $(el).find('a[href*="/recipe/"]').first().attr('href');
      if (link && !seen.has(link)) {
        seen.add(link);
        urls.push(link);
        newOnPage++;
      }
    });

    if (newOnPage === 0) break; // Nothing new, stop paginating
    await sleep(REQUEST_DELAY_MS);
  }

  return urls;
}

// ── Recipe page scraper ───────────────────────────────────────────────────────

function scrapeRecipePage($, url, categoryName) {
  const title = decodeHtml($('h1').first().text().trim());
  if (!title) return null;

  const description = decodeHtml(
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  );

  const image = $('meta[property="og:image"]').attr('content') || null;

  // Prep / Cook / Serves — stored as h4 + next p pairs
  let prepTime = null, cookTime = null, servings = null;
  $('h4').each((_, el) => {
    const label = $(el).text().trim().toLowerCase();
    const valText = $(el).next('p').text().trim();
    if (label.includes('preparation')) {
      prepTime = parseMinutes(valText);
    } else if (label.includes('cooking')) {
      cookTime = parseMinutes(valText);
    } else if (label.includes('serves') || label === 'serves:' || label === 'serve:') {
      servings = parseMinutes(valText); // parseMinutes just extracts first integer
    }
  });

  const totalTime = (prepTime || 0) + (cookTime || 0) || null;

  // Ingredients — find the h2 "Ingredients", then read sibling divs until h2 "Method"
  const ingH2 = $('h2').filter((_, el) => $(el).text().trim() === 'Ingredients');
  const rawIngredientLines = [];

  ingH2.parent().nextAll().each((_, el) => {
    // Stop when we hit the Method container
    if ($(el).find('h2').filter((_, h) => $(h).text().trim() === 'Method').length) return false;

    // Collect all text, split by newlines
    const blockText = $(el).text();
    blockText.split('\n')
      .map(l => decodeHtml(l.trim()))
      .filter(l => l.length > 2 && !l.match(/^(Ingredients|Method|Chicken|Beef|Pork|Lamb|Seafood|Sauce|Dressing|Marinade|Salad|Salsa|Gravy|Stock|Base|Topping|Filling)s?$/i))
      .forEach(l => rawIngredientLines.push(l));
  });

  if (rawIngredientLines.length < 2) return null;

  const ingredients = rawIngredientLines
    .map(parseIngredient)
    .filter(Boolean);

  if (ingredients.length < 2) return null;

  // Method — find h2 "Method", then read sibling container for ol li / p steps
  const methodH2 = $('h2').filter((_, el) => $(el).text().trim() === 'Method');
  const steps = [];

  methodH2.parent().nextAll().first().find('ol li, p').each((_, el) => {
    const t = decodeHtml($(el).text().trim());
    if (
      t.length > 10 &&
      !t.includes('Share this Recipe') &&
      !t.includes('Newsletter') &&
      !t.includes('Join My') &&
      !t.includes('More Recipes')
    ) {
      steps.push(t);
    }
  });

  if (steps.length === 0) return null;

  // Category from URL
  const category = categoryName === 'poultry'    ? ['Poultry']
                 : categoryName === 'seafood'     ? ['Seafood']
                 : categoryName === 'vegetables'  ? ['Vegetables']
                 : categoryName === 'meat'        ? ['Meat']
                 : ['Dinner'];

  const ingredientNames = ingredients.map(i => i.name);
  const tags = buildTags(ingredientNames, categoryName, totalTime);

  return {
    source:      'juliegoodwin',
    title,
    description,
    url,
    image,
    prepTime:    prepTime  || null,
    cookTime:    cookTime  || null,
    totalTime:   totalTime || null,
    servings,
    category,
    cuisine:     [],
    ingredients,
    steps,
    nutrition:   {},
    tags,
  };
}

// ── Scrape single URL with retry ──────────────────────────────────────────────

async function scrapeWithRetry(url, categoryName, attempts = 3) {
  for (let i = 0; i < attempts; i++) {
    try {
      const { data } = await http.get(url);
      const $ = cheerio.load(data);
      return scrapeRecipePage($, url, categoryName);
    } catch (err) {
      if (i === attempts - 1) throw err;
      await sleep(2000 * (i + 1));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Julie Goodwin Scraper ===\n');

  // Step 1: Collect recipe URLs from category pages
  const seenUrls   = new Set();
  const urlsByCategory = [];

  for (const cat of CATEGORIES) {
    console.log(`Fetching category: ${cat.name}`);
    const urls = await fetchCategoryUrls(cat.name, cat.url);

    let newCount = 0;
    const catUrls = [];
    for (const url of urls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        catUrls.push(url);
        newCount++;
      }
    }
    urlsByCategory.push({ ...cat, urls: catUrls });
    console.log(`  → ${newCount} recipes found`);
  }

  const totalUrls = urlsByCategory.reduce((n, c) => n + c.urls.length, 0);
  console.log(`\nTotal unique recipe URLs: ${totalUrls}\n`);

  if (totalUrls === 0) {
    console.error('No recipe URLs found. Site structure may have changed. Exiting.');
    process.exit(1);
  }

  // Step 2: Scrape each recipe
  const recipes = [];
  let skipped = 0;
  let errors  = 0;

  for (const cat of urlsByCategory) {
    console.log(`\nScraping ${cat.name} (${cat.urls.length} recipes):`);

    for (const url of cat.urls) {
      try {
        const recipe = await scrapeWithRetry(url, cat.name);
        if (!recipe) {
          console.log(`  ⚠ Skip (no content): ${url.split('/').slice(-2, -1)[0]}`);
          skipped++;
        } else {
          recipes.push(recipe);
          console.log(`  ✓ ${recipe.title}`);
        }
      } catch (err) {
        console.warn(`  ✗ Error: ${url}: ${err.message}`);
        errors++;
      }

      await sleep(REQUEST_DELAY_MS);
    }
  }

  // Step 3: Assign IDs and save
  const output = {
    scrapedAt:   new Date().toISOString(),
    source:      'juliegoodwin.com.au',
    recipeCount: recipes.length,
    recipes:     recipes.map((r, i) => ({ id: i + 1, ...r })),
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');

  console.log('\n── Summary ─────────────────────────────────────────');
  console.log(`  Recipes saved:  ${recipes.length}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Errors:         ${errors}`);
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
