const express = require('express');
const router = express.Router();
const { findRecipesByIngredients, getRecipeDetails } = require('../services/recipeService');

// Get recipe suggestions based on deal ingredients
router.post('/suggestions', async (req, res) => {
  try {
    const { dealIngredients, preferences, pantryItems } = req.body;
    
    const allIngredients = [...dealIngredients, ...(pantryItems || [])];
    const recipes = await findRecipesByIngredients(allIngredients, preferences);
    
    res.json(recipes);
  } catch (error) {
    console.error('Error fetching recipe suggestions:', error);
    res.status(500).json({ error: 'Failed to fetch recipe suggestions' });
  }
});

// Get detailed recipe information
router.get('/:recipeId', async (req, res) => {
  try {
    const { recipeId } = req.params;
    const recipe = await getRecipeDetails(recipeId);
    
    if (!recipe) {
      return res.status(404).json({ error: 'Recipe not found' });
    }
    
    res.json(recipe);
  } catch (error) {
    console.error('Error fetching recipe details:', error);
    res.status(500).json({ error: 'Failed to fetch recipe details' });
  }
});

// Search recipes
router.get('/search', async (req, res) => {
  try {
    const { query, diet, type } = req.query;
    // Implement recipe search logic
    res.json({ message: 'Recipe search not implemented yet' });
  } catch (error) {
    console.error('Error searching recipes:', error);
    res.status(500).json({ error: 'Failed to search recipes' });
  }
});

module.exports = router;