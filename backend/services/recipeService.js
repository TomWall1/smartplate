const axios = require('axios');

class RecipeService {
  constructor() {
    this.spoonacularApiKey = process.env.SPOONACULAR_API_KEY;
    this.baseURL = 'https://api.spoonacular.com/recipes';
  }

  async findRecipesByIngredients(ingredients, preferences = {}) {
    try {
      console.log('RecipeService: Finding recipes for ingredients:', ingredients?.slice(0, 3));
      console.log('RecipeService: Has API key:', !!this.spoonacularApiKey);
      
      if (!ingredients || ingredients.length === 0) {
        console.log('RecipeService: No ingredients provided, returning mock recipes');
        return this.getMockRecipes(preferences);
      }
      
      if (!this.spoonacularApiKey) {
        console.log('RecipeService: No Spoonacular API key, using mock data');
        return this.getMockRecipes(preferences);
      }

      // Clean up ingredients list - take first word of each ingredient for better matching
      const cleanIngredients = ingredients
        .filter(ing => ing && typeof ing === 'string')
        .map(ingredient => ingredient.split(' ')[0].toLowerCase().replace(/[^a-z]/g, ''))
        .filter(ing => ing.length > 2) // Remove very short words
        .slice(0, 5); // Limit to 5 ingredients to avoid long URLs
      
      console.log('RecipeService: Clean ingredients:', cleanIngredients);
      
      if (cleanIngredients.length === 0) {
        console.log('RecipeService: No valid ingredients after cleaning, using mock data');
        return this.getMockRecipes(preferences);
      }
      
      const params = {
        apiKey: this.spoonacularApiKey,
        includeIngredients: cleanIngredients.join(','),
        number: 12,
        ranking: 2, // Maximize used ingredients
        fillIngredients: true,
        addRecipeInformation: true,
        instructionsRequired: false // Don't require instructions to get more results
      };

      // Add dietary filters if specified
      if (preferences.dietary && preferences.dietary.length > 0) {
        if (preferences.dietary.includes('vegetarian')) params.diet = 'vegetarian';
        if (preferences.dietary.includes('vegan')) params.diet = 'vegan';
        if (preferences.dietary.includes('gluten-free')) params.intolerances = 'gluten';
        if (preferences.dietary.includes('dairy-free')) {
          params.intolerances = params.intolerances ? `${params.intolerances},dairy` : 'dairy';
        }
      }

      console.log('RecipeService: Making API request with params:', { 
        ...params, 
        apiKey: '[HIDDEN]' 
      });
      
      const response = await axios.get(`${this.baseURL}/complexSearch`, { 
        params,
        timeout: 10000 // 10 second timeout
      });
      
      console.log('RecipeService: API response status:', response.status);
      console.log('RecipeService: Found recipes count:', response.data?.results?.length || 0);
      
      if (response.data && response.data.results && response.data.results.length > 0) {
        const recipes = response.data.results.map(recipe => ({
          id: recipe.id,
          title: recipe.title,
          image: recipe.image || 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=400',
          cookTime: recipe.readyInMinutes || 30,
          servings: recipe.servings || 4,
          rating: recipe.spoonacularScore ? Math.round((recipe.spoonacularScore / 20) * 10) / 10 : 4.0,
          ingredients: recipe.extendedIngredients ? 
            recipe.extendedIngredients.map(ing => ing.original || ing.name) : [],
          dealIngredients: this.findDealIngredients(recipe.extendedIngredients, ingredients),
          description: recipe.summary ? this.stripHtml(recipe.summary).substring(0, 150) + '...' : 
            'A delicious recipe featuring your deal ingredients',
          instructions: recipe.analyzedInstructions && recipe.analyzedInstructions[0] ? 
            recipe.analyzedInstructions[0].steps.map(step => step.step).join(' ') : 
            'Instructions available on recipe page',
          nutrition: {
            calories: recipe.nutrition?.nutrients?.find(n => n.name === 'Calories')?.amount || 0,
            protein: recipe.nutrition?.nutrients?.find(n => n.name === 'Protein')?.amount || 0,
            carbs: recipe.nutrition?.nutrients?.find(n => n.name === 'Carbohydrates')?.amount || 0,
            fat: recipe.nutrition?.nutrients?.find(n => n.name === 'Fat')?.amount || 0
          },
          sourceUrl: recipe.sourceUrl,
          healthScore: recipe.healthScore,
          cheap: recipe.cheap,
          dairyFree: recipe.dairyFree,
          glutenFree: recipe.glutenFree,
          vegan: recipe.vegan,
          vegetarian: recipe.vegetarian
        }));
        
        console.log('RecipeService: Successfully processed recipes');
        return recipes;
      } else {
        console.log('RecipeService: No recipes found in API response, using mock data');
        return this.getMockRecipes(preferences);
      }
      
    } catch (error) {
      console.error('RecipeService: Error finding recipes:', error.message);
      if (error.response) {
        console.error('RecipeService: API response status:', error.response.status);
        console.error('RecipeService: API response data:', error.response.data);
      }
      console.log('RecipeService: Falling back to mock data');
      return this.getMockRecipes(preferences);
    }
  }

  async getRecipeDetails(recipeId) {
    try {
      if (!this.spoonacularApiKey) {
        return this.getMockRecipeDetails(recipeId);
      }

      const params = {
        apiKey: this.spoonacularApiKey,
        includeNutrition: true,
        addWinePairing: false,
        addTasteData: false
      };

      const response = await axios.get(`${this.baseURL}/${recipeId}/information`, { 
        params,
        timeout: 10000
      });
      
      if (response.data) {
        const recipe = response.data;
        return {
          id: recipe.id,
          title: recipe.title,
          image: recipe.image,
          description: this.stripHtml(recipe.summary),
          instructions: recipe.analyzedInstructions && recipe.analyzedInstructions[0] ? 
            recipe.analyzedInstructions[0].steps : [],
          ingredients: recipe.extendedIngredients || [],
          cookTime: recipe.readyInMinutes,
          servings: recipe.servings,
          nutrition: recipe.nutrition,
          sourceUrl: recipe.sourceUrl,
          healthScore: recipe.healthScore
        };
      }
      
      return null;
    } catch (error) {
      console.error('RecipeService: Error fetching recipe details:', error.message);
      return this.getMockRecipeDetails(recipeId);
    }
  }

  async searchRecipes(query, preferences = {}) {
    try {
      if (!this.spoonacularApiKey) {
        return this.getMockRecipes(preferences);
      }

      const params = {
        apiKey: this.spoonacularApiKey,
        query: query,
        number: 12,
        addRecipeInformation: true,
        fillIngredients: true
      };

      // Add dietary filters
      if (preferences.dietary && preferences.dietary.length > 0) {
        if (preferences.dietary.includes('vegetarian')) params.diet = 'vegetarian';
        if (preferences.dietary.includes('vegan')) params.diet = 'vegan';
        if (preferences.dietary.includes('gluten-free')) params.intolerances = 'gluten';
      }

      const response = await axios.get(`${this.baseURL}/complexSearch`, { 
        params,
        timeout: 10000
      });
      
      return response.data.results || [];
    } catch (error) {
      console.error('RecipeService: Error searching recipes:', error.message);
      return [];
    }
  }

  findDealIngredients(recipeIngredients, dealIngredients) {
    if (!recipeIngredients || !dealIngredients) return [];
    
    const dealIngredientsLower = dealIngredients.map(ing => ing.toLowerCase());
    const matches = [];
    
    recipeIngredients.forEach(ingredient => {
      const ingredientName = (ingredient.name || ingredient.original || '').toLowerCase();
      dealIngredientsLower.forEach((dealIng, index) => {
        if (ingredientName.includes(dealIng.toLowerCase()) || 
            dealIng.toLowerCase().includes(ingredientName)) {
          const originalDealIng = dealIngredients[index];
          if (originalDealIng && !matches.includes(originalDealIng)) {
            matches.push(originalDealIng);
          }
        }
      });
    });
    
    return matches;
  }

  stripHtml(html) {
    return html ? html.replace(/<[^>]*>/g, '').replace(/&[^;]+;/g, ' ').trim() : '';
  }

  getMockRecipes(preferences = {}) {
    let mockRecipes = [
      {
        id: 1,
        title: "Grilled Salmon with Spinach",
        image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=400",
        cookTime: 25,
        servings: 4,
        rating: 4.8,
        ingredients: ["Atlantic Salmon", "Baby Spinach", "Lemon", "Olive Oil", "Garlic"],
        dealIngredients: ["Atlantic Salmon", "Baby Spinach"],
        description: "Fresh salmon grilled to perfection with sautéed spinach and lemon",
        instructions: "Season salmon with salt and pepper. Heat oil in pan. Cook salmon 4-5 minutes per side. Sauté spinach with garlic. Serve together.",
        nutrition: { calories: 320, protein: 28, carbs: 8, fat: 20 },
        sourceUrl: "#"
      },
      {
        id: 2,
        title: "Chicken Avocado Bowl",
        image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=400",
        cookTime: 20,
        servings: 2,
        rating: 4.6,
        ingredients: ["Chicken Breast", "Avocados", "Brown Rice", "Greek Yogurt", "Lime"],
        dealIngredients: ["Chicken Breast", "Avocados", "Greek Yogurt"],
        description: "Healthy bowl with grilled chicken, creamy avocado and Greek yogurt",
        instructions: "Cook rice according to package instructions. Season and grill chicken. Slice avocado. Assemble bowl with rice, chicken, avocado, and yogurt.",
        nutrition: { calories: 450, protein: 35, carbs: 35, fat: 18 },
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
        description: "Quick and healthy breakfast parfait with fresh berries",
        instructions: "Layer yogurt in glass. Add berries. Top with granola. Drizzle with honey.",
        nutrition: { calories: 280, protein: 15, carbs: 35, fat: 8 },
        sourceUrl: "#"
      },
      {
        id: 4,
        title: "Beef and Vegetable Stir Fry",
        image: "https://images.unsplash.com/photo-1603133872878-684f208fb84b?w=400",
        cookTime: 15,
        servings: 3,
        rating: 4.5,
        ingredients: ["Beef Mince", "Mixed Vegetables", "Soy Sauce", "Garlic", "Ginger"],
        dealIngredients: ["Beef Mince"],
        description: "Quick and flavorful stir fry with tender beef and fresh vegetables",
        instructions: "Brown beef mince in hot pan. Add vegetables and stir fry. Season with soy sauce, garlic, and ginger. Serve hot.",
        nutrition: { calories: 380, protein: 25, carbs: 15, fat: 22 },
        sourceUrl: "#"
      },
      {
        id: 5,
        title: "Sweet Potato and Egg Bowl",
        image: "https://images.unsplash.com/photo-1482049016688-2d3e1b311543?w=400",
        cookTime: 30,
        servings: 2,
        rating: 4.3,
        ingredients: ["Sweet Potato", "Organic Eggs", "Spinach", "Olive Oil"],
        dealIngredients: ["Sweet Potato", "Organic Eggs"],
        description: "Nutritious bowl with roasted sweet potato and perfectly cooked eggs",
        instructions: "Roast sweet potato cubes. Fry or poach eggs. Serve over spinach with olive oil drizzle.",
        nutrition: { calories: 340, protein: 18, carbs: 28, fat: 16 },
        sourceUrl: "#"
      },
      {
        id: 6,
        title: "Greek Yogurt Chicken Marinade",
        image: "https://images.unsplash.com/photo-1532636721035-f3fc20e4bb12?w=400",
        cookTime: 35,
        servings: 4,
        rating: 4.7,
        ingredients: ["Free Range Chicken Breast", "Greek Style Yogurt", "Lemon", "Herbs"],
        dealIngredients: ["Free Range Chicken Breast", "Greek Style Yogurt"],
        description: "Tender chicken marinated in Greek yogurt with herbs and lemon",
        instructions: "Marinate chicken in yogurt, lemon and herbs for 2 hours. Grill until cooked through.",
        nutrition: { calories: 290, protein: 32, carbs: 8, fat: 14 },
        sourceUrl: "#"
      }
    ];
    
    // Filter based on preferences
    if (preferences.dietary && preferences.dietary.length > 0) {
      if (preferences.dietary.includes('vegetarian')) {
        mockRecipes = mockRecipes.filter(recipe => 
          !recipe.ingredients.some(ing => 
            ['chicken', 'beef', 'salmon', 'fish', 'meat'].some(meat => 
              ing.toLowerCase().includes(meat)
            )
          )
        );
      }
    }
    
    console.log('RecipeService: Returning', mockRecipes.length, 'mock recipes');
    return mockRecipes;
  }

  getMockRecipeDetails(recipeId) {
    const mockRecipes = this.getMockRecipes();
    return mockRecipes.find(recipe => recipe.id == recipeId) || {
      id: recipeId,
      title: "Sample Recipe",
      description: "A delicious recipe",
      instructions: "Cook it well",
      ingredients: [],
      nutrition: {}
    };
  }
}

module.exports = new RecipeService();