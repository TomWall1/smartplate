const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');

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

    // Step 1: Find top 20 library recipes that match current deals
    const matched = recipeMatcher.matchDeals(deals);
    console.log(`RecipeService: Found ${matched.length} matching library recipes`);

    // If no matches (library empty or no overlap), fall back to pure generation
    if (matched.length === 0) {
      console.log('RecipeService: No library matches, falling back to full generation');
      return this._generateFromScratch(deals);
    }

    // Step 2: Send matched recipes to Claude for enrichment.
    // Slim payload — drop the full deal list and cap matchedDeals to top 5 per recipe
    // so the prompt stays under ~6k input tokens and completes in ~15-20s.
    const recipeSummary = matched.map((r, i) => {
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

    const prompt = `You are a helpful Australian meal-planning assistant. Below are ${matched.length} real recipes with their top on-special ingredients this week.

MATCHED RECIPES:
${JSON.stringify(recipeSummary, null, 2)}

For each recipe return a JSON object with:
- "id": the recipe id
- "estimatedSaving": sum of saving fields in topDeals (number, 2 decimal places)
- "totalEstimatedCost": realistic total ingredient cost in AUD for a home cook (number)
- "dealIngredients": array of dealName strings from topDeals
- "dealHighlights": array of strings formatted as "Ingredient $X.XX at Store (save $Y.YY)" — one per deal in topDeals

Respond with ONLY a JSON array of ${matched.length} objects. No markdown, no explanation.`;

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
        const libRecipe = matched[i] || {};
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
          matchedDeals: libRecipe.matchedDeals || [],
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

Generate exactly 20 diverse, practical recipes that make good use of these specials. Aim for variety:
- Mix of quick weeknight dinners (under 30 min), meal-prep friendly dishes, breakfasts, and lunches
- Range of cuisines (Australian, Asian, Mediterranean, Mexican, etc.)
- Include vegetarian and meat options
- Recipes should be achievable for a home cook with basic pantry staples (oil, salt, pepper, garlic, onion, common spices, flour, sugar, eggs, rice, pasta)

For each recipe, return a JSON object with these exact fields:
- "id": sequential number 1-20
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

You must respond with valid JSON only. Do not include any text, explanation or commentary before or after the JSON array. Respond with ONLY a JSON array of 20 recipe objects.`;

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
    console.log(`RecipeService: Generated ${normalised.length} weekly recipes from scratch (no library)`);
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

    const prompt = `You are a meal-planning assistant. Here are this week's 20 pre-generated recipes:

${JSON.stringify(recipeSummary, null, 2)}

The user has these preferences:
${JSON.stringify(userPreferences, null, 2)}

Possible preference fields:
- dietary: array like ["vegetarian", "gluten-free", "dairy-free", "vegan"]
- maxPrepTime: maximum prep time in minutes
- servings: preferred serving count
- budget: "low", "medium", or "high"
- cuisinePreferences: array of preferred cuisines
- excludeIngredients: array of ingredients the user dislikes and wants to avoid
- pantryItems: array of ingredients the user already has at home

Rules (apply strictly in this order):
1. HARD EXCLUDE: Remove any recipe whose allIngredients list contains any ingredient from excludeIngredients. Do not include these recipes in the output at all.
2. DIETARY: Only include recipes compatible with the user's dietary restrictions.
3. RANK: Sort remaining recipes from best match to worst match based on all other preferences.

Return a JSON array of recipe IDs ranked from best match to worst, with a short reason for each. Format:
[{"id": 1, "reason": "Great match — vegetarian, under 20 min, uses your pantry spinach"}, ...]

Return at most 10 recipes. Respond with ONLY the JSON array.`;

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

    if (preferences.dietary && preferences.dietary.length > 0) {
      const diets = preferences.dietary.map(d => d.toLowerCase());
      if (diets.includes('vegetarian')) {
        filtered = filtered.filter(r =>
          r.tags?.includes('vegetarian') || r.tags?.includes('vegan') ||
          !this._hasNonVegIngredient(r)
        );
      }
      if (diets.includes('vegan')) {
        filtered = filtered.filter(r => r.tags?.includes('vegan'));
      }
      if (diets.includes('gluten-free')) {
        filtered = filtered.filter(r => r.tags?.includes('gluten-free'));
      }
      if (diets.includes('dairy-free')) {
        filtered = filtered.filter(r => r.tags?.includes('dairy-free'));
      }
    }

    if (preferences.maxPrepTime) {
      filtered = filtered.filter(r => (r.prepTime || 30) <= preferences.maxPrepTime);
    }

    filtered = applyExcludedIngredientFilter(filtered, preferences.excludeIngredients);

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
