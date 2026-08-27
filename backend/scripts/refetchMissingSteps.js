#!/usr/bin/env node

/**
 * One-time backfill: recover method steps that the JSON-LD parser dropped.
 *
 * transformRecipe() used to walk recipeInstructions with a flat loop, so any
 * recipe whose steps were grouped in HowToSection blocks ("Cobbler topping:",
 * "Butterscotch Sauce:") lost every step inside them — silently, leaving the
 * recipe with an empty method. Unlike the ingredient bug, nothing on disk holds
 * the original text, so these have to be fetched again.
 *
 * Only recipetineats is affected: the other scrapers read HTML <ol>/<li> lists
 * rather than JSON-LD, and none of their recipes have an empty method.
 *
 * Safe to re-run — it only touches recipes that still have no steps, and saves
 * incrementally so an interrupted run resumes where it left off.
 *
 * Usage: cd backend && node scripts/refetchMissingSteps.js
 */

const fs   = require('fs');
const path = require('path');

const { scrapeRecipe, transformRecipe, sleep } = require('./scrapeRecipes');

const DATA_DIR         = path.join(__dirname, '..', 'data');
const SRC_PATH         = path.join(DATA_DIR, 'recipe-library.json');
const ENRICHED_PATH    = path.join(DATA_DIR, 'recipe-library-enriched.json');
const REQUEST_DELAY_MS = 1500;
const SAVE_EVERY       = 25;

function load(p) {
  return { p, data: JSON.parse(fs.readFileSync(p, 'utf8')) };
}

function save(files) {
  for (const f of files) fs.writeFileSync(f.p, JSON.stringify(f.data, null, 2), 'utf8');
}

async function main() {
  console.log('=== Missing Steps Backfill (recipetineats) ===\n');

  const src      = load(SRC_PATH);
  const enriched = fs.existsSync(ENRICHED_PATH) ? load(ENRICHED_PATH) : null;
  const files    = [src, enriched].filter(Boolean);

  const targets = src.data.recipes.filter(r => !r.steps || r.steps.length === 0);
  console.log(`${targets.length} recipes have no method steps\n`);

  if (targets.length === 0) { console.log('Nothing to do.'); return; }

  // id → every copy of that recipe across src and enriched
  const copies = new Map();
  for (const f of files) {
    for (const r of f.data.recipes) {
      if (!copies.has(r.id)) copies.set(r.id, []);
      copies.get(r.id).push(r);
    }
  }

  let recovered = 0, stillEmpty = 0, errors = 0, stepsAdded = 0;

  for (let i = 0; i < targets.length; i++) {
    const target = targets[i];

    try {
      const jsonLd = await scrapeRecipe(target.url);

      if (!jsonLd) {
        stillEmpty++;
        console.warn(`  - no recipe data: ${target.url}`);
      } else {
        const fresh = transformRecipe(jsonLd, target.url, target.id);

        if (fresh.steps.length === 0) {
          stillEmpty++;
          console.warn(`  - still no steps: ${target.title}`);
        } else {
          for (const copy of copies.get(target.id) || []) copy.steps = fresh.steps;
          recovered++;
          stepsAdded += fresh.steps.length;
        }
      }
    } catch (err) {
      errors++;
      console.warn(`  ! ${target.title}: ${err.message}`);
    }

    if ((i + 1) % SAVE_EVERY === 0) {
      save(files);
      process.stdout.write(`\r  ${i + 1}/${targets.length} processed — ${recovered} recovered\n`);
    }

    if (i < targets.length - 1) await sleep(REQUEST_DELAY_MS);
  }

  save(files);

  console.log(`\nDone:`);
  console.log(`  Recovered:        ${recovered} recipes (${stepsAdded} steps)`);
  console.log(`  Genuinely empty:  ${stillEmpty}`);
  console.log(`  Errors:           ${errors}`);
  console.log(`\nSteps aren't part of the enrichment payload, so no re-tagging is needed.`);
}

if (require.main === module) {
  main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
}
