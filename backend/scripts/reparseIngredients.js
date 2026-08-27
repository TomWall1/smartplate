#!/usr/bin/env node

/**
 * One-time backfill: re-parse every stored ingredient string.
 *
 * scrapeRecipes.js used to strip "/ alternative" measures BEFORE taking the
 * leading quantity, so any ingredient starting with a fraction ("1/4 tsp salt")
 * matched on the fraction's own slash and lost its entire name. That blanked
 * ~31% of ingredient names across the library and truncated others at a
 * mid-string slash.
 *
 * Every ingredient keeps its original `raw` string, so the damage is repairable
 * offline — no re-scraping needed. This re-runs the fixed parseIngredient over
 * `raw` and rewrites name/quantity/unit in place, leaving every other field
 * (isSubheading, isActive, subheadingGroup, ingredientTags) untouched.
 *
 * Because the enrichment tagger saw the blank names, any recipe whose
 * ingredients change here has stale ingredientTags — so its id is removed from
 * the enrichment progress file, queueing it for re-tagging on the next
 * enrichRecipes.js run.
 *
 * Usage: cd backend && node scripts/reparseIngredients.js [--dry-run]
 */

const fs   = require('fs');
const path = require('path');

const { parseIngredient } = require('../lib/ingredientParser');

const DATA_DIR = path.join(__dirname, '..', 'data');
const DRY_RUN  = process.argv.includes('--dry-run');

const LIBRARIES = [
  { base: 'recipe-library',         source: 'recipetineats', prog: 'enrich-progress-recipetineats.json' },
  { base: 'jamie-oliver-recipes',   source: 'jamieoliver',   prog: 'enrich-progress-jamieoliver.json'   },
  { base: 'donna-hay-recipes',      source: 'donnahay',      prog: 'enrich-progress-donnahay.json'      },
  { base: 'womensweekly-recipes',   source: 'womensweekly',  prog: 'enrich-progress-womensweekly.json'  },
  { base: 'juliegoodwin-recipes',   source: 'juliegoodwin',  prog: 'enrich-progress-juliegoodwin.json'  },
];

function load(file) {
  const p = path.join(DATA_DIR, file);
  return fs.existsSync(p) ? { p, data: JSON.parse(fs.readFileSync(p, 'utf8')) } : null;
}

/**
 * Re-parse one ingredient, preserving every field the parser doesn't own.
 * Subheadings ("For the sauce") are section labels, not ingredients — left alone.
 */
function reparse(ing, isSubheading) {
  if (isSubheading || !ing.raw) return { ing, changed: false };

  const fresh = parseIngredient(ing.raw);
  const changed =
    fresh.name !== ing.name ||
    fresh.quantity !== ing.quantity ||
    fresh.unit !== ing.unit;

  if (!changed) return { ing, changed: false };

  return {
    ing: { ...ing, name: fresh.name, quantity: fresh.quantity, unit: fresh.unit },
    changed: true,
  };
}

function main() {
  console.log('=== Ingredient Re-parse Backfill ===');
  if (DRY_RUN) console.log('(dry run — nothing will be written)\n');

  const totals = { recipes: 0, touched: 0, ingredients: 0, changed: 0, filled: 0 };

  for (const lib of LIBRARIES) {
    const src      = load(`${lib.base}.json`);
    const enriched = load(`${lib.base}-enriched.json`);

    if (!src) { console.log(`  skip ${lib.source} — no source file`); continue; }

    // The enriched file is the only one carrying isSubheading flags, and its
    // ingredient arrays are index-aligned with the source file.
    const flags = new Map();
    if (enriched) {
      for (const r of enriched.data.recipes) {
        flags.set(r.id, (r.ingredients || []).map(i => i.isSubheading === true));
      }
    }

    const staleIds = new Set();
    let ingredients = 0, changed = 0, filled = 0;

    for (const file of [src, enriched].filter(Boolean)) {
      for (const recipe of file.data.recipes) {
        const subheadings = flags.get(recipe.id) || [];
        let recipeChanged = false;

        recipe.ingredients = (recipe.ingredients || []).map((ing, idx) => {
          // Count each ingredient once (on the source-file pass) to keep stats honest
          if (file === src && !subheadings[idx] && ing.raw) ingredients++;

          const wasEmpty = !ing.name;
          const result = reparse(ing, subheadings[idx]);

          if (result.changed) {
            recipeChanged = true;
            if (file === src) {
              changed++;
              if (wasEmpty && result.ing.name) filled++;
            }
          }
          return result.ing;
        });

        if (recipeChanged) staleIds.add(recipe.id);
      }
    }

    totals.recipes     += src.data.recipes.length;
    totals.touched     += staleIds.size;
    totals.ingredients += ingredients;
    totals.changed     += changed;
    totals.filled      += filled;

    console.log(
      `  ${lib.source.padEnd(14)} ${String(src.data.recipes.length).padStart(5)} recipes | ` +
      `${String(changed).padStart(5)} names changed (${String(filled).padStart(4)} were blank) | ` +
      `${staleIds.size} recipes queued for re-tagging`
    );

    if (DRY_RUN) continue;

    for (const file of [src, enriched].filter(Boolean)) {
      fs.writeFileSync(file.p, JSON.stringify(file.data, null, 2), 'utf8');
    }

    // Drop stale ids from the enrichment progress file so the next
    // enrichRecipes.js run re-tags them against the corrected names.
    const progPath = path.join(DATA_DIR, lib.prog);
    if (staleIds.size > 0 && fs.existsSync(progPath)) {
      const done   = JSON.parse(fs.readFileSync(progPath, 'utf8'));
      const kept   = done.filter(id => !staleIds.has(id));
      fs.writeFileSync(progPath, JSON.stringify(kept), 'utf8');
      console.log(`    progress: ${done.length} → ${kept.length} done (${done.length - kept.length} invalidated)`);
    }
  }

  console.log(`\nTotals: ${totals.changed} of ${totals.ingredients} ingredient names changed ` +
              `(${totals.filled} recovered from blank) across ${totals.touched}/${totals.recipes} recipes`);
  if (!DRY_RUN) console.log('\nNext: node scripts/enrichRecipes.js');
}

if (require.main === module) main();
