const express = require('express');
const router = express.Router();
const { findRecipesByIngredients, getRecipeDetails } = require('../services/recipeService');

// Get recipe suggestions based on deal ingredients
router.post('/suggestions', async (req, res) => {
  try {
    console.log('Recipe suggestions request:', {
      hasIngredients: !!req.body.dealIngredients,
      ingredientsCount: req.body.dealIngredients?.length,
      hasPreferences: !!req.body.preferences,
      pantryItemsCount: req.body.pantryItems?.length
    });
    
    const { dealIngredients, preferences, pantryItems } = req.body;
    
    // Validate input
    if (!dealIngredients || !Array.isArray(dealIngredients)) {
      return res.status(400).json({ 
        error: 'dealIngredients is required and must be an array' 
      });
    }
    
    const allIngredients = [...dealIngredients, ...(pantryItems || [])];
    console.log('Finding recipes for ingredients:', allIngredients.slice(0, 5)); // Log first 5
    
    const recipes = await findRecipesByIngredients(allIngredients, preferences);
    
    console.log(`Successfully found ${recipes.length} recipes`);
    res.json(recipes);
  } catch (error) {
    console.error('Error in recipe suggestions route:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Return a user-friendly error with fallback
    res.status(500).json({ 
      error: 'Failed to fetch recipe suggestions',
      message: error.message,
      fallback: 'Using mock data instead'
    });
  }
});

// Get detailed recipe information
router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    console.log('Getting recipe details for ID:', recipeId);
    
    const recipe = await getRecipeDetails(recipeId);
    
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    res.json(recipe);
  } catch (error) {
    console.error('Error fetching recipe details:', error.message);
    res.status(500).json({ 
      error: 'Failed to fetch recipe details',
      message: error.message
    });
  }
});

// Search recipes
router.get('/search', async (req, res) => {
  try {
    const { query, diet, type } = req.query;
    console.log('Recipe search request:', { query, diet, type });
    
    // For now, return a simple response
    res.json({ 
      message: 'Recipe search endpoint',
      query,
      results: []
    });
  } catch (error) {
    console.error('Error searching recipes:', error.message);
    res.status(500).json({ 
      error: 'Failed to search recipes',
      message: error.message
    });
  }
});

// Health check for recipes service
router.get('/health', async (req, res) => {
  try {
    const hasSpoonacularKey = !!process.env.SPOONACULAR_API_KEY;
    
    res.json({
      status: 'OK',
      service: 'recipes',
      apiKeys: {
        spoonacular: hasSpoonacularKey ? 'configured' : 'missing'
      },
      features: {
        mockData: 'available',
        realAPI: hasSpoonacularKey ? 'available' : 'disabled'
      }
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;