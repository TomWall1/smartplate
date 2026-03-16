#!/usr/bin/env node
/**
 * retryEnrichment.js
 *
 * Retries enrichment for any recipes that are missing metadata tags
 * due to JSON truncation errors in the original run.
 *
 * Root cause of failures: batch size 8 occasionally produces ~26K chars of
 * output which clips the 8192-token limit, yielding invalid JSON.
 * Fix: process one recipe at a time so each response is ~1/8th the size.
 *
 * Usage:  cd backend && node scripts/retryEnrichment.js
 */
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const Anthropic = require('@anthropic-ai/sdk');
const fs        = require('fs');
const path      = require('path');

const DATA_DIR = path.join(__dirname, '..', 'data');
const MODEL    = 'claude-haiku-4-5-20251001';
const DELAY_MS = 300;

const LIBRARIES = [
  { dest: path.join(DATA_DIR, 'recipe-library-enriched.json'),       source: 'recipetineats' },
  { dest: path.join(DATA_DIR, 'jamie-oliver-recipes-enriched.json'), source: 'jamieoliver'   },
  { dest: path.join(DATA_DIR, 'donna-hay-recipes-enriched.json'),    source: 'donnahay'      },
  { dest: path.join(DATA_DIR, 'juliegoodwin-recipes-enriched.json'), source: 'juliegoodwin'  },
  { dest: path.join(DATA_DIR, 'womensweekly-recipes-enriched.json'), source: 'womensweekly'  },
];

// Same system prompt as enrichRecipes.js
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

async function tagSingle(client, recipe) {
  const input = [{
    id: recipe.id,
    title: recipe.title,
    description: recipe.description || '',
    prepTime: recipe.prepTime ?? null,
    cookTime: recipe.cookTime ?? null,
    servings: recipe.servings ?? null,
    category: recipe.category ?? [],
    cuisine: recipe.cuisine ?? [],
    ingredients: (recipe.ingredients || [])
      .map((ing, idx) => ({ idx, ing }))
      .filter(({ ing }) => !ing.isSubheading)
      .map(({ idx, ing }) => ({
        idx,
        name: ing.name,
        quantity: ing.quantity ?? '',
        unit: ing.unit ?? '',
      })),
  }];

  const response = await client.messages.create({
    model:      MODEL,
    max_tokens: 8192,
    system:     SYSTEM_PROMPT,
    messages: [{ role: 'user', content: `Tag these 1 recipes:\n${JSON.stringify(input)}` }],
  });

  const raw = response.content[0].text.trim();
  const jsonText = raw.replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '').trim();
  const parsed = JSON.parse(jsonText);
  return Array.isArray(parsed) ? parsed[0] : parsed;
}

function applyTags(recipe, tagResult) {
  if (!tagResult) return recipe;
  const updated = { ...recipe, metadata: tagResult.metadata || {} };
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

async function retryLibrary(client, lib, globalStats) {
  if (!fs.existsSync(lib.dest)) {
    console.log(`  Skipping (not found): ${lib.dest}`);
    return;
  }

  const data = JSON.parse(fs.readFileSync(lib.dest, 'utf8'));
  const missing = data.recipes.filter(r => !r.metadata);

  console.log(`  ${lib.source}: ${data.recipes.length} total, ${missing.length} missing metadata`);

  if (missing.length === 0) {
    console.log('  All recipes already enriched — skipping.');
    return;
  }

  let tagged = 0;
  let errors = 0;

  for (let i = 0; i < missing.length; i++) {
    const recipe = missing[i];
    try {
      const tagResult = await tagSingle(client, recipe);
      const recipeIdx = data.recipes.findIndex(r => r.id === recipe.id);
      if (recipeIdx !== -1) {
        data.recipes[recipeIdx] = applyTags(recipe, tagResult);
      }
      tagged++;
      globalStats.tagged++;
      process.stdout.write(`\r    Progress: ${tagged}/${missing.length} (${errors} errors)`);
    } catch (err) {
      console.error(`\n    ✗ Failed "${recipe.title}": ${err.message}`);
      errors++;
      globalStats.errors++;
    }

    if (i < missing.length - 1) {
      await new Promise(r => setTimeout(r, DELAY_MS));
    }
  }

  console.log(`\n  Done: ${tagged} tagged, ${errors} errors`);

  data.enrichedAt = new Date().toISOString();
  data.enrichedWith = MODEL;
  fs.writeFileSync(lib.dest, JSON.stringify(data, null, 2), 'utf8');
}

async function main() {
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Missing ANTHROPIC_API_KEY in .env');
    process.exit(1);
  }

  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, timeout: 60000 });
  const globalStats = { tagged: 0, errors: 0, startTime: Date.now() };

  // Count total missing upfront
  let totalMissing = 0;
  for (const lib of LIBRARIES) {
    if (fs.existsSync(lib.dest)) {
      const data = JSON.parse(fs.readFileSync(lib.dest, 'utf8'));
      totalMissing += data.recipes.filter(r => !r.metadata).length;
    }
  }

  console.log(`=== Enrichment Retry Script ===`);
  console.log(`Model: ${MODEL} | Batch size: 1 (one recipe per call to avoid token truncation)`);
  console.log(`Total recipes missing metadata: ${totalMissing}\n`);

  for (const lib of LIBRARIES) {
    console.log(`\nProcessing: ${lib.source}`);
    try {
      await retryLibrary(client, lib, globalStats);
    } catch (err) {
      console.error(`  Fatal error for ${lib.source}: ${err.message}`);
    }
  }

  const elapsed = ((Date.now() - globalStats.startTime) / 1000).toFixed(0);
  console.log(`\n── Summary ──────────────────────────────────────────────────`);
  console.log(`  Tagged:  ${globalStats.tagged}`);
  console.log(`  Errors:  ${globalStats.errors}`);
  console.log(`  Time:    ${elapsed}s`);
  console.log(`\nRetry complete. Run migration next: node scripts/migrations/addRecipesTable.js`);
}

main().catch(err => {
  console.error('Fatal:', err.message);
  process.exit(1);
});
