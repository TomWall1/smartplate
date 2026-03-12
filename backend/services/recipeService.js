const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
const { enrichMatchedDealsWithSavings } = require('./savingsCalculator');

// Primary path (works locally, read-only on Vercel but included in deploy)
const WEEKLY_RECIPES_PATH = path.join(__dirname, '..', 'data', 'weekly-recipes.json');
// Fallback writable path for serverless environments
const TMP_RECIPES_PATH = path.join('/tmp', 'weekly-recipes.json');

// Decode HTML entities that scrapers sometimes leave in text fields
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

/**
 * Soft-filter recipes by excluded ingredients.
 *
 * - Tags each recipe with `excludedWarnings` (array of matched excluded terms).
 * - Recipes with NO excluded ingredients come first (preserving their original order).
 * - Recipes WITH excluded ingredients are pushed to the bottom.
 * - No recipe is ever fully removed — the frontend shows a warning badge instead.
 *   This prevents the edge case where all 20 recipes contain the excluded ingredient
 *   and the user would see an empty list.
 */
function applyExcludedIngredientFilter(recipes, excludeIngredients) {
  if (!excludeIngredients || excludeIngredients.length === 0) return recipes;

  const excluded = excludeIngredients.map(e => e.toLowerCase().trim()).filter(Boolean);
  if (excluded.length === 0) return recipes;

  const tagged = recipes.map(r => {
    const allText = [
      ...(r.allIngredients || []),
      ...(r.ingredients || []),
    ].join(' ').toLowerCase();

    const warnings = excluded.filter(ex => allText.includes(ex));
    return { ...r, excludedWarnings: warnings };
  });

  // Stable sort: clean recipes first, flagged last
  return [
    ...tagged.filter(r => r.excludedWarnings.length === 0),
    ...tagged.filter(r => r.excludedWarnings.length > 0),
  ];
}

class RecipeService {
  constructor() {
    this.anthropic = process.env.ANTHROPIC_API_KEY
      ? new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })
      : null;
  }

  // ── Weekly generation (library matching + Claude enrichment) ──────

  async generateWeeklyRecipes() {
    if (!this.anthropic) {
      throw new Error('ANTHROPIC_API_KEY is not configured');
    }

    const dealService = require('./dealService');
    const recipeMatcher = require('./recipeMatcher');

    let deals = await dealService.getCurrentDeals();

    // If cache is empty but a startup fetch is still running, wait for it
    // (up to 3 min) rather than immediately failing.
    if (deals.length === 0 && dealService.isLoading()) {
      console.log('RecipeService: Deals cache empty — waiting for startup fetch to complete...');
      await dealService.waitForDeals(180000);
      deals = await dealService.getCurrentDeals();
    }

    console.log(`RecipeService: Matching library recipes against ${deals.length} deals`);

    if (deals.length === 0) {
      throw new Error('No deals available — please refresh deals first');
    }

    // Step 1a: Enrich deals with product intelligence (DB lookup + Claude for unknowns).
    // Runs synchronously so the matcher can use product categorization.
    // After seeding this is mostly fast DB hits; first-run may be slower due to Claude calls.
    let enrichedDeals = deals;
    try {
      const { enrichDealsWithProducts } = require('./dealService');
      enrichedDeals = await enrichDealsWithProducts([...deals]);
    } catch (enrichErr) {
      console.warn('RecipeService: Deal enrichment unavailable — using text matching:', enrichErr.message);
    }

    // Step 1b: Find top 50 library recipes that match current deals (text + PI matching)
    const matched = recipeMatcher.matchDeals(enrichedDeals);
    console.log(`RecipeService: Found ${matched.length} matching library recipes`);

    // If no matches (library empty or no overlap), fall back to pure generation
    if (matched.length === 0) {
      console.log('RecipeService: No library matches, falling back to full generation');
      return this._generateFromScratch(deals);
    }

    // Step 1b-AI: Refine deal matching with Claude AI for each candidate recipe.
    // Runs once per weekly generation; results are cached with the recipes.
    // 500ms delay between recipes to stay within rate limits.
    let aiRefined = matched;
    if (this.anthropic) {
      try {
        const aiMatcher = require('./aiMatcher');
        aiMatcher.resetMatchStats();

        // Pre-filter to food deals only — same filtering as recipeMatcher uses internally
        const foodDeals = enrichedDeals.filter(d => {
          const kw = recipeMatcher.normalizeDealName(d.name || '');
          return kw && recipeMatcher._isFoodDeal(kw, d.category);
        });
        console.log(`RecipeService: AI matching ${matched.length} recipes against ${foodDeals.length} food deals`);

        const aiResults = [];
        for (let i = 0; i < matched.length; i++) {
          if (i > 0) await new Promise(resolve => setTimeout(resolve, 500));
          const recipe = matched[i];
          try {
            const aiDeals = await aiMatcher.matchRecipeToDeals(recipe, foodDeals);
            // Use AI deals if it found any; otherwise keep text-matched deals as fallback
            aiResults.push({
              ...recipe,
              matchedDeals: aiDeals.length > 0 ? aiDeals : recipe.matchedDeals,
              aiMatched: aiDeals.length > 0,
            });
          } catch (recipeErr) {
            console.warn(`RecipeService: AI match failed for "${recipe.title}": ${recipeErr.message}`);
            aiResults.push(recipe); // keep text-matched result
          }
        }

        // Drop recipes where AI matched but found no deals (genuine no-match)
        aiRefined = aiResults.filter(r => r.matchedDeals.length > 0);

        const stats = aiMatcher.getMatchStats();
        console.log(
          `RecipeService: AI matching complete — ` +
          `${stats.totalCalls} API calls, ${stats.totalIngredients} ingredients checked, ` +
          `est. cost $${stats.estimatedCost.toFixed(2)}`
        );
      } catch (aiErr) {
        console.warn('RecipeService: AI matching unavailable — using text matching:', aiErr.message);
        aiRefined = matched;
      }
    }

    // Step 1c: Attach per-serving savings to each matched recipe's deals.
    const matchedWithSavings = aiRefined.map(r =>
      enrichMatchedDealsWithSavings(r, r.matchedDeals)
    );

    // Step 2: Send matched recipes to Claude for enrichment.
    // Slim payload — drop the full deal list and cap matchedDeals to top 5 per recipe
    // so the prompt stays manageable.
    const recipeSummary = matchedWithSavings.map((r, i) => {
      // Best deal per unique ingredient (deduped), then top 5 by saving.
      // Without dedup, "rice" can match 4+ rice products and Claude sums them all,
      // making estimatedSaving exceed totalEstimatedCost.
      const seenIngredients = new Set();
      const topDeals = [...r.matchedDeals]
        .sort((a, b) => (b.saving || 0) - (a.saving || 0))
        .filter(md => {
          if (seenIngredients.has(md.ingredient)) return false;
          seenIngredients.add(md.ingredient);
          return true;
        })
        .slice(0, 5)
        .map(md => ({
          ingredient: md.ingredient,
          dealName: md.dealName,
          price: md.price,
          saving: md.saving,
          store: md.store,
        }));
      return {
        id: i + 1,
        title: r.title,
        topDeals,
      };
    });

    const prompt = `You are a helpful Australian meal-planning assistant. Below are ${matchedWithSavings.length} real recipes with their top on-special ingredients this week.

MATCHED RECIPES:
${JSON.stringify(recipeSummary, null, 2)}

For each recipe return a JSON object with:
- "id": the recipe id
- "estimatedSaving": sum of saving fields in topDeals (number, 2 decimal places)
- "totalEstimatedCost": realistic total ingredient cost in AUD for a home cook (number)
- "dealIngredients": array of dealName strings from topDeals
- "dealHighlights": array of strings formatted as "Ingredient $X.XX at Store (save $Y.YY)" — one per deal in topDeals

Respond with ONLY a JSON array of ${matchedWithSavings.length} objects. No markdown, no explanation.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 16000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text.trim();
      let jsonText = text;
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonText = fenceMatch[1].trim();

      const enriched = JSON.parse(jsonText);

      if (!Array.isArray(enriched) || enriched.length === 0) {
        throw new Error('Claude returned invalid enrichment data');
      }

      // Merge Claude enrichment with full library recipe data.
      // Claude only returns the deal-aware fields; everything else comes from the library.
      const normalised = enriched.map((e, i) => {
        const libRecipe = matchedWithSavings[i] || {};
        const libIngredients = libRecipe.ingredients || [];
        const allIngredients = libIngredients.map(ing => ing.raw || ing.name).filter(Boolean);
        return {
          id: e.id || i + 1,
          title: decodeHtml(libRecipe.title) || `Recipe ${i + 1}`,
          description: decodeHtml(libRecipe.description) || '',
          dealIngredients: Array.isArray(e.dealIngredients) ? e.dealIngredients : [],
          allIngredients,
          estimatedSaving: typeof e.estimatedSaving === 'number' ? e.estimatedSaving : libRecipe.totalSaving || 0,
          totalEstimatedCost: typeof e.totalEstimatedCost === 'number' ? e.totalEstimatedCost : 0,
          prepTime: libRecipe.totalTime || libRecipe.prepTime || 30,
          servings: libRecipe.servings || 4,
          steps: libRecipe.steps || [],
          tags: libRecipe.tags || [],
          dealHighlights: Array.isArray(e.dealHighlights) ? e.dealHighlights : [],
          matchedDeals:          libRecipe.matchedDeals         || [],
          weightedScore:         libRecipe.weightedScore         ?? null,
          totalMealSaving:       libRecipe.totalMealSaving       ?? null,
          totalPerServingSaving: libRecipe.totalPerServingSaving ?? null,
          // Backwards compat fields for existing frontend
          image: libRecipe.image || `https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400`,
          cookTime: libRecipe.cookTime || libRecipe.totalTime || 30,
          rating: 4.5,
          ingredients: allIngredients,
          instructions: Array.isArray(libRecipe.steps) ? libRecipe.steps.join(' ') : '',
          source: libRecipe.source || 'recipetineats',
          sourceUrl: libRecipe.url || '#',
          nutrition: libRecipe.nutrition || { calories: 0, protein: 0, carbs: 0, fat: 0 },
        };
      });

      this._saveWeeklyRecipes(normalised);
      console.log(`RecipeService: Enriched and stored ${normalised.length} weekly recipes from library`);
      return normalised;
    } catch (error) {
      console.error('RecipeService: Claude enrichment failed:', error.message);
      throw error;
    }
  }

  // ── Fallback: generate recipes from scratch (no library) ──────────

  async _generateFromScratch(deals) {
    const dealSummary = deals.map(d => {
      const saving = d.originalPrice && d.price
        ? `(was $${d.originalPrice.toFixed(2)}, now $${d.price.toFixed(2)})`
        : `($${(d.price || 0).toFixed(2)})`;
      return `- ${d.name} ${saving} [${d.store}] — ${d.category || 'General'}`;
    }).join('\n');

    const prompt = `You are a helpful Australian meal-planning assistant. Below is this week's supermarket specials from Woolworths, Coles, and IGA.

THIS WEEK'S SPECIALS:
${dealSummary}

Generate exactly 50 diverse, practical recipes that make good use of these specials. Aim for variety:
- Mix of quick weeknight dinners (under 30 min), meal-prep friendly dishes, breakfasts, and lunches
- Range of cuisines (Australian, Asian, Mediterranean, Mexican, etc.)
- Include vegetarian and meat options
- Recipes should be achievable for a home cook with basic pantry staples (oil, salt, pepper, garlic, onion, common spices, flour, sugar, eggs, rice, pasta)

For each recipe, return a JSON object with these exact fields:
- "id": sequential number 1-50
- "title": recipe name
- "description": 1-2 sentence appetising description
- "dealIngredients": array of ingredient names that are on special this week (must match names from the specials list above)
- "allIngredients": array of ALL ingredients with quantities (e.g. "500g chicken breast", "2 tbsp soy sauce")
- "estimatedSaving": dollar amount saved by using specials vs regular prices (number, e.g. 8.50)
- "totalEstimatedCost": estimated total cost of all ingredients (number, e.g. 15.00)
- "prepTime": total time in minutes (number)
- "servings": number of servings (number)
- "steps": array of step-by-step instructions (each step is a string)
- "tags": array from ["quick", "meal-prep", "vegetarian", "vegan", "gluten-free", "dairy-free", "high-protein", "budget", "breakfast", "lunch", "dinner"]

You must respond with valid JSON only. Do not include any text, explanation or commentary before or after the JSON array. Respond with ONLY a JSON array of 50 recipe objects.`;

    const response = await this.anthropic.messages.create({
      model: 'claude-sonnet-4-20250514',
      max_tokens: 8000,
      messages: [{ role: 'user', content: prompt }],
    });

    const text = response.content[0].text.trim();
    let jsonText = text;
    const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
    if (fenceMatch) jsonText = fenceMatch[1].trim();

    const recipes = JSON.parse(jsonText);

    if (!Array.isArray(recipes) || recipes.length === 0) {
      throw new Error('Claude returned invalid recipe data');
    }

    const normalised = recipes.map((r, i) => ({
      id: r.id || i + 1,
      title: r.title || `Recipe ${i + 1}`,
      description: r.description || '',
      dealIngredients: Array.isArray(r.dealIngredients) ? r.dealIngredients : [],
      allIngredients: Array.isArray(r.allIngredients) ? r.allIngredients : [],
      estimatedSaving: typeof r.estimatedSaving === 'number' ? r.estimatedSaving : 0,
      totalEstimatedCost: typeof r.totalEstimatedCost === 'number' ? r.totalEstimatedCost : 0,
      prepTime: typeof r.prepTime === 'number' ? r.prepTime : 30,
      servings: typeof r.servings === 'number' ? r.servings : 4,
      steps: Array.isArray(r.steps) ? r.steps : [],
      tags: Array.isArray(r.tags) ? r.tags : [],
      image: `https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400`,
      cookTime: typeof r.prepTime === 'number' ? r.prepTime : 30,
      rating: 4.5,
      ingredients: Array.isArray(r.allIngredients) ? r.allIngredients : [],
      instructions: Array.isArray(r.steps) ? r.steps.join(' ') : '',
      sourceUrl: '#',
      nutrition: { calories: 0, protein: 0, carbs: 0, fat: 0 },
    }));

    this._saveWeeklyRecipes(normalised);
    console.log(`RecipeService: Generated ${normalised.length} weekly recipes from scratch (no library, target 50)`);
    return normalised;
  }

  // ── Personalised ranking (per-user Claude call) ───────────────────

  async getPersonalisedRecipes(userPreferences) {
    const weeklyRecipes = this.getWeeklyRecipes();

    if (!this.anthropic) {
      console.log('RecipeService: No API key, filtering locally');
      return this._filterLocally(weeklyRecipes, userPreferences);
    }

    const recipeSummary = weeklyRecipes.map(r => ({
      id: r.id,
      title: r.title,
      description: r.description,
      tags: r.tags,
      dealIngredients: r.dealIngredients,
      allIngredients: r.allIngredients,
      prepTime: r.prepTime,
      totalEstimatedCost: r.totalEstimatedCost,
    }));

    const excluded = (userPreferences.excludeIngredients || []).map(e => e.toLowerCase());

    const prompt = `You are a meal-planning assistant. Here are this week's pre-generated recipes:

${JSON.stringify(recipeSummary, null, 2)}

The user has these preferences:
${JSON.stringify(userPreferences, null, 2)}

Preference fields explained:
- dietary: dietary requirements like ["vegetarian", "gluten-free", "dairy-free", "vegan"]
- mealTypes: preferred meal styles like ["quick", "family-friendly", "healthy", "comfort", "batch-cook", "one-pot"] — match against recipe tags
- maxPrepTime: maximum prep time in minutes — exclude recipes where prepTime exceeds this
- excludeIngredients: ingredients the user dislikes and must not appear in results
- cuisinePreferences: preferred cuisine styles

Apply these rules strictly in order:
1. HARD EXCLUDE — Remove any recipe whose allIngredients contains any word from excludeIngredients. Do not include these at all.
2. DIETARY — Remove any recipe incompatible with the dietary array (e.g. vegetarian recipes must have no meat).
3. PREP TIME — Remove any recipe where prepTime exceeds maxPrepTime (if set).
4. RANK — From the remaining recipes, rank best-to-worst. Recipes whose tags include items from mealTypes should rank higher. Mention matching meal types in the reason.

Return a JSON array ranked best to worst, at most 10 entries. Format:
[{"id": 1, "reason": "Quick weeknight meal under 20 min — matches your family-friendly preference"}, ...]

Respond with ONLY the JSON array.`;

    try {
      const response = await this.anthropic.messages.create({
        model: 'claude-sonnet-4-20250514',
        max_tokens: 2000,
        messages: [{ role: 'user', content: prompt }],
      });

      const text = response.content[0].text.trim();
      let jsonText = text;
      const fenceMatch = text.match(/```(?:json)?\s*([\s\S]*?)```/);
      if (fenceMatch) jsonText = fenceMatch[1].trim();

      const ranked = JSON.parse(jsonText);

      if (!Array.isArray(ranked)) throw new Error('Invalid ranking response');

      // Map ranked IDs back to full recipe objects
      const rawResult = [];
      for (const entry of ranked) {
        const recipe = weeklyRecipes.find(r => r.id === entry.id);
        if (recipe) {
          rawResult.push({ ...recipe, matchReason: entry.reason });
        }
      }

      // Server-side enforcement: soft sort + warning tagging for excluded ingredients.
      // Claude may still return recipes containing excluded ingredients — we correct that here.
      const result = applyExcludedIngredientFilter(rawResult, userPreferences.excludeIngredients);

      return result;
    } catch (error) {
      console.error('RecipeService: Personalisation failed:', error.message);
      return this._filterLocally(weeklyRecipes, userPreferences);
    }
  }

  // ── Read stored weekly recipes ────────────────────────────────────

  _readRecipesFile(filePath) {
    try {
      if (fs.existsSync(filePath)) {
        return JSON.parse(fs.readFileSync(filePath, 'utf8'));
      }
    } catch {}
    return null;
  }

  getWeeklyRecipes(store = null) {
    // Try /tmp first (most recently generated on serverless), then deployed file
    const tmpData = this._readRecipesFile(TMP_RECIPES_PATH);
    const allRecipes = (tmpData?.recipes?.length > 0)
      ? tmpData.recipes
      : (this._readRecipesFile(WEEKLY_RECIPES_PATH)?.recipes ?? []);

    if (!store) return allRecipes;

    return this._filterRecipesByStore(allRecipes, store);
  }

  getWeeklyRecipesMeta() {
    const data = this._readRecipesFile(TMP_RECIPES_PATH) || this._readRecipesFile(WEEKLY_RECIPES_PATH);
    if (data) {
      return {
        generatedAt: data.generatedAt,
        recipeCount: data.recipes?.length || 0,
        dealCount: data.dealCount || 0,
      };
    }
    return null;
  }

  _saveWeeklyRecipes(recipes) {
    const data = {
      generatedAt: new Date().toISOString(),
      dealCount: 0,
      recipes,
    };
    try {
      const dealService = require('./dealService');
      data.dealCount = dealService.getCurrentDeals.length || 0;
    } catch {}

    const json = JSON.stringify(data, null, 2);

    // Try primary path first (works locally)
    try {
      fs.mkdirSync(path.dirname(WEEKLY_RECIPES_PATH), { recursive: true });
      fs.writeFileSync(WEEKLY_RECIPES_PATH, json, 'utf8');
    } catch {
      // Read-only filesystem (Vercel) — write to /tmp instead
      fs.writeFileSync(TMP_RECIPES_PATH, json, 'utf8');
    }
  }

  // ── Local filtering fallback (no API call) ────────────────────────

  _filterLocally(recipes, preferences) {
    let filtered = [...recipes];

    // 1. Dietary — hard filter
    if (preferences.dietary && preferences.dietary.length > 0) {
      const diets = preferences.dietary.map(d => d.toLowerCase());
      if (diets.includes('vegetarian')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => ['vegetarian', 'vegan'].includes(t.toLowerCase())) ||
          !this._hasNonVegIngredient(r)
        );
      }
      if (diets.includes('vegan')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'vegan')
        );
      }
      if (diets.includes('gluten-free')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'gluten-free')
        );
      }
      if (diets.includes('dairy-free')) {
        filtered = filtered.filter(r =>
          r.tags?.some(t => t.toLowerCase() === 'dairy-free')
        );
      }
    }

    // 2. maxPrepTime — hard filter
    if (preferences.maxPrepTime) {
      filtered = filtered.filter(r =>
        (r.prepTime || 30) <= parseInt(preferences.maxPrepTime, 10)
      );
    }

    // 3. excludeIngredients — soft sort (pushes flagged recipes to bottom, never removes)
    filtered = applyExcludedIngredientFilter(filtered, preferences.excludeIngredients);

    // 4. mealTypes — soft sort: recipes matching a preferred type come first
    if (preferences.mealTypes && preferences.mealTypes.length > 0) {
      const types = preferences.mealTypes.map(t => t.toLowerCase());
      const matches = filtered.filter(r =>
        (r.tags ?? []).some(tag => types.includes(tag.toLowerCase()))
      );
      const rest = filtered.filter(r =>
        !(r.tags ?? []).some(tag => types.includes(tag.toLowerCase()))
      );
      filtered = [...matches, ...rest];
    }

    return filtered.slice(0, 10);
  }

  _hasNonVegIngredient(recipe) {
    const meats = ['chicken', 'beef', 'pork', 'lamb', 'salmon', 'fish', 'prawn', 'bacon', 'mince', 'sausage'];
    const all = (recipe.allIngredients || recipe.ingredients || []).join(' ').toLowerCase();
    return meats.some(m => all.includes(m));
  }

  // ── Legacy methods (kept for backwards compat) ────────────────────

  async findRecipesByIngredients(ingredients, preferences = {}) {
    // If preferences have dietary/budget/etc, use personalised path
    const hasPreferences = preferences.dietary?.length > 0 ||
      preferences.maxPrepTime ||
      preferences.excludeIngredients?.length > 0;

    if (hasPreferences) {
      return this.getPersonalisedRecipes(preferences);
    }

    // Otherwise return stored weekly recipes
    return this.getWeeklyRecipes();
  }

  /**
   * Apply store isolation to a list of recipes.
   * - Keeps only recipes with at least one matchedDeal from the requested store
   * - Strips cross-store matchedDeals, dealHighlights, and dealIngredients
   * - Recalculates estimatedSaving from remaining deals
   */
  _filterRecipesByStore(recipes, store) {
    const s = store.toLowerCase();
    return recipes
      .map(r => {
        const storeDeals = (r.matchedDeals || []).filter(
          d => (d.store || '').toLowerCase() === s
        );
        if (storeDeals.length === 0) return null;

        const storeSaving = +storeDeals.reduce((sum, d) => sum + (d.saving || 0), 0).toFixed(2);

        // dealHighlights are Claude strings like "Chicken $5 at Woolworths (save $2)"
        // Filter to only highlights that mention this store.
        const storeHighlights = (r.dealHighlights || []).filter(h =>
          h.toLowerCase().includes(s)
        );

        // Reconstruct dealIngredients from the filtered matched deals.
        const storeDealIngredients = storeDeals.map(d => d.dealName);

        return {
          ...r,
          matchedDeals: storeDeals,
          estimatedSaving: storeSaving,
          dealHighlights: storeHighlights,
          dealIngredients: storeDealIngredients,
        };
      })
      .filter(Boolean)
      .sort((a, b) => b.matchedDeals.length - a.matchedDeals.length);
  }

  async getRecipeDetails(recipeId, store = null) {
    const recipes = this.getWeeklyRecipes();
    const recipe = recipes.find(r => r.id == recipeId) || null;
    if (!recipe || !store) return recipe;
    // Apply store isolation so detail page never shows cross-store deal data
    const filtered = this._filterRecipesByStore([recipe], store);
    return filtered[0] || recipe;
  }

  async searchRecipes(query) {
    const recipes = this.getWeeklyRecipes();
    const q = query.toLowerCase();
    return recipes.filter(r =>
      r.title?.toLowerCase().includes(q) ||
      r.description?.toLowerCase().includes(q) ||
      r.tags?.some(t => t.includes(q))
    );
  }

}

module.exports = new RecipeService();
