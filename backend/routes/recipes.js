const express = require('express');
const router = express.Router();
const recipeService = require('../services/recipeService');

// ── Manually trigger weekly recipe generation ───────────────────────
router.post('/generate-weekly', async (req, res) => {
  try {
    console.log('Manual weekly recipe generation triggered');
    const recipes = await recipeService.generateWeeklyRecipes();
    res.json({
      success: true,
      recipeCount: recipes.length,
      generatedAt: new Date().toISOString(),
      recipes,
    });
  } catch (error) {
    console.error('Error generating weekly recipes:', error.message);
    res.status(500).json({
      error: 'Failed to generate weekly recipes',
      message: error.message,
    });
  }
});

// ── Get recipe suggestions ──────────────────────────────────────────
// Default: returns stored weekly recipes (no API call)
// With preferences: calls Claude for personalised ranking
router.post('/suggestions', async (req, res) => {
  try {
    const { dealIngredients, preferences, pantryItems } = req.body;

    const hasPreferences =
      (preferences?.dietary && preferences.dietary.length > 0) ||
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
      console.log('Serving stored weekly recipes');
      recipes = recipeService.getWeeklyRecipes();
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
router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const recipe = await recipeService.getRecipeDetails(recipeId);
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
