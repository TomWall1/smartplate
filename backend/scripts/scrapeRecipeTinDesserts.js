#!/usr/bin/env node

/**
 * RecipeTinEats Dessert Category Scraper
 *
 * The main sitemap scraper (scrapeRecipes.js) filters URLs by a savoury
 * INCLUDE_KEYWORDS list, so dessert posts never made it into the library.
 * This script walks a RecipeTinEats *category* archive instead:
 *
 *  1. Reads the category page(s), following rel=next pagination
 *  2. Extracts every recipe post link from the archive listing
 *  3. Skips URLs already present in recipe-library.json
 *  4. Scrapes JSON-LD and transforms it with the shared scrapeRecipes.js helpers
 *  5. Appends the new recipes to recipe-library.json with continuing IDs
 *
 * Enrichment metadata is NOT generated here — run scripts/enrichRecipes.js
 * afterwards (it picks up any recipe missing from the enriched file).
 *
 * Usage: cd backend && node scripts/scrapeRecipeTinDesserts.js [category-slug ...]
 * Default category: puddings-cosy-desserts
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const { scrapeRecipe, transformRecipe, sleep } = require('./scrapeRecipes');

const LIBRARY_PATH     = path.join(__dirname, '..', 'data', 'recipe-library.json');
const BASE_URL         = 'https://www.recipetineats.com';
const REQUEST_DELAY_MS = 1500;
const MAX_PAGES        = 20;

const DEFAULT_CATEGORIES = ['puddings-cosy-desserts'];

const http = axios.create({
  headers: {
    'User-Agent': 'SmartPlate Recipe Scraper (educational project)',
    'Accept': 'text/html,application/xhtml+xml',
  },
  timeout: 20000,
});

// Archive pages link to plenty of non-recipe posts (nav, cookbooks, policy
// pages, the dog). Only listing entries count, and these slugs never do.
const NON_RECIPE_SLUGS = new Set([
  '', 'recipes', 'categories', 'cookbooks', 'contact', 'recipetin-meals',
  'nagi-recipetin-eats', 'free-recipe-books', 'tonight-cookbook',
  'dinner-cookbook', 'dozer-the-golden-retriever-dog',
  'policy-use-of-recipes-images',
]);

// Comparison form only — the library stores the canonical trailing-slash URL
function normaliseUrl(url) {
  return String(url || '').split('?')[0].split('#')[0].replace(/\/+$/, '');
}

function canonicalUrl(url) {
  return normaliseUrl(url) + '/';
}

/**
 * Collect recipe post URLs from one category archive, following pagination.
 */
async function fetchCategoryUrls(slug) {
  const urls = [];
  const seen = new Set();
  let pageUrl = `${BASE_URL}/category/${slug}/`;

  for (let page = 1; page <= MAX_PAGES && pageUrl; page++) {
    console.log(`Fetching ${pageUrl}`);
    const { data } = await http.get(pageUrl);
    const $ = cheerio.load(data);

    // Listing entries live inside <article> / post headings, not the site nav
    $('article a[href], .post a[href], h2 a[href], .entry-title a[href]').each((_, el) => {
      const href = normaliseUrl($(el).attr('href'));
      if (!href.startsWith(BASE_URL)) return;
      if (href.includes('/category/')) return;

      const postSlug = href.slice(BASE_URL.length).replace(/^\//, '');
      if (postSlug.includes('/')) return;              // only top-level post URLs
      if (NON_RECIPE_SLUGS.has(postSlug)) return;
      if (seen.has(href)) return;

      seen.add(href);
      urls.push(href);
    });

    const next = $('link[rel="next"]').attr('href') || $('a.next').attr('href');
    pageUrl = next ? normaliseUrl(next) + '/' : null;
    if (pageUrl) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`  ${slug}: found ${urls.length} recipe URLs`);
  return urls;
}

async function main() {
  const categories = process.argv.slice(2).length
    ? process.argv.slice(2)
    : DEFAULT_CATEGORIES;

  console.log('=== RecipeTinEats Dessert Category Scraper ===');
  console.log(`Categories: ${categories.join(', ')}\n`);

  const library = JSON.parse(fs.readFileSync(LIBRARY_PATH, 'utf8'));
  const existing = new Set(library.recipes.map(r => normaliseUrl(r.url)));
  console.log(`Library currently holds ${library.recipes.length} recipes\n`);

  // Step 1: gather candidate URLs across all requested categories
  const candidates = [];
  const seen = new Set();
  for (const slug of categories) {
    try {
      for (const url of await fetchCategoryUrls(slug)) {
        if (!seen.has(url)) { seen.add(url); candidates.push(url); }
      }
    } catch (err) {
      console.warn(`  Failed to read category "${slug}": ${err.message}`);
    }
    await sleep(REQUEST_DELAY_MS);
  }

  // Step 2: drop anything already in the library
  const toScrape = candidates.filter(url => !existing.has(url));
  const alreadyHave = candidates.length - toScrape.length;
  console.log(`\n${candidates.length} candidates — ${alreadyHave} already in library, ${toScrape.length} to scrape\n`);

  if (toScrape.length === 0) {
    console.log('Nothing new to add.');
    return;
  }

  // Step 3: scrape each new recipe
  let nextId = library.recipes.reduce((max, r) => Math.max(max, r.id || 0), 0) + 1;
  const added = [];
  let skipped = 0;
  let errors  = 0;

  for (let i = 0; i < toScrape.length; i++) {
    const url = toScrape[i];
    try {
      const jsonLd = await scrapeRecipe(url);
      if (!jsonLd) {
        console.warn(`  - no recipe data: ${url}`);
        skipped++;
      } else {
        const recipe = transformRecipe(jsonLd, canonicalUrl(url), nextId++);
        added.push(recipe);
        console.log(`  + ${recipe.title}`);
      }
    } catch (err) {
      errors++;
      console.warn(`  ! error scraping ${url}: ${err.message}`);
    }

    if (i < toScrape.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  console.log(`\nScraped ${added.length} new recipes (${skipped} without recipe data, ${errors} errors)`);

  if (added.length === 0) return;

  // Step 4: append and save
  library.recipes.push(...added);
  library.recipeCount = library.recipes.length;
  library.scrapedAt   = new Date().toISOString();

  fs.writeFileSync(LIBRARY_PATH, JSON.stringify(library, null, 2), 'utf8');
  console.log(`Library now holds ${library.recipes.length} recipes — saved to ${LIBRARY_PATH}`);
  console.log('\nNext: node scripts/fixHtmlEntities.js');
  console.log('      node scripts/enrichRecipes.js --only=recipe-library.json');
}

if (require.main === module) {
  main().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
  });
}
