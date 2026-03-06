#!/usr/bin/env node

/**
 * Donna Hay Scraper — Dinner Recipes
 *
 * Donna Hay has no JSON-LD or sitemap for recipes, so this scraper:
 *  1. Fetches /recipes/dinner (single page, 500+ links in static HTML)
 *  2. Extracts every /recipes/dinner/<slug> href
 *  3. For each recipe page, parses HTML with cheerio:
 *       - Title:       <h1>
 *       - Ingredients: content after <h2>INGREDIENTS</h2> → <ul><li>
 *       - Method:      content after <h2>METHOD</h2>      → <ol><li>
 *       - Image:       og:image meta tag
 *       - Servings:    regex "Serves X" anywhere in page text
 *       - Times:       regex "X mins"/"X hours" near prep/cook headings
 *  4. Skips pages with <2 ingredients or 0 steps
 *  5. Saves to backend/data/donna-hay-recipes.json
 *
 * Usage: cd backend && node scripts/scrapeDonnaHay.js
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const OUTPUT_PATH      = path.join(__dirname, '..', 'data', 'donna-hay-recipes.json');
const BASE_URL         = 'https://www.donnahay.com.au';
const DINNER_PAGE      = '/recipes/dinner';
const REQUEST_DELAY_MS = 1500;

const UNIT_PATTERN = /^(tbsp|tablespoons?|tsp|teaspoons?|cups?|g|kg|ml|l|litres?|liters?|oz|lb|lbs?|bunch|bunches|cloves?|pieces?|slices?|sprigs?|stalks?|heads?|cans?|tins?|packets?|pinch|handful|rashers?|fillets?|strips?)\b/i;

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

// ── Ingredient parser (identical logic to scrapeRecipes.js) ──────────────────

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

// ── Time extraction helper ────────────────────────────────────────────────────

/**
 * Try to pull a minute value from a text string near time-related keywords.
 * Handles "30 minutes", "1 hour", "1 hour 15 minutes", "45 mins" etc.
 */
function parseMinutes(text) {
  if (!text) return null;
  let total = 0;
  const hours = text.match(/(\d+)\s*(?:hours?|hrs?)/i);
  const mins  = text.match(/(\d+)\s*(?:minutes?|mins?)/i);
  if (hours) total += parseInt(hours[1]) * 60;
  if (mins)  total += parseInt(mins[1]);
  return total > 0 ? total : null;
}

// ── Tags builder ─────────────────────────────────────────────────────────────

function buildTags(rawIngredients, totalTime) {
  const tags = ['dinner'];
  const allIngText = rawIngredients.join(' ').toLowerCase();
  const meats = ['chicken', 'beef', 'pork', 'lamb', 'salmon', 'fish', 'prawn', 'shrimp', 'bacon', 'mince', 'sausage', 'anchov', 'tuna', 'veal', 'duck', 'turkey'];
  if (!meats.some(m => allIngText.includes(m))) {
    tags.push('vegetarian');
    const dairy = ['cheese', 'cream', 'milk', 'butter', 'yoghurt', 'yogurt', 'egg'];
    if (!dairy.some(d => allIngText.includes(d))) tags.push('vegan');
  }
  if (totalTime && totalTime <= 30) tags.push('quick');
  return [...new Set(tags)];
}

// ── URL discovery ─────────────────────────────────────────────────────────────

async function fetchDinnerUrls() {
  console.log(`Fetching dinner listing page…`);
  const { data } = await http.get(`${BASE_URL}${DINNER_PAGE}`);
  const $ = cheerio.load(data);

  const urls = new Set();

  $('a[href]').each((_, el) => {
    const href = $(el).attr('href') || '';
    // Match /recipes/dinner/<slug> — exclude the listing page itself and category-only paths
    if (/^\/recipes\/dinner\/[^/?#]+/.test(href)) {
      urls.add(`${BASE_URL}${href}`);
    }
  });

  return [...urls];
}

// ── Recipe scraper ────────────────────────────────────────────────────────────

async function scrapeRecipe(url, id) {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);

  // ── Title ──────────────────────────────────────────────────────────────────
  const title = ($('h1').first().text() || '').trim();
  if (!title) return null;

  // ── Image ──────────────────────────────────────────────────────────────────
  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('meta[name="og:image"]').attr('content') ||
    null;

  // ── Description ────────────────────────────────────────────────────────────
  const description = (
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  ).trim();

  // ── Ingredients ────────────────────────────────────────────────────────────
  // Find the h2/h3 whose text is "INGREDIENTS" (case-insensitive), then
  // walk the DOM to find the adjacent ul.
  const rawIngredients = [];

  const ingHeading = $('h2, h3, h4').filter((_, el) =>
    /^ingredients$/i.test($(el).text().trim())
  ).first();

  if (ingHeading.length) {
    // Try the next sibling element first, then look further if needed
    let el = ingHeading.next();
    while (el.length && !el.is('ul, ol')) {
      el = el.next();
    }
    if (el.is('ul, ol')) {
      el.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text) rawIngredients.push(text);
      });
    }
  }

  // Require at least 2 ingredients
  if (rawIngredients.length < 2) return null;

  // ── Method steps ───────────────────────────────────────────────────────────
  const steps = [];

  const methodHeading = $('h2, h3, h4').filter((_, el) =>
    /^method$/i.test($(el).text().trim())
  ).first();

  if (methodHeading.length) {
    let el = methodHeading.next();
    while (el.length && !el.is('ol, ul')) {
      el = el.next();
    }
    if (el.is('ol, ul')) {
      el.find('li').each((_, li) => {
        const text = $(li).text().trim();
        if (text && text.length > 10) steps.push(text);
      });
    }
  }

  if (steps.length === 0) return null;

  // ── Servings — extract "Serves X" from full page text ─────────────────────
  const bodyText = $('body').text();
  const servingsMatch = bodyText.match(/serves?\s+(\d+)/i);
  const servings = servingsMatch ? parseInt(servingsMatch[1]) : null;

  // ── Times — look for prep/cook patterns near matching text ────────────────
  // Donna Hay pages sometimes include time in a recipe intro or metadata row.
  // Try the page text for patterns like "prep 15 mins | cook 30 mins"
  let prepTime  = null;
  let cookTime  = null;
  let totalTime = null;

  const prepMatch = bodyText.match(/prep(?:\s*time)?[:\s]+([^|.\n]+)/i);
  const cookMatch = bodyText.match(/cook(?:ing)?(?:\s*time)?[:\s]+([^|.\n]+)/i);
  const totalMatch = bodyText.match(/total(?:\s*time)?[:\s]+([^|.\n]+)/i);

  if (prepMatch)  prepTime  = parseMinutes(prepMatch[1]);
  if (cookMatch)  cookTime  = parseMinutes(cookMatch[1]);
  if (totalMatch) totalTime = parseMinutes(totalMatch[1]);
  if (!totalTime && (prepTime || cookTime)) totalTime = (prepTime || 0) + (cookTime || 0);

  // ── Assemble ───────────────────────────────────────────────────────────────
  const ingredients = rawIngredients.map(parseIngredient);
  const tags        = buildTags(rawIngredients, totalTime);

  return {
    id,
    source: 'donnahay',
    title,
    description,
    url,
    image: image || null,
    prepTime:  prepTime  || null,
    cookTime:  cookTime  || null,
    totalTime: totalTime || null,
    servings,
    category: ['dinner'],
    cuisine:  [],
    ingredients,
    steps,
    nutrition: {},
    tags,
  };
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Donna Hay Dinner Scraper ===\n');

  // Step 1: discover URLs
  let allUrls;
  try {
    allUrls = await fetchDinnerUrls();
  } catch (err) {
    console.error(`Failed to fetch dinner listing: ${err.message}`);
    process.exit(1);
  }
  console.log(`Found ${allUrls.length} dinner recipe URLs\n`);

  if (allUrls.length === 0) {
    console.error('No URLs found. Exiting.');
    process.exit(1);
  }

  // Step 2: scrape each recipe
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

  // Step 3: save
  console.log(`\nScraping complete:`);
  console.log(`  Recipes saved:  ${recipes.length}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Errors:         ${errors}`);

  const output = {
    scrapedAt:   new Date().toISOString(),
    source:      'donnahay.com.au',
    recipeCount: recipes.length,
    recipes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
