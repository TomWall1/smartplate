const axios = require('axios');

class RecipeService {
  constructor() {
    this.spoonacularApiKey = process.env.SPOONACULAR_API_KEY;
    this.baseURL = 'https://api.spoonacular.com/recipes';
  }

  async findRecipesByIngredients(ingredients, preferences = {}) {
    try {
      // For MVP, return mock recipes
      // TODO: Implement actual Spoonacular API integration
      console.log('Finding recipes for ingredients:', ingredients);
      
      const mockRecipes = [
        {
          id: 1,
          title: "Grilled Salmon with Spinach",
          image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400",
          cookTime: 25,
          servings: 4,
          rating: 4.8,
          ingredients: ["Atlantic Salmon", "Baby Spinach", "Lemon", "Olive Oil", "Garlic"],
          dealIngredients: ["Atlantic Salmon", "Baby Spinach", "Olive Oil"],
          description: "Fresh salmon grilled to perfection with sautéed spinach",
          instructions: "1. Season salmon with salt and pepper. 2. Heat oil in pan. 3. Cook salmon 4-5 minutes per side. 4. Sauté spinach with garlic. 5. Serve together.",
          nutrition: {
            calories: 320,
            protein: 28,
            carbs: 8,
            fat: 20
          }
        },
        {
          id: 2,
          title: "Chicken Avocado Bowl",
          image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400",
          cookTime: 20,
          servings: 2,
          rating: 4.6,
          ingredients: ["Chicken Breast", "Avocados", "Brown Rice", "Greek Yogurt", "Lime"],
          dealIngredients: ["Chicken Breast", "Avocados", "Brown Rice", "Greek Yogurt"],
          description: "Healthy bowl with grilled chicken and creamy avocado",
          instructions: "1. Cook rice according to package instructions. 2. Season and grill chicken. 3. Slice avocado. 4. Assemble bowl with rice, chicken, avocado, and yogurt.",
          nutrition: {
            calories: 450,
            protein: 35,
            carbs: 35,
            fat: 18
          }
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
          instructions: "1. Layer yogurt in glass. 2. Add berries. 3. Top with granola. 4. Drizzle with honey.",
          nutrition: {
            calories: 280,
            protein: 15,
            carbs: 35,
            fat: 8
          }
        }
      ];
      
      // Filter based on preferences
      let filteredRecipes = mockRecipes;
      
      if (preferences.dietary && preferences.dietary.length > 0) {
        // Simple filtering logic for demo
        if (preferences.dietary.includes('vegetarian')) {
          filteredRecipes = filteredRecipes.filter(recipe => 
            !recipe.ingredients.some(ing => 
              ['chicken', 'beef', 'salmon', 'fish', 'meat'].some(meat => 
                ing.toLowerCase().includes(meat)
              )
            )
          );
        }
      }
      
      return filteredRecipes;
    } catch (error) {
      console.error('Error finding recipes:', error);
      return [];
    }
  }

  async getRecipeDetails(recipeId) {
    try {
      // For MVP, return mock data
      // TODO: Implement actual recipe details fetching
      return {
        id: recipeId,
        title: "Sample Recipe",
        description: "A delicious recipe",
        instructions: "Cook it well",
        ingredients: [],
        nutrition: {}
      };
    } catch (error) {
      console.error('Error fetching recipe details:', error);
      return null;
    }
  }

  async searchRecipes(query, preferences = {}) {
    try {
      // TODO: Implement recipe search
      return [];
    } catch (error) {
      console.error('Error searching recipes:', error);
      return [];
    }
  }
}

module.exports = new RecipeService();