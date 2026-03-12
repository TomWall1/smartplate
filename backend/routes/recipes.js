const express = require('express');
const router = express.Router();
const recipeService = require('../services/recipeService');

// ── Manually trigger weekly recipe generation ───────────────────────
// Returns 202 immediately; generation runs in background.
router.post('/generate-weekly', (req, res) => {
  console.log('Manual weekly recipe generation triggered (background)');
  res.status(202).json({
    success: true,
    message: 'Recipe generation started in background. Check /api/recipes/suggestions in ~2 minutes.',
    startedAt: new Date().toISOString(),
  });
  // Fire-and-forget
  recipeService.generateWeeklyRecipes()
    .then((recipes) => console.log(`Recipe generation complete: ${recipes.length} recipes`))
    .catch((err) => console.error('Recipe generation failed:', err.message));
});

// ── Get recipe suggestions ──────────────────────────────────────────
// Default: returns stored weekly recipes (no API call)
// With preferences: calls Claude for personalised ranking
router.post('/suggestions', async (req, res) => {
  try {
    const { dealIngredients, preferences, pantryItems, store } = req.body;

    const hasPreferences =
      (preferences?.dietary && preferences.dietary.length > 0) ||
      (preferences?.mealTypes && preferences.mealTypes.length > 0) ||
      preferences?.maxPrepTime ||
      preferences?.budget ||
      preferences?.cuisinePreferences?.length > 0 ||
      (preferences?.excludeIngredients && preferences.excludeIngredients.length > 0);

    let recipes;

    if (hasPreferences) {
      // Personalised path — Claude API call with user prefs
      const fullPreferences = {
        ...preferences,
        pantryItems: pantryItems || [],
      };
      console.log('Using personalised recipe path');
      recipes = await recipeService.getPersonalisedRecipes(fullPreferences);
    } else {
      // Default path — read from stored weekly recipes (free)
      const storeLabel = store || null;
      console.log(`Serving stored weekly recipes${storeLabel ? ` for store: ${storeLabel}` : ''}`);
      recipes = recipeService.getWeeklyRecipes(storeLabel);
    }

    res.json(recipes);
  } catch (error) {
    console.error('Error in recipe suggestions:', error.message);
    res.status(500).json({
      error: 'Failed to load recipes',
      message: error.message,
    });
  }
});

// ── Deal-matched recipes (no Claude call) ────────────────────────────
router.get('/matched', async (req, res) => {
  try {
    const recipeMatcher = require('../services/recipeMatcher');
    const dealService = require('../services/dealService');

    const deals = await dealService.getCurrentDeals();
    const matched = recipeMatcher.matchDeals(deals);

    res.json({
      matchedAt: new Date().toISOString(),
      dealCount: deals.length,
      recipeCount: matched.length,
      recipes: matched,
    });
  } catch (error) {
    console.error('Error getting matched recipes:', error.message);
    res.status(500).json({
      error: 'Failed to get matched recipes',
      message: error.message,
    });
  }
});

// ── Cached recipes with query-param filtering (no AI calls) ─────────
// Reads from weekly-recipes.json; all filtering runs server-side.
// Query params: allergens (comma-separated), mealType, maxCookTime
router.get('/matched-filtered', async (req, res) => {
  try {
    const { allergens, mealType, maxCookTime, store } = req.query;

    let recipes = recipeService.getWeeklyRecipes(store || null);

    if (allergens) {
      const allergenList = allergens.split(',').map(a => a.toLowerCase().trim());
      recipes = recipes.filter(r => {
        const text = [...(r.allIngredients || []), ...(r.ingredients || [])].join(' ').toLowerCase();
        return !allergenList.some(a => text.includes(a));
      });
    }

    if (mealType) {
      recipes = recipes.filter(r =>
        r.tags?.some(t => t.toLowerCase() === mealType.toLowerCase()) ||
        r.mealType?.toLowerCase() === mealType.toLowerCase()
      );
    }

    if (maxCookTime) {
      const maxMin = parseInt(maxCookTime, 10);
      if (!isNaN(maxMin)) {
        recipes = recipes.filter(r => (r.cookTime || r.prepTime || 0) <= maxMin);
      }
    }

    res.json({
      recipes,
      total: recipes.length,
      cached: true,
      generatedAt: recipes[0]?.generatedAt ?? null,
    });
  } catch (error) {
    console.error('Error in matched-filtered:', error.message);
    res.status(500).json({ error: error.message });
  }
});

// ── AI match cost monitoring ─────────────────────────────────────────
router.get('/match-stats', (req, res) => {
  try {
    const aiMatcher = require('../services/aiMatcher');
    res.json(aiMatcher.getMatchStats());
  } catch {
    res.json({ totalCalls: 0, totalIngredients: 0, estimatedCost: 0, note: 'aiMatcher not loaded yet' });
  }
});

// ── Health check (must be before /:recipeId) ────────────────────────
router.get('/health', async (req, res) => {
  const meta = recipeService.getWeeklyRecipesMeta();
  res.json({
    status: 'OK',
    service: 'recipes',
    timestamp: new Date().toISOString(),
    apiKeys: {
      anthropic: process.env.ANTHROPIC_API_KEY ? 'configured' : 'missing',
    },
    weeklyRecipes: meta || { status: 'not generated yet' },
    features: {
      weeklyGeneration: 'available',
      personalisation: process.env.ANTHROPIC_API_KEY ? 'available' : 'disabled (no API key)',
    },
  });
});

// ── Search recipes (must be before /:recipeId) ──────────────────────
router.get('/search', async (req, res) => {
  try {
    const { query } = req.query;
    if (!query) {
      return res.json({ results: [], query: '', total: 0 });
    }
    const results = await recipeService.searchRecipes(query);
    res.json({ results, query, total: results.length });
  } catch (error) {
    console.error('Error searching recipes:', error.message);
    res.status(500).json({ error: 'Failed to search recipes' });
  }
});

// ── Get detailed recipe by ID (must be AFTER named routes) ──────────
// Optional ?store=woolworths query param applies store isolation
router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const { store } = req.query;
    const recipe = await recipeService.getRecipeDetails(recipeId, store || null);
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    res.json(recipe);
  } catch (error) {
    console.error('Error fetching recipe details:', error.message);
    res.status(500).json({ error: 'Failed to fetch recipe details' });
  }
});

module.exports = router;
