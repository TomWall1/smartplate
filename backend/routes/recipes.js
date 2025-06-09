const express = require('express');
const router = express.Router();
const recipeService = require('../services/recipeService');

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
    
    const recipes = await recipeService.findRecipesByIngredients(allIngredients, preferences);
    
    console.log(`Successfully found ${recipes.length} recipes`);
    res.json(recipes);
  } catch (error) {
    console.error('Error in recipe suggestions route:', error.message);
    console.error('Stack trace:', error.stack);
    
    // Fallback to mock data if there's any error
    try {
      const mockRecipes = recipeService.getMockRecipes(req.body.preferences || {});
      console.log('Returning fallback mock recipes:', mockRecipes.length);
      res.json(mockRecipes);
    } catch (fallbackError) {
      console.error('Even fallback failed:', fallbackError.message);
      // Final fallback - hardcoded recipes
      res.json([
        {
          id: 1,
          title: "Grilled Salmon with Spinach",
          image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400",
          cookTime: 25,
          servings: 4,
          rating: 4.8,
          ingredients: ["Atlantic Salmon", "Baby Spinach", "Lemon", "Olive Oil"],
          dealIngredients: ["Atlantic Salmon", "Baby Spinach"],
          description: "Fresh salmon grilled to perfection with sautéed spinach",
          sourceUrl: "#"
        },
        {
          id: 2,
          title: "Chicken Avocado Bowl",
          image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400",
          cookTime: 20,
          servings: 2,
          rating: 4.6,
          ingredients: ["Chicken Breast", "Avocados", "Brown Rice", "Greek Yogurt"],
          dealIngredients: ["Chicken Breast", "Avocados", "Greek Yogurt"],
          description: "Healthy bowl with grilled chicken and creamy avocado",
          sourceUrl: "#"
        },
        {
          id: 3,
          title: "Yogurt Berry Parfait",
          image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=400",
          cookTime: 5,
          servings: 1,
          rating: 4.4,
          ingredients: ["Greek Yogurt", "Mixed Berries", "Granola", "Honey"],
          dealIngredients: ["Greek Yogurt", "Mixed Berries"],
          description: "Quick and healthy breakfast or snack option",
          sourceUrl: "#"
        }
      ]);
    }
  }
});

// Get detailed recipe information
router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    console.log('Getting recipe details for ID:', recipeId);
    
    const recipe = await recipeService.getRecipeDetails(recipeId);
    
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    res.json(recipe);
  } catch (error) {
    console.error('Error fetching recipe details:', error.message);
    
    // Fallback to a basic recipe structure
    res.json({
      id: req.params.recipeId,
      title: "Sample Recipe",
      description: "A delicious recipe using your deal ingredients",
      instructions: "Detailed instructions will be available soon",
      ingredients: ["Fresh ingredients from your weekly deals"],
      cookTime: 30,
      servings: 4,
      nutrition: {
        calories: 350,
        protein: 20,
        carbs: 25,
        fat: 15
      }
    });
  }
});

// Search recipes
router.get('/search', async (req, res) => {
  try {
    const { query, diet, type } = req.query;
    console.log('Recipe search request:', { query, diet, type });
    
    if (recipeService.searchRecipes) {
      const results = await recipeService.searchRecipes(query, { dietary: diet ? [diet] : [] });
      res.json({ results, query, total: results.length });
    } else {
      // Simple fallback
      res.json({ 
        message: 'Recipe search endpoint',
        query,
        results: []
      });
    }
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
      timestamp: new Date().toISOString(),
      apiKeys: {
        spoonacular: hasSpoonacularKey ? 'configured' : 'missing'
      },
      features: {
        mockData: 'available',
        realAPI: hasSpoonacularKey ? 'available' : 'disabled'
      },
      serviceHealth: {
        recipeService: typeof recipeService === 'object' ? 'loaded' : 'error',
        methods: {
          findRecipesByIngredients: typeof recipeService.findRecipesByIngredients === 'function',
          getRecipeDetails: typeof recipeService.getRecipeDetails === 'function',
          getMockRecipes: typeof recipeService.getMockRecipes === 'function'
        }
      }
    });
  } catch (error) {
    console.error('Recipe health check error:', error.message);
    res.status(500).json({ 
      error: error.message,
      service: 'recipes',
      status: 'ERROR'
    });
  }
});

module.exports = router;