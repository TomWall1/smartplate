#!/usr/bin/env node
/**
 * enrichRecipes.js
 *
 * Enriches all recipe library JSON files with structured metadata tags using Claude Haiku.
 * Runs 20 recipes per API call in parallel batches with 500ms inter-batch delay.
 *
 * Usage:  cd backend && node scripts/enrichRecipes.js
 * Cost:   ~$1–3 for all 2,176 recipes using claude-haiku-4-5-20251001
 *
 * Progress is saved every 100 recipes to backend/data/enrich-progress-{source}.json
 * so the script can resume from where it left off if interrupted.
 *
 * Output: backend/data/*-enriched.json (originals are NOT modified)
 */

require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');

const LIBRARIES = [
  {
    src:  path.join(DATA_DIR, 'recipe-library.json'),
    dest: path.join(DATA_DIR, 'recipe-library-enriched.json'),
    prog: path.join(DATA_DIR, 'enrich-progress-recipetineats.json'),
  },
  {
    src:  path.join(DATA_DIR, 'jamie-oliver-recipes.json'),
    dest: path.join(DATA_DIR, 'jamie-oliver-recipes-enriched.json'),
    prog: path.join(DATA_DIR, 'enrich-progress-jamieoliver.json'),
  },
  {
    src:  path.join(DATA_DIR, 'donna-hay-recipes.json'),
    dest: path.join(DATA_DIR, 'donna-hay-recipes-enriched.json'),
    prog: path.join(DATA_DIR, 'enrich-progress-donnahay.json'),
  },
  {
    src:  path.join(DATA_DIR, 'juliegoodwin-recipes.json'),
    dest: path.join(DATA_DIR, 'juliegoodwin-recipes-enriched.json'),
    prog: path.join(DATA_DIR, 'enrich-progress-juliegoodwin.json'),
  },
  {
    src:  path.join(DATA_DIR, 'womensweekly-recipes.json'),
    dest: path.join(DATA_DIR, 'womensweekly-recipes-enriched.json'),
    prog: path.join(DATA_DIR, 'enrich-progress-womensweekly.json'),
  },
];

const BATCH_SIZE  = 8;
const DELAY_MS    = 500;
const SAVE_EVERY  = 100;
const MODEL       = 'claude-haiku-4-5-20251001';

// ── Subheading detection ──────────────────────────────────────────────────────

function looksLikeSubheading(name) {
  if (!name || typeof name !== 'string') return false;
  const t = name.trim();
  return (
    /^for the /i.test(t) ||
    /^for /i.test(t) ||
    /^[A-Z][A-Z\s&]+:?$/.test(t) ||    // all-caps like "MEATBALLS" or "MEATBALLS:"
    /^\d+\.\s*[A-Z]/.test(t)           // "1. SAUCE"
  );
}

/**
 * Stamp each ingredient with isSubheading, isActive, subheadingGroup.
 * Assigns subsequent normal ingredients to the most recent subheading group.
 */
function stampIngredientFlags(ingredients) {
  let currentGroup = null;
  return (ingredients || []).map(ing => {
    if (looksLikeSubheading(ing.name)) {
      // Extract a short group key from the heading text
      currentGroup = ing.name
        .replace(/^for the /i, '')
        .replace(/^for /i, '')
        .replace(/:$/, '')
        .trim()
        .toLowerCase()
        .replace(/\s+/g, '_');
      return { ...ing, isSubheading: true, isActive: true, subheadingGroup: null };
    }
    return {
      ...ing,
      isSubheading:    false,
      isActive:        ing.isActive !== false, // preserve existing false if set
      subheadingGroup: currentGroup,
    };
  });
}

// ── Valid value sets for the prompt ──────────────────────────────────────────

const SYSTEM_PROMPT = `You are a recipe metadata tagger for an Australian meal planning app.
For each recipe in the input array, output a JSON object with exactly these fields:

"id": same integer as input
"metadata": {
  "cuisineType": string[] — from: ["Australian","Italian","Asian","Chinese","Japanese","Thai","Indian","Mexican","Mediterranean","Middle Eastern","Greek","French","American","British","Vietnamese","Turkish","Moroccan","Spanish","Korean","Other"]
  "mealOccasion": string[] — from: ["breakfast","lunch","dinner","snack","dessert","entertaining","lunchbox"]
  "dietarySuitability": string[] — only include if recipe TRULY qualifies: ["vegetarian","vegan","gluten-free","dairy-free","nut-free","low-carb","high-protein","paleo"]
  "prepTime": number in minutes or null (use existing if given, otherwise estimate)
  "cookTime": number in minutes or null
  "totalTime": number in minutes or null (prepTime + cookTime)
  "skillLevel": "beginner"|"intermediate"|"advanced"
  "prepComplexity": "simple"|"moderate"|"complex"
  "cookingMethod": string[] — from: ["stovetop","oven","grill","barbecue","slow-cooker","no-cook","air-fryer","microwave","deep-fry","steam","pressure-cooker","roast","bake"]
  "flavorProfile": string[] — from: ["savory","sweet","spicy","tangy","mild","rich","fresh","smoky","umami","creamy","herby","nutty"]
  "primaryProtein": "chicken"|"beef"|"lamb"|"pork"|"seafood"|"fish"|"eggs"|"tofu"|"legumes"|"dairy"|null
  "servings": number or null
  "estimatedCost": "low"|"medium"|"high"
}
"ingredientTags": array — one object per ingredient, matching by 0-based index:
  {
    "idx": 0-based index matching input ingredients array
    "category": "meat"|"seafood"|"dairy"|"eggs"|"vegetables"|"fruit"|"grains"|"legumes"|"nuts_seeds"|"herbs_spices"|"condiments"|"oils_fats"|"baked_goods"|"canned_preserved"|"frozen"|"other"
    "proteinType": "chicken"|"beef"|"lamb"|"pork"|"seafood"|"fish"|"eggs"|"tofu"|null
    "form": "fresh"|"frozen"|"canned"|"dried"|"processed"|"pantry"
    "essential": boolean — false for garnishes like "to taste", optional herbs, "extra to serve"
    "substitutable": boolean — true if can easily swap for another ingredient
  }

Rules:
- dietarySuitability must be accurate; vegan = zero animal products
- primaryProtein = null for vegetarian/vegan recipes without protein substitutes
- estimatedCost: low = <$10/serve, medium = $10-20/serve, high = >$20/serve
- essential = false for: salt, pepper, fresh herbs as garnish, "to taste" items, decorative toppings
- Respond with ONLY a JSON array, no markdown, no explanation`;

// ── Haiku call (20 recipes) ───────────────────────────────────────────────────

async function tagBatch(client, recipes) {
  // Slim recipe payload — strip steps/images to reduce tokens.
  // Subheadings are excluded from tagging (idx positions are preserved for non-subheadings only).
  const input = recipes.map(r => ({
    id: r._enrichId,
    title: r.title,
    description: r.description || '',
    prepTime: r.prepTime ?? null,
    cookTime: r.cookTime ?? null,
    servings: r.servings ?? null,
    category: r.category ?? [],
    cuisine: r.cuisine ?? [],
    ingredients: (r.ingredients || [])
      .map((ing, idx) => ({ idx, ing }))
      .filter(({ ing }) => !ing.isSubheading)   // exclude section headers from tagging
      .map(({ idx, ing }) => ({
        idx,
        name: ing.name,
        quantity: ing.quantity ?? '',
        unit: ing.unit ?? '',
      })),
  }));

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 8192,
    system:     SYSTEM_PROMPT,
    messages: [{
      role:    'user',
      content: `Tag these ${input.length} recipes:\n${JSON.stringify(input)}`,
    }],
  });

  const raw = response.content[0].text.trim();

  // Strip markdown fences if present
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();

  return JSON.parse(jsonText);
}

// ── Merge tags back into recipe ───────────────────────────────────────────────

function applyTags(recipe, tagResult) {
  if (!tagResult) return recipe;

  const updated = { ...recipe, metadata: tagResult.metadata || {} };

  // Apply ingredient tags by index
  if (Array.isArray(tagResult.ingredientTags) && Array.isArray(updated.ingredients)) {
    updated.ingredients = updated.ingredients.map((ing, idx) => {
      const tag = tagResult.ingredientTags.find(t => t.idx === idx);
      if (!tag) return ing;
      const { idx: _i, ...tagData } = tag;
      return { ...ing, ingredientTags: tagData };
    });
  }

  return updated;
}

// ── Spot-check validation ─────────────────────────────────────────────────────

function validateRecipe(r) {
  const m = r.metadata;
  if (!m) return ['missing metadata'];
  const issues = [];
  if (!Array.isArray(m.cuisineType))       issues.push('cuisineType not array');
  if (!Array.isArray(m.mealOccasion))      issues.push('mealOccasion not array');
  if (!Array.isArray(m.cookingMethod))     issues.push('cookingMethod not array');
  if (!['beginner','intermediate','advanced'].includes(m.skillLevel)) issues.push(`invalid skillLevel: ${m.skillLevel}`);
  if (!['simple','moderate','complex'].includes(m.prepComplexity))   issues.push(`invalid prepComplexity: ${m.prepComplexity}`);
  if (!['low','medium','high'].includes(m.estimatedCost))            issues.push(`invalid estimatedCost: ${m.estimatedCost}`);
  if (m.prepTime && (m.prepTime < 1 || m.prepTime > 600))           issues.push(`suspicious prepTime: ${m.prepTime}`);
  if (m.cookTime && (m.cookTime < 1 || m.cookTime > 600))           issues.push(`suspicious cookTime: ${m.cookTime}`);
  return issues;
}

// ── Progress helpers ──────────────────────────────────────────────────────────

function loadProgress(progPath) {
  try { return new Set(JSON.parse(fs.readFileSync(progPath, 'utf8'))); }
  catch { return new Set(); }
}

function saveProgress(progPath, doneIds) {
  fs.writeFileSync(progPath, JSON.stringify([...doneIds]), 'utf8');
}

// ── Process a single library file ────────────────────────────────────────────

async function processLibrary(client, lib, globalStats) {
  if (!fs.existsSync(lib.src)) {
    console.log(`  Skipping (not found): ${lib.src}`);
    return;
  }

  const raw  = JSON.parse(fs.readFileSync(lib.src, 'utf8'));
  const done = loadProgress(lib.prog);

  // Start from existing enriched file if it exists
  let enriched;
  try {
    enriched = JSON.parse(fs.readFileSync(lib.dest, 'utf8'));
  } catch {
    enriched = { ...raw, recipes: raw.recipes.map(r => ({ ...r })) };
  }

  // Stamp subheading / isActive / subheadingGroup flags on all ingredients (idempotent)
  enriched.recipes = enriched.recipes.map(r => ({
    ...r,
    ingredients: stampIngredientFlags(r.ingredients),
  }));

  const pending = enriched.recipes.filter(r => !done.has(r.id));
  console.log(`  ${path.basename(lib.src)}: ${enriched.recipes.length} total, ${done.size} done, ${pending.length} to tag`);

  if (pending.length === 0) {
    console.log('  Already complete — skipping.');
    return;
  }

  let errors = 0;
  let tagged = 0;
  let inputTokens = 0;
  let outputTokens = 0;

  // Assign temporary enrich IDs for cross-referencing batch results
  const withEnrichIds = pending.map((r, i) => ({ ...r, _enrichId: i }));

  for (let batchStart = 0; batchStart < withEnrichIds.length; batchStart += BATCH_SIZE) {
    const batch = withEnrichIds.slice(batchStart, batchStart + BATCH_SIZE);

    try {
      const tagResults = await tagBatch(client, batch);

      // Build a map of _enrichId → tagResult
      const tagMap = {};
      for (const t of tagResults) tagMap[t.id] = t;

      for (const recipe of batch) {
        const tagResult = tagMap[recipe._enrichId];
        if (!tagResult) {
          console.warn(`    ⚠ No tag result for recipe "${recipe.title}"`);
          errors++;
          continue;
        }

        // Merge tags into the enriched recipes array
        const recipeIdx = enriched.recipes.findIndex(r => r.id === recipe.id);
        if (recipeIdx !== -1) {
          const { _enrichId, ...cleanRecipe } = recipe;
          enriched.recipes[recipeIdx] = applyTags(cleanRecipe, tagResult);
        }

        done.add(recipe.id);
        tagged++;
        globalStats.tagged++;
        globalStats.errors += 0;
      }

    } catch (err) {
      console.error(`    ✗ Batch error (recipes ${batchStart}–${batchStart + BATCH_SIZE}): ${err.message}`);
      errors += batch.length;
      globalStats.errors += batch.length;
    }

    // Save progress every SAVE_EVERY recipes
    if (tagged % SAVE_EVERY < BATCH_SIZE || batchStart + BATCH_SIZE >= withEnrichIds.length) {
      saveProgress(lib.prog, done);
      enriched.enrichedAt = new Date().toISOString();
      fs.writeFileSync(lib.dest, JSON.stringify(enriched, null, 2), 'utf8');
      process.stdout.write(`\r    Progress: ${done.size}/${enriched.recipes.length} (${errors} errors)`);
    }

    if (batchStart + BATCH_SIZE < withEnrichIds.length) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n  Done: ${tagged} tagged, ${errors} errors`);

  // Final save
  enriched.enrichedAt = new Date().toISOString();
  enriched.enrichedWith = MODEL;
  fs.writeFileSync(lib.dest, JSON.stringify(enriched, null, 2), 'utf8');
  saveProgress(lib.prog, done);
}

// ── Spot-check output ─────────────────────────────────────────────────────────

function spotCheck(lib) {
  if (!fs.existsSync(lib.dest)) return;
  const data = JSON.parse(fs.readFileSync(lib.dest, 'utf8'));
  const withMeta = data.recipes.filter(r => r.metadata);
  if (withMeta.length === 0) return;

  console.log(`\n  Spot-checking ${path.basename(lib.dest)} (10 random recipes):`);

  const sample = [];
  for (let i = 0; i < 10; i++) {
    sample.push(withMeta[Math.floor(Math.random() * withMeta.length)]);
  }

  for (const r of sample) {
    const issues = validateRecipe(r);
    const status = issues.length === 0 ? '✓' : `⚠ ${issues.join(', ')}`;
    console.log(`    ${status} "${r.title}" — ${r.metadata?.cuisineType?.join('/')} | ${r.metadata?.primaryProtein ?? 'no protein'} | ${r.metadata?.skillLevel}`);
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000 });
  const globalStats = { tagged: 0, errors: 0, startTime: Date.now() };

  console.log(`=== Recipe Enrichment Script ===`);
  console.log(`Model: ${MODEL}`);
  console.log(`Batch size: ${BATCH_SIZE} recipes per API call\n`);

  for (const lib of LIBRARIES) {
    console.log(`\nProcessing: ${path.basename(lib.src)}`);
    try {
      await processLibrary(client, lib, globalStats);
    } catch (err) {
      console.error(`  Fatal error for ${path.basename(lib.src)}: ${err.message}`);
    }
  }

  // ── Spot checks ─────────────────────────────────────────────────────────
  console.log('\n── Spot Checks ──────────────────────────────────────────────');
  for (const lib of LIBRARIES) {
    spotCheck(lib);
  }

  const elapsed = ((Date.now() - globalStats.startTime) / 1000).toFixed(0);
  console.log(`\n── Summary ──────────────────────────────────────────────────`);
  console.log(`  Tagged:  ${globalStats.tagged}`);
  console.log(`  Errors:  ${globalStats.errors}`);
  console.log(`  Time:    ${elapsed}s`);
  console.log(`\nEnriched files saved to backend/data/*-enriched.json`);
  console.log(`Run the migration next: node scripts/migrations/addRecipesTable.js`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
