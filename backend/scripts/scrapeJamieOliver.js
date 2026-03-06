#!/usr/bin/env node

/**
 * Jamie Oliver Scraper
 * Collects recipe URLs from category listing pages (each shows 36 recipes via
 * JSON-LD ItemList), scrapes each recipe page for JSON-LD @type:Recipe data,
 * falls back to HTML parsing when JSON-LD is absent, normalises ingredients,
 * and outputs to backend/data/jamie-oliver-recipes.json.
 *
 * Usage: cd backend && node scripts/scrapeJamieOliver.js
 */

const axios  = require('axios');
const cheerio = require('cheerio');
const fs     = require('fs');
const path   = require('path');

const OUTPUT_PATH     = path.join(__dirname, '..', 'data', 'jamie-oliver-recipes.json');
const BASE_URL        = 'https://www.jamieoliver.com';
const REQUEST_DELAY_MS = 1500;

// ── Category listing pages — each exposes 36 recipe URLs via JSON-LD ItemList ─
const CATEGORY_PAGES = [
  '/recipes/all',
  '/recipes/chicken/',
  '/recipes/beef/',
  '/recipes/lamb/',
  '/recipes/pork/',
  '/recipes/fish/',
  '/recipes/seafood/',
  '/recipes/pasta/',
  '/recipes/salad/',
  '/recipes/soup/',
  '/recipes/vegetarian/',
  '/recipes/vegan/',
  '/recipes/curry/',
  '/recipes/breakfast/',
  '/recipes/healthy/',
  '/recipes/quick-and-easy/',
  '/recipes/family-favourites/',
  '/recipes/side-dishes/',
  '/recipes/snacks/',
  '/recipes/baking/',
  '/recipes/dessert/',
  '/recipes/rice/',
  '/recipes/noodles/',
  '/recipes/eggs/',
];

// Same unit pattern as scrapeRecipes.js
const UNIT_PATTERN = /^(tbsp|tablespoons?|tsp|teaspoons?|cups?|g|kg|ml|l|litres?|liters?|oz|lb|lbs?|bunch|bunches|cloves?|pieces?|slices?|sprigs?|stalks?|heads?|cans?|tins?|packets?|pinch|handful|rashers?|fillets?|strips?)\b/i;

// HTTP client shared for all requests
const http = axios.create({
  headers: {
    'User-Agent': 'SmartPlate Recipe Scraper (educational project)',
    'Accept': 'text/html,application/xhtml+xml',
  },
  timeout: 20000,
});

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function parseDuration(iso) {
  if (!iso) return null;
  const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
  if (!m) return null;
  return parseInt(m[1] || 0) * 60 + parseInt(m[2] || 0);
}

/**
 * Parse a raw ingredient string → {name, quantity, unit, raw}
 * (Identical logic to scrapeRecipes.js)
 */
function parseIngredient(raw) {
  let text = raw.trim();

  // Remove parenthetical notes
  text = text.replace(/\([^)]*\)/g, '').trim();

  // Remove "/ alternative" patterns
  text = text.replace(/\s*\/\s*[^,]+/, '').trim();

  // Extract leading numeric quantity (handles "1 1/2", "1/2", decimals)
  let quantity = null;
  const qtyMatch = text.match(/^([\d]+\s+[\d]+\/[\d]+|[\d]+\/[\d]+|[\d]+\.?\d*)\s*/);
  if (qtyMatch) {
    quantity = qtyMatch[1].trim();
    text = text.slice(qtyMatch[0].length).trim();
  }

  // Handle unicode fractions
  const unicodeFractions = { '½': '1/2', '⅓': '1/3', '⅔': '2/3', '¼': '1/4', '¾': '3/4' };
  for (const [uf, rep] of Object.entries(unicodeFractions)) {
    if (text.startsWith(uf)) {
      quantity = quantity ? `${quantity} ${rep}` : rep;
      text = text.slice(1).trim();
    }
  }

  // Extract unit
  let unit = null;
  const unitMatch = text.match(UNIT_PATTERN);
  if (unitMatch) {
    unit = unitMatch[1].toLowerCase();
    text = text.slice(unitMatch[0].length).trim();
  }

  // Clean ingredient name
  let name = text
    .replace(/^[,\s\-–]+/, '')
    .replace(/[,\s\-–]+$/, '')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();

  name = name.replace(/^of\s+/, '');

  return { name, quantity, unit, raw };
}

/**
 * Parse Jamie Oliver's non-standard recipeInstructions.
 *
 * Jamie Oliver uses a single string with the pattern:
 *   "Title1\nContent1.Title2\nContent2.Title3\nContent3..."
 *
 * Where each step's content flows directly into the next step's title
 * with no separator (just a period + capital letter at the boundary).
 *
 * Strategy: split on \n, keep parts that contain periods (real content),
 * strip any trailing step-title text that got appended to the content.
 *
 * Also handles the standard array-of-HowToStep format.
 */
function parseInstructions(raw) {
  if (!raw) return [];

  // Standard format: array of HowToStep objects or strings
  if (Array.isArray(raw)) {
    return raw
      .map(s => (typeof s === 'string' ? s : s.text || s.name || ''))
      .map(s => s.trim())
      .filter(s => s.length > 10);
  }

  // Jamie Oliver string format
  const parts = raw.split('\n').map(s => s.trim()).filter(Boolean);
  const steps = [];

  for (const part of parts) {
    // Lines without periods are step titles (heading-only lines); skip them.
    if (!part.includes('.')) continue;

    // Strip trailing step-title text appended after the last sentence-ending period.
    // Pattern: ".CapitalisedPhrase" at end where the phrase has no period of its own.
    const cleaned = part.replace(/\.([A-Z][^.]+)$/, '.').trim();
    if (cleaned.length > 10) steps.push(cleaned);
  }

  // Last resort: return the whole string as a single step
  return steps.length > 0 ? steps : [raw];
}

/**
 * Build tag array from JSON-LD fields + ingredient analysis.
 */
function buildTags(jsonLd, rawIngredients) {
  const tags = [];
  const category = Array.isArray(jsonLd.recipeCategory)
    ? jsonLd.recipeCategory : jsonLd.recipeCategory ? [jsonLd.recipeCategory] : [];
  const cuisine  = Array.isArray(jsonLd.recipeCuisine)
    ? jsonLd.recipeCuisine  : jsonLd.recipeCuisine  ? [jsonLd.recipeCuisine]  : [];

  tags.push(...category.map(c => c.toLowerCase()));
  tags.push(...cuisine.map(c => c.toLowerCase()));

  const total = parseDuration(jsonLd.totalTime);
  if (total && total <= 30) tags.push('quick');

  const allIngText = rawIngredients.join(' ').toLowerCase();
  const meats = ['chicken','beef','pork','lamb','salmon','fish','prawn','shrimp','bacon','mince','sausage','anchov'];
  if (!meats.some(m => allIngText.includes(m))) {
    tags.push('vegetarian');
    const dairy = ['cheese','cream','milk','butter','yoghurt','yogurt','egg'];
    if (!dairy.some(d => allIngText.includes(d))) tags.push('vegan');
  }

  return [...new Set(tags)];
}

// ── URL discovery ─────────────────────────────────────────────────────────────

/**
 * Extract recipe URLs from a Jamie Oliver category listing page (JSON-LD ItemList).
 * Returns an array of absolute URLs.
 */
async function fetchCategoryUrls(categoryPath) {
  const url = `${BASE_URL}${categoryPath}`;
  try {
    const { data } = await http.get(url);
    const $ = cheerio.load(data);
    const urls = [];

    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        const list = json['@type'] === 'ItemList' ? json : null;
        if (list && Array.isArray(list.itemListElement)) {
          list.itemListElement.forEach(item => {
            const href = item.url || '';
            if (href.includes('/recipes/') && href !== `${BASE_URL}/recipes/all`) {
              urls.push(href);
            }
          });
        }
      } catch {}
    });

    // Also collect hrefs directly from <a> tags pointing to recipe pages
    $('a[href]').each((_, el) => {
      const href = $(el).attr('href') || '';
      const abs  = href.startsWith('http') ? href : `${BASE_URL}${href}`;
      if (/^https:\/\/www\.jamieoliver\.com\/recipes\/[^/]+\/[^/]+\/$/.test(abs)) {
        urls.push(abs);
      }
    });

    return [...new Set(urls)];
  } catch (err) {
    if (err.response?.status !== 404) {
      console.warn(`  [warn] ${categoryPath}: ${err.message}`);
    }
    return [];
  }
}

// ── Recipe scraping ───────────────────────────────────────────────────────────

/**
 * Scrape a single recipe page.
 * Returns a normalised recipe object or null if not enough data.
 */
async function scrapeRecipe(url, id) {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);

  // ── Try JSON-LD first ──────────────────────────────────────────────────────
  let jsonLd = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (jsonLd) return;
    try {
      const json = JSON.parse($(el).html());
      if (json['@graph']) {
        const found = json['@graph'].find(item =>
          item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe'))
        );
        if (found) { jsonLd = found; return; }
      }
      if (json['@type'] === 'Recipe') { jsonLd = json; return; }
      if (Array.isArray(json)) {
        const found = json.find(item => item['@type'] === 'Recipe');
        if (found) { jsonLd = found; return; }
      }
    } catch {}
  });

  if (jsonLd) {
    return transformFromJsonLd(jsonLd, url, id);
  }

  // ── HTML fallback ──────────────────────────────────────────────────────────
  return extractFromHtml($, url, id);
}

/**
 * Transform a JSON-LD Recipe object into our library format.
 */
function transformFromJsonLd(jsonLd, url, id) {
  const rawIngredients = Array.isArray(jsonLd.recipeIngredient)
    ? jsonLd.recipeIngredient : [];

  // Require at least 2 ingredients
  if (rawIngredients.length < 2) return null;

  const steps = parseInstructions(jsonLd.recipeInstructions);

  // Require at least 1 step
  if (steps.length === 0) return null;

  const ingredients = rawIngredients.map(parseIngredient);
  const tags = buildTags(jsonLd, rawIngredients);

  const servingsRaw = Array.isArray(jsonLd.recipeYield)
    ? jsonLd.recipeYield[0] : jsonLd.recipeYield;
  const servings = parseInt(servingsRaw) || null;

  const imageField = jsonLd.image;
  const image = Array.isArray(imageField)
    ? (typeof imageField[0] === 'string' ? imageField[0] : imageField[0]?.url)
    : (typeof imageField === 'object' ? imageField?.url : imageField);

  const prepTime  = parseDuration(jsonLd.prepTime);
  const cookTime  = parseDuration(jsonLd.cookTime);
  const totalTime = parseDuration(jsonLd.totalTime) || (prepTime && cookTime ? prepTime + cookTime : prepTime || cookTime);

  return {
    id,
    source: 'jamieoliver',
    title: (jsonLd.name || '').trim() || 'Untitled',
    description: (jsonLd.description || '').trim(),
    url,
    image: image || null,
    prepTime:  prepTime || null,
    cookTime:  cookTime || null,
    totalTime: totalTime || null,
    servings,
    category: Array.isArray(jsonLd.recipeCategory) ? jsonLd.recipeCategory
      : jsonLd.recipeCategory ? [jsonLd.recipeCategory] : [],
    cuisine: Array.isArray(jsonLd.recipeCuisine) ? jsonLd.recipeCuisine
      : jsonLd.recipeCuisine ? [jsonLd.recipeCuisine] : [],
    ingredients,
    steps,
    nutrition: {},
    tags,
  };
}

/**
 * HTML fallback: parse the page with cheerio when JSON-LD is absent.
 * Jamie Oliver recipe pages use accordion sections for ingredients and method.
 */
function extractFromHtml($, url, id) {
  const title = ($('h1').first().text() || '').trim();
  if (!title) return null;

  const description = (
    $('meta[name="description"]').attr('content') ||
    $('p').first().text()
  ).trim();

  // Ingredients: try common selectors
  const rawIngredients = [];
  $('[class*="ingredient"] li, [data-module="ingredient"] li, .recipe-ingredient, [class*="Ingredient"] li').each((_, el) => {
    const text = $(el).text().trim();
    if (text) rawIngredients.push(text);
  });

  if (rawIngredients.length < 2) return null;

  // Method steps
  const steps = [];
  $('[class*="method"] li, [class*="instruction"] li, [class*="step"] p, [class*="Method"] li').each((_, el) => {
    const text = $(el).text().trim();
    if (text && text.length > 10) steps.push(text);
  });

  if (steps.length === 0) return null;

  const ingredients = rawIngredients.map(parseIngredient);
  const allIngText  = rawIngredients.join(' ').toLowerCase();

  // Extract time from common patterns like "20 mins", "1 hour 30 mins"
  const pageText = $('body').text();
  const timeMatch = pageText.match(/(\d+)\s*(hr|hour|min)/i);
  const totalTime = timeMatch ? parseInt(timeMatch[1]) * (timeMatch[2].startsWith('h') ? 60 : 1) : null;

  // Servings
  const servingsMatch = pageText.match(/serves?\s+(\d+)/i);
  const servings = servingsMatch ? parseInt(servingsMatch[1]) : null;

  // Image
  const image = $('meta[property="og:image"]').attr('content') || null;

  // Tags
  const tags = [];
  const meats = ['chicken','beef','pork','lamb','salmon','fish','prawn','shrimp','bacon','mince','sausage'];
  if (!meats.some(m => allIngText.includes(m))) tags.push('vegetarian');
  if (totalTime && totalTime <= 30) tags.push('quick');

  return {
    id,
    source: 'jamieoliver',
    title,
    description,
    url,
    image,
    prepTime:  null,
    cookTime:  null,
    totalTime,
    servings,
    category: [],
    cuisine:  [],
    ingredients,
    steps,
    nutrition: {},
    tags: [...new Set(tags)],
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Jamie Oliver Scraper ===\n');

  // ── Step 1: Collect recipe URLs from category listing pages ───────────────
  console.log('Collecting recipe URLs from category pages…');
  const urlSet = new Set();

  for (const catPath of CATEGORY_PAGES) {
    const found = await fetchCategoryUrls(catPath);
    found.forEach(u => urlSet.add(u));
    console.log(`  ${catPath.padEnd(35)} → ${found.length} URLs  (total unique: ${urlSet.size})`);
    await sleep(REQUEST_DELAY_MS);
  }

  const allUrls = [...urlSet];
  console.log(`\nTotal unique recipe URLs: ${allUrls.length}\n`);

  if (allUrls.length === 0) {
    console.error('No recipe URLs found. Exiting.');
    process.exit(1);
  }

  // ── Step 2: Scrape each recipe page ──────────────────────────────────────
  console.log('Scraping individual recipe pages…\n');
  const recipes = [];
  let skipped = 0;
  let errors  = 0;

  for (let i = 0; i < allUrls.length; i++) {
    const url = allUrls[i];

    try {
      const recipe = await scrapeRecipe(url, recipes.length + 1);

      if (!recipe) {
        skipped++;
      } else {
        recipes.push(recipe);
        if (recipes.length % 10 === 0) {
          console.log(`  Progress: ${recipes.length} recipes saved  (${i + 1}/${allUrls.length} pages processed)`);
        }
      }
    } catch (err) {
      errors++;
      if (err.response?.status === 404) {
        skipped++;
      } else {
        if (errors <= 10) console.warn(`  [error] ${url}: ${err.message}`);
      }
    }

    if (i < allUrls.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  // ── Step 3: Save output ────────────────────────────────────────────────────
  console.log(`\nScraping complete:`);
  console.log(`  Recipes saved:  ${recipes.length}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Errors:         ${errors}`);

  const output = {
    scrapedAt:   new Date().toISOString(),
    source:      'jamieoliver.com',
    recipeCount: recipes.length,
    recipes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal error:', err.message);
  process.exit(1);
});
