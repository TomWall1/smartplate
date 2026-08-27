#!/usr/bin/env node

/**
 * RecipeTinEats Scraper
 * Fetches recipe URLs from sitemaps, scrapes JSON-LD structured data,
 * normalises ingredients, and outputs to backend/data/recipe-library.json
 *
 * Usage: cd backend && node scripts/scrapeRecipes.js
 */

const axios = require('axios');
const cheerio = require('cheerio');
const fs = require('fs');
const path = require('path');

const { parseIngredient, parseDuration } = require('../lib/ingredientParser');

const OUTPUT_PATH = path.join(__dirname, '..', 'data', 'recipe-library.json');
const BASE_URL = 'https://www.recipetineats.com';
const SITEMAPS = [
  `${BASE_URL}/post-sitemap.xml`,
  `${BASE_URL}/post-sitemap2.xml`,
  `${BASE_URL}/post-sitemap3.xml`,
  `${BASE_URL}/post-sitemap4.xml`,
];

const REQUEST_DELAY_MS = 1500;

// Keywords to keep in URL slugs (recipe-relevant)
const INCLUDE_KEYWORDS = [
  'chicken', 'beef', 'lamb', 'pork', 'salmon', 'prawn', 'shrimp', 'fish',
  'seafood', 'pasta', 'noodle', 'vegetarian', 'vegan', 'stir-fry', 'curry',
  'stew', 'mince', 'sausage', 'rice', 'soup', 'salad', 'burger', 'wrap',
  'taco', 'pie', 'roast', 'bake', 'grill', 'fry', 'slow-cook', 'casserole',
  'meatball', 'schnitzel', 'steak', 'wing', 'thigh', 'breast', 'drumstick',
  'bolognese', 'lasagna', 'risotto', 'ramen', 'fried-rice', 'teriyaki',
  'honey', 'garlic', 'lemon', 'butter', 'cream', 'cheese', 'potato',
  'sweet-potato', 'broccoli', 'mushroom', 'spinach', 'tomato', 'bean',
  'chickpea', 'lentil', 'tofu', 'egg',
];

// Slugs to exclude (non-recipe content)
const EXCLUDE_KEYWORDS = [
  'blog', 'news', 'japan-travel', 'giveaway', 'cookbook', 'dozer',
  'good-to-know', 'how-to', 'series', 'non-recipe', 'life-update',
  'about', 'contact', 'privacy', 'disclaimer', 'faq', 'meal-prep-plan',
  'pantry-staples', 'equipment', 'guide',
];

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch all post URLs from sitemaps
 */
async function fetchSitemapUrls() {
  const allUrls = [];

  for (const sitemapUrl of SITEMAPS) {
    try {
      console.log(`Fetching sitemap: ${sitemapUrl}`);
      const { data } = await axios.get(sitemapUrl, {
        headers: { 'User-Agent': 'SmartPlate Recipe Scraper (educational project)' },
        timeout: 15000,
      });
      const $ = cheerio.load(data, { xmlMode: true });
      $('url > loc').each((_, el) => {
        allUrls.push($(el).text().trim());
      });
      await sleep(500);
    } catch (err) {
      console.warn(`Failed to fetch sitemap ${sitemapUrl}: ${err.message}`);
    }
  }

  console.log(`Found ${allUrls.length} total URLs in sitemaps`);
  return allUrls;
}

/**
 * Filter URLs by slug keywords
 */
function filterUrls(urls) {
  return urls.filter(url => {
    const slug = url.replace(BASE_URL, '').toLowerCase();

    // Exclude non-recipe content
    if (EXCLUDE_KEYWORDS.some(kw => slug.includes(kw))) return false;

    // Include if slug contains any recipe keyword
    return INCLUDE_KEYWORDS.some(kw => slug.includes(kw));
  });
}



/**
 * Extract Recipe JSON-LD from a page
 */
async function scrapeRecipe(url) {
  const { data } = await axios.get(url, {
    headers: {
      'User-Agent': 'SmartPlate Recipe Scraper (educational project)',
      'Accept': 'text/html',
    },
    timeout: 15000,
  });

  const $ = cheerio.load(data);
  let recipe = null;

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const json = JSON.parse($(el).html());

      // Handle @graph array (Yoast SEO format)
      if (json['@graph']) {
        const found = json['@graph'].find(item => item['@type'] === 'Recipe');
        if (found) recipe = found;
      } else if (json['@type'] === 'Recipe') {
        recipe = json;
      } else if (Array.isArray(json)) {
        const found = json.find(item => item['@type'] === 'Recipe');
        if (found) recipe = found;
      }
    } catch {}
  });

  return recipe;
}

/**
 * Flatten JSON-LD recipeInstructions into a list of step strings.
 *
 * WordPress Recipe Maker sites group steps inside HowToSection blocks
 * ("Cobbler topping:", "Butterscotch Sauce:"), so a flat pass over
 * recipeInstructions silently drops every step in a grouped recipe. Section
 * names are kept as their own heading line, mirroring how the source page
 * presents them.
 */
function flattenInstructions(list) {
  const steps = [];

  for (const step of Array.isArray(list) ? list : []) {
    if (typeof step === 'string') {
      steps.push(step);
      continue;
    }
    if (!step || typeof step !== 'object') continue;

    if (step['@type'] === 'HowToSection' || Array.isArray(step.itemListElement)) {
      const name = String(step.name || '').replace(/:\s*$/, '').trim();
      // RecipeTinEats prefixes a one-line "ABBREVIATED RECIPE" summary that
      // just restates the full method — skip it rather than duplicate.
      if (/^abbreviated/i.test(name)) continue;

      const inner = flattenInstructions(step.itemListElement);
      if (inner.length === 0) continue;
      if (name) steps.push(`${name}:`);
      steps.push(...inner);
      continue;
    }

    if (step.text) steps.push(step.text);
  }

  return steps;
}

/**
 * Transform raw JSON-LD recipe into our library format
 */
function transformRecipe(jsonLd, url, id) {
  const rawIngredients = Array.isArray(jsonLd.recipeIngredient) ? jsonLd.recipeIngredient : [];
  const ingredients = rawIngredients.map(parseIngredient);

  const steps = flattenInstructions(jsonLd.recipeInstructions);

  const nutrition = {};
  if (jsonLd.nutrition) {
    nutrition.calories = jsonLd.nutrition.calories || null;
    nutrition.protein = jsonLd.nutrition.proteinContent || null;
    nutrition.carbs = jsonLd.nutrition.carbohydrateContent || null;
    nutrition.fat = jsonLd.nutrition.fatContent || null;
  }

  // Build tags from category, cuisine, and timing
  const tags = [];
  const category = Array.isArray(jsonLd.recipeCategory)
    ? jsonLd.recipeCategory
    : jsonLd.recipeCategory ? [jsonLd.recipeCategory] : [];
  const cuisine = Array.isArray(jsonLd.recipeCuisine)
    ? jsonLd.recipeCuisine
    : jsonLd.recipeCuisine ? [jsonLd.recipeCuisine] : [];

  tags.push(...category.map(c => c.toLowerCase()));
  tags.push(...cuisine.map(c => c.toLowerCase()));

  const totalMinutes = parseDuration(jsonLd.totalTime);
  if (totalMinutes && totalMinutes <= 30) tags.push('quick');

  // Check for vegetarian/vegan indicators
  const allIngText = rawIngredients.join(' ').toLowerCase();
  const meats = ['chicken', 'beef', 'pork', 'lamb', 'salmon', 'fish', 'prawn', 'shrimp', 'bacon', 'mince', 'sausage', 'anchov'];
  if (!meats.some(m => allIngText.includes(m))) {
    tags.push('vegetarian');
    const dairy = ['cheese', 'cream', 'milk', 'butter', 'yoghurt', 'yogurt', 'egg'];
    if (!dairy.some(d => allIngText.includes(d))) {
      tags.push('vegan');
    }
  }

  const servingsRaw = Array.isArray(jsonLd.recipeYield) ? jsonLd.recipeYield[0] : jsonLd.recipeYield;
  const servings = parseInt(servingsRaw) || null;

  const image = Array.isArray(jsonLd.image) ? jsonLd.image[0] : (typeof jsonLd.image === 'object' ? jsonLd.image.url : jsonLd.image);

  return {
    id,
    title: jsonLd.name || 'Untitled',
    description: jsonLd.description || '',
    url,
    image: image || null,
    prepTime: parseDuration(jsonLd.prepTime),
    cookTime: parseDuration(jsonLd.cookTime),
    totalTime: totalMinutes,
    servings,
    category,
    cuisine,
    ingredients,
    steps,
    nutrition,
    tags: [...new Set(tags)],
  };
}

/**
 * Main scraper
 */
async function main() {
  console.log('=== RecipeTinEats Scraper ===\n');

  // Step 1: Fetch URLs from sitemaps
  const allUrls = await fetchSitemapUrls();
  if (allUrls.length === 0) {
    console.error('No URLs found in sitemaps. Exiting.');
    process.exit(1);
  }

  // Step 2: Filter to recipe-likely URLs
  const candidateUrls = filterUrls(allUrls);
  console.log(`Filtered to ${candidateUrls.length} candidate recipe URLs\n`);

  // Step 3: Scrape each page
  const recipes = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < candidateUrls.length; i++) {
    const url = candidateUrls[i];

    try {
      const jsonLd = await scrapeRecipe(url);

      if (!jsonLd) {
        skipped++;
        continue;
      }

      const recipe = transformRecipe(jsonLd, url, recipes.length + 1);
      recipes.push(recipe);

      if (recipes.length % 10 === 0) {
        console.log(`Progress: ${recipes.length} recipes scraped (${i + 1}/${candidateUrls.length} pages processed)`);
      }
    } catch (err) {
      errors++;
      if (errors <= 5) {
        console.warn(`Error scraping ${url}: ${err.message}`);
      }
    }

    // Rate limiting
    if (i < candidateUrls.length - 1) {
      await sleep(REQUEST_DELAY_MS);
    }
  }

  console.log(`\nScraping complete:`);
  console.log(`  Recipes found: ${recipes.length}`);
  console.log(`  Skipped (no recipe data): ${skipped}`);
  console.log(`  Errors: ${errors}`);

  // Step 4: Save output
  const output = {
    scrapedAt: new Date().toISOString(),
    source: 'recipetineats.com',
    recipeCount: recipes.length,
    recipes,
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), 'utf8');
  console.log(`\nSaved to ${OUTPUT_PATH}`);
}

// Exported so category-scoped scrapers (e.g. scrapeRecipeTinDesserts.js) can
// reuse the same JSON-LD extraction and ingredient parsing.
module.exports = { parseDuration, parseIngredient, scrapeRecipe, transformRecipe, sleep };

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
