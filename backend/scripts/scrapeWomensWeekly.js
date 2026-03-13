#!/usr/bin/env node

/**
 * Women's Weekly Food Scraper — 5 Collections
 *
 * Collections scraped:
 *  1. One-pot meals
 *  2. Best slow-cooker recipes
 *  3. One-pan baked recipes
 *  4. Burger recipes
 *  5. Friday night dinners
 *
 * Strategy:
 *  1. Fetch each collection listing page (+ pagination) to collect recipe URLs
 *  2. Deduplicate URLs across collections
 *  3. Scrape each recipe page — try JSON-LD first, fall back to HTML
 *  4. Save to backend/data/womensweekly-recipes.json
 *
 * Usage: cd backend && node scripts/scrapeWomensWeekly.js
 */

const axios   = require('axios');
const cheerio = require('cheerio');
const fs      = require('fs');
const path    = require('path');

const OUTPUT_PATH      = path.join(__dirname, '..', 'data', 'womensweekly-recipes.json');
const BASE_URL         = 'https://www.womensweeklyfood.com.au';
const REQUEST_DELAY_MS = 1500;

const COLLECTIONS = [
  { name: 'one-pot-meals',       url: `${BASE_URL}/one-pot-meals/one-pot-meals-31807/`         },
  { name: 'slow-cooker',         url: `${BASE_URL}/slow-cooker-recipes/best-slow-cooker-recipes/` },
  { name: 'one-pan-baked',       url: `${BASE_URL}/dinner/one-pan-baked-recipes-31928/`         },
  { name: 'burgers',             url: `${BASE_URL}/quick-and-easy/burger-recipes-31317/`        },
  { name: 'friday-night-dinner', url: `${BASE_URL}/quick-and-easy/friday-night-dinners-32957/` },
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

// ── Ingredient parser (same logic as other scrapers) ─────────────────────────

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

// ── ISO 8601 duration parser (PT15M, PT1H30M) ────────────────────────────────

function parseDuration(iso) {
  if (!iso) return null;
  const hours = iso.match(/(\d+)H/);
  const mins  = iso.match(/(\d+)M/);
  let total = 0;
  if (hours) total += parseInt(hours[1]) * 60;
  if (mins)  total += parseInt(mins[1]);
  return total > 0 ? total : null;
}

// ── Plain-text time parser ("30 minutes", "1 hour 15 mins") ──────────────────

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

function buildTags(rawIngredients, categories, totalTime) {
  const tags = [...(categories || []).map(c => c.toLowerCase().trim()).filter(Boolean)];

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

// ── Decode HTML entities ──────────────────────────────────────────────────────

function decodeHtml(str) {
  if (!str) return str;
  return str
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&apos;/gi, "'")
    .replace(/&nbsp;/gi, ' ')
    .replace(/&#(\d+);/g, (_, n) => String.fromCharCode(parseInt(n, 10)))
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

// ── Extract recipe URLs from a collection listing page ───────────────────────

async function fetchCollectionUrls(collectionName, startUrl) {
  const urls = new Set();
  let pageUrl = startUrl;
  let pageNum = 1;

  while (pageUrl) {
    console.log(`  [${collectionName}] Fetching listing page ${pageNum}: ${pageUrl}`);
    let data;
    try {
      ({ data } = await http.get(pageUrl));
    } catch (err) {
      console.warn(`  [${collectionName}] Failed to fetch listing page: ${err.message}`);
      break;
    }

    const $ = cheerio.load(data);
    let foundOnPage = 0;

    // Women's Weekly recipe links: individual recipe pages have URLs like
    // /recipes/<category>/<slug>/ or /<category>/<slug>/
    // We collect all internal <a> links that look like recipe pages.
    $('a[href]').each((_, el) => {
      let href = $(el).attr('href') || '';

      // Normalise relative URLs
      if (href.startsWith('/')) href = `${BASE_URL}${href}`;

      // Only keep womensweeklyfood.com.au links that aren't the current collection listing
      if (!href.startsWith(BASE_URL)) return;
      if (href === startUrl || href === startUrl.replace(/\/$/, '')) return;

      // Skip obvious non-recipe pages
      if (/\/(tag|author|category|page|search|about|contact|advertise|privacy|terms|newsletter|sitemap)/i.test(href)) return;
      if (/\/#/.test(href)) return;

      // Recipe pages typically have a slug path (at least 2 segments after the domain)
      const relPath = href.replace(BASE_URL, '');
      const segments = relPath.replace(/^\/|\/$/g, '').split('/');
      if (segments.length < 2) return;

      // Skip if looks like another collection listing (has a number > 10000 at end)
      // Individual recipes don't have bare ID-only slugs
      if (/\d{4,}$/.test(segments[segments.length - 1]) && segments.length < 3) return;

      // Must not be the same as our collection URL
      if (href === startUrl || href.replace(/\/$/, '') === startUrl.replace(/\/$/, '')) return;

      if (!urls.has(href)) {
        urls.add(href);
        foundOnPage++;
      }
    });

    // Look for a "next page" link
    const nextLink = $('a[rel="next"], a.next, .pagination a:contains("Next"), .pagination a:contains("»"), nav.navigation a:contains("Next")').first();
    let nextUrl = null;
    if (nextLink.length) {
      const nextHref = nextLink.attr('href') || '';
      if (nextHref && nextHref !== pageUrl) {
        nextUrl = nextHref.startsWith('/') ? `${BASE_URL}${nextHref}` : nextHref;
      }
    }

    // Also check for page/2, page/3 etc. links in pagination
    if (!nextUrl) {
      $('a[href*="/page/"]').each((_, el) => {
        const href = $(el).attr('href') || '';
        const pageMatch = href.match(/\/page\/(\d+)/);
        if (pageMatch && parseInt(pageMatch[1]) === pageNum + 1) {
          nextUrl = href.startsWith('/') ? `${BASE_URL}${href}` : href;
        }
      });
    }

    console.log(`  [${collectionName}] Page ${pageNum}: ${foundOnPage} new recipe URLs`);

    // Stop paginating if no new recipes found on this page (avoid infinite loops)
    if (foundOnPage === 0) break;

    pageUrl = nextUrl;
    pageNum++;

    if (pageUrl) await sleep(REQUEST_DELAY_MS);
  }

  return [...urls];
}

// ── Scrape individual recipe via JSON-LD ──────────────────────────────────────

function extractFromJsonLd(jsonLd, url, id) {
  if (!jsonLd) return null;

  // Find the Recipe schema — sometimes it's nested in a @graph array
  let recipe = null;
  if (Array.isArray(jsonLd)) {
    recipe = jsonLd.find(item => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
  } else if (jsonLd['@type'] === 'Recipe' || (Array.isArray(jsonLd['@type']) && jsonLd['@type'].includes('Recipe'))) {
    recipe = jsonLd;
  } else if (jsonLd['@graph']) {
    recipe = jsonLd['@graph'].find(item => item['@type'] === 'Recipe' || (Array.isArray(item['@type']) && item['@type'].includes('Recipe')));
  }
  if (!recipe) return null;

  const title = decodeHtml((recipe.name || '').trim());
  if (!title) return null;

  // Parse ingredients
  const rawIngredients = (recipe.recipeIngredient || []).map(i => decodeHtml(i.trim())).filter(Boolean);
  if (rawIngredients.length < 2) return null;

  // Parse steps
  const steps = [];
  const instructions = recipe.recipeInstructions || [];
  if (Array.isArray(instructions)) {
    for (const step of instructions) {
      if (typeof step === 'string') {
        const cleaned = decodeHtml(step.trim());
        if (cleaned.length > 5) steps.push(cleaned);
      } else if (step.text) {
        const cleaned = decodeHtml(step.text.trim());
        if (cleaned.length > 5) steps.push(cleaned);
      } else if (step.itemListElement) {
        for (const sub of step.itemListElement) {
          const cleaned = decodeHtml((sub.text || sub.name || '').trim());
          if (cleaned.length > 5) steps.push(cleaned);
        }
      }
    }
  } else if (typeof instructions === 'string') {
    const cleaned = decodeHtml(instructions.trim());
    if (cleaned.length > 5) steps.push(cleaned);
  }
  if (steps.length === 0) return null;

  const prepTime  = parseDuration(recipe.prepTime);
  const cookTime  = parseDuration(recipe.cookTime);
  let   totalTime = parseDuration(recipe.totalTime);
  if (!totalTime && (prepTime || cookTime)) totalTime = (prepTime || 0) + (cookTime || 0);

  const servingsRaw = recipe.recipeYield;
  let servings = null;
  if (typeof servingsRaw === 'number') {
    servings = servingsRaw;
  } else if (typeof servingsRaw === 'string') {
    const m = servingsRaw.match(/\d+/);
    if (m) servings = parseInt(m[0]);
  } else if (Array.isArray(servingsRaw)) {
    const m = String(servingsRaw[0]).match(/\d+/);
    if (m) servings = parseInt(m[0]);
  }

  // Image
  let image = null;
  if (recipe.image) {
    if (typeof recipe.image === 'string') image = recipe.image;
    else if (recipe.image.url) image = recipe.image.url;
    else if (Array.isArray(recipe.image) && recipe.image[0]) {
      image = typeof recipe.image[0] === 'string' ? recipe.image[0] : recipe.image[0].url || null;
    }
  }

  // Categories
  const rawCategories = [
    ...(Array.isArray(recipe.recipeCategory) ? recipe.recipeCategory : [recipe.recipeCategory || '']),
  ].map(c => decodeHtml((c || '').trim())).filter(Boolean);

  const rawCuisines = [
    ...(Array.isArray(recipe.recipeCuisine) ? recipe.recipeCuisine : [recipe.recipeCuisine || '']),
  ].map(c => decodeHtml((c || '').trim())).filter(Boolean);

  // Nutrition
  const nutrition = {};
  if (recipe.nutrition) {
    if (recipe.nutrition.calories) nutrition.calories = String(recipe.nutrition.calories);
    if (recipe.nutrition.proteinContent) nutrition.protein = String(recipe.nutrition.proteinContent);
    if (recipe.nutrition.carbohydrateContent) nutrition.carbs = String(recipe.nutrition.carbohydrateContent);
    if (recipe.nutrition.fatContent) nutrition.fat = String(recipe.nutrition.fatContent);
  }

  const description = decodeHtml((recipe.description || '').trim());
  const ingredients = rawIngredients.map(parseIngredient);
  const tags        = buildTags(rawIngredients, rawCategories, totalTime);

  return {
    id,
    source: 'womensweekly',
    title,
    description,
    url,
    image: image || null,
    prepTime:  prepTime  || null,
    cookTime:  cookTime  || null,
    totalTime: totalTime || null,
    servings,
    category: rawCategories.length ? rawCategories : ['dinner'],
    cuisine:  rawCuisines,
    ingredients,
    steps,
    nutrition,
    tags,
  };
}

// ── HTML fallback scraper ─────────────────────────────────────────────────────

function extractFromHtml($, url, id) {
  const title = decodeHtml(($('h1').first().text() || '').trim());
  if (!title) return null;

  const image =
    $('meta[property="og:image"]').attr('content') ||
    $('picture img').first().attr('src') ||
    $('article img').first().attr('src') ||
    null;

  const description = decodeHtml((
    $('meta[property="og:description"]').attr('content') ||
    $('meta[name="description"]').attr('content') ||
    ''
  ).trim());

  // ── Ingredients ────────────────────────────────────────────────────────────
  const rawIngredients = [];

  // Try common ingredient container selectors
  const ingSelectors = [
    '[class*="ingredient"] li',
    '[class*="Ingredient"] li',
    '.recipe-ingredients li',
    '.ingredients li',
    '[data-testid*="ingredient"] li',
    '.ingredient-list li',
  ];
  for (const sel of ingSelectors) {
    $(sel).each((_, el) => {
      const text = decodeHtml($(el).text().trim());
      if (text && text.length > 1) rawIngredients.push(text);
    });
    if (rawIngredients.length > 0) break;
  }

  // Fallback: find h2/h3 with "ingredient" heading
  if (rawIngredients.length === 0) {
    const ingHeading = $('h2, h3, h4').filter((_, el) =>
      /ingredient/i.test($(el).text().trim())
    ).first();
    if (ingHeading.length) {
      let el = ingHeading.next();
      while (el.length && !el.is('ul, ol')) el = el.next();
      if (el.is('ul, ol')) {
        el.find('li').each((_, li) => {
          const text = decodeHtml($(li).text().trim());
          if (text) rawIngredients.push(text);
        });
      }
    }
  }

  if (rawIngredients.length < 2) return null;

  // ── Steps ──────────────────────────────────────────────────────────────────
  const steps = [];

  const stepSelectors = [
    '[class*="method"] li',
    '[class*="Method"] li',
    '[class*="instruction"] li',
    '[class*="Instruction"] li',
    '[class*="step"] li',
    '.recipe-method li',
    '.method li',
    '.directions li',
  ];
  for (const sel of stepSelectors) {
    $(sel).each((_, el) => {
      const text = decodeHtml($(el).text().trim());
      if (text && text.length > 10) steps.push(text);
    });
    if (steps.length > 0) break;
  }

  // Fallback: find method heading
  if (steps.length === 0) {
    const methodHeading = $('h2, h3, h4').filter((_, el) =>
      /method|instruction|direction|steps/i.test($(el).text().trim())
    ).first();
    if (methodHeading.length) {
      let el = methodHeading.next();
      while (el.length && !el.is('ol, ul')) el = el.next();
      if (el.is('ol, ul')) {
        el.find('li').each((_, li) => {
          const text = decodeHtml($(li).text().trim());
          if (text && text.length > 10) steps.push(text);
        });
      }
    }
  }

  if (steps.length === 0) return null;

  // ── Times + servings from body text ────────────────────────────────────────
  const bodyText = $('body').text();
  let prepTime  = null;
  let cookTime  = null;
  let totalTime = null;

  const prepMatch  = bodyText.match(/prep(?:\s*time)?[:\s]+([^|\n.]{3,30})/i);
  const cookMatch  = bodyText.match(/cook(?:ing)?(?:\s*time)?[:\s]+([^|\n.]{3,30})/i);
  const totalMatch = bodyText.match(/total(?:\s*time)?[:\s]+([^|\n.]{3,30})/i);

  if (prepMatch)  prepTime  = parseMinutes(prepMatch[1]);
  if (cookMatch)  cookTime  = parseMinutes(cookMatch[1]);
  if (totalMatch) totalTime = parseMinutes(totalMatch[1]);
  if (!totalTime && (prepTime || cookTime)) totalTime = (prepTime || 0) + (cookTime || 0);

  const servingsMatch = bodyText.match(/serves?\s+(\d+)/i);
  const servings = servingsMatch ? parseInt(servingsMatch[1]) : null;

  const ingredients = rawIngredients.map(parseIngredient);
  const tags        = buildTags(rawIngredients, [], totalTime);

  return {
    id,
    source: 'womensweekly',
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

// ── Scrape a single recipe page ───────────────────────────────────────────────

async function scrapeRecipe(url, id) {
  const { data } = await http.get(url);
  const $ = cheerio.load(data);

  // Try each JSON-LD block on the page
  let recipe = null;
  $('script[type="application/ld+json"]').each((_, el) => {
    if (recipe) return; // already found
    try {
      const parsed = JSON.parse($(el).html());
      recipe = extractFromJsonLd(parsed, url, id);
    } catch {
      // Malformed JSON — ignore and try next block
    }
  });

  // Fall back to HTML parsing
  if (!recipe) {
    recipe = extractFromHtml($, url, id);
  }

  return recipe;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('=== Women\'s Weekly Food Scraper ===\n');

  // Step 1: collect recipe URLs from all collection pages, with deduplication
  const seenUrls  = new Set();
  const allUrls   = [];
  const collectionStats = [];

  for (const collection of COLLECTIONS) {
    console.log(`\nScraping collection: ${collection.name}`);
    const urls = await fetchCollectionUrls(collection.name, collection.url);

    let newCount = 0;
    for (const url of urls) {
      if (!seenUrls.has(url)) {
        seenUrls.add(url);
        allUrls.push(url);
        newCount++;
      }
    }

    collectionStats.push({ name: collection.name, total: urls.length, new: newCount });
    console.log(`  → ${urls.length} URLs found, ${newCount} new (${urls.length - newCount} duplicates)`);

    await sleep(REQUEST_DELAY_MS);
  }

  console.log('\n── Collection summary ──────────────────────────────');
  for (const s of collectionStats) {
    console.log(`  ${s.name.padEnd(22)} ${String(s.total).padStart(3)} found, ${String(s.new).padStart(3)} new`);
  }
  console.log(`  Total unique recipe URLs: ${allUrls.length}\n`);

  if (allUrls.length === 0) {
    console.error('No recipe URLs found. The site structure may have changed. Exiting.');
    process.exit(1);
  }

  // Step 2: scrape each recipe page
  const recipes = [];
  let skipped   = 0;
  let errors    = 0;

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

  // Step 3: save output
  console.log(`\n── Scraping complete ───────────────────────────────`);
  console.log(`  Recipes saved:  ${recipes.length}`);
  console.log(`  Skipped:        ${skipped}`);
  console.log(`  Errors:         ${errors}`);

  const output = {
    scrapedAt:   new Date().toISOString(),
    source:      'womensweeklyfood.com.au',
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
