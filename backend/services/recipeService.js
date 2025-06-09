const axios = require('axios');

class RecipeService {
  constructor() {
    this.spoonacularApiKey = process.env.SPOONACULAR_API_KEY;
    this.baseURL = 'https://api.spoonacular.com/recipes';
  }

  async findRecipesByIngredients(ingredients, preferences = {}) {
    try {
      console.log('Finding recipes for ingredients:', ingredients);
      
      if (!this.spoonacularApiKey) {
        console.log('No Spoonacular API key found, using mock data');
        return this.getMockRecipes(preferences);
      }

      // Clean up ingredients list - take first word of each ingredient for better matching
      const cleanIngredients = ingredients
        .map(ingredient => ingredient.split(' ')[0].toLowerCase())
        .slice(0, 5); // Limit to 5 ingredients to avoid long URLs
      
      const params = {
        apiKey: this.spoonacularApiKey,
        includeIngredients: cleanIngredients.join(','),
        number: 12,
        ranking: 2, // Maximize used ingredients
        fillIngredients: true,
        addRecipeInformation: true,
        instructionsRequired: true
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

      const response = await axios.get(`${this.baseURL}/complexSearch`, { params });
      
      if (response.data && response.data.results) {
        const recipes = response.data.results.map(recipe => ({
          id: recipe.id,
          title: recipe.title,
          image: recipe.image,
          cookTime: recipe.readyInMinutes || 30,
          servings: recipe.servings || 4,
          rating: recipe.spoonacularScore ? (recipe.spoonacularScore / 20) : 4.0, // Convert to 5-star scale
          ingredients: recipe.extendedIngredients ? 
            recipe.extendedIngredients.map(ing => ing.original) : [],
          dealIngredients: this.findDealIngredients(recipe.extendedIngredients, ingredients),
          description: recipe.summary ? this.stripHtml(recipe.summary).substring(0, 150) + '...' : 'A delicious recipe',
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
        
        return recipes;
      }
      
      return this.getMockRecipes(preferences);
    } catch (error) {
      console.error('Error finding recipes:', error);
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

      const response = await axios.get(`${this.baseURL}/${recipeId}/information`, { params });
      
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
      console.error('Error fetching recipe details:', error);
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

      const response = await axios.get(`${this.baseURL}/complexSearch`, { params });
      
      return response.data.results || [];
    } catch (error) {
      console.error('Error searching recipes:', error);
      return [];
    }
  }

  findDealIngredients(recipeIngredients, dealIngredients) {
    if (!recipeIngredients) return [];
    
    const dealIngredientsLower = dealIngredients.map(ing => ing.toLowerCase());
    const matches = [];
    
    recipeIngredients.forEach(ingredient => {
      const ingredientName = ingredient.name || ingredient.original || '';
      dealIngredientsLower.forEach(dealIng => {
        if (ingredientName.toLowerCase().includes(dealIng) || dealIng.includes(ingredientName.toLowerCase())) {
          // Find the original deal ingredient name
          const originalDealIng = dealIngredients.find(di => 
            di.toLowerCase() === dealIng || 
            ingredientName.toLowerCase().includes(di.toLowerCase())
          );
          if (originalDealIng && !matches.includes(originalDealIng)) {
            matches.push(originalDealIng);
          }
        }
      });
    });
    
    return matches;
  }

  stripHtml(html) {
    return html ? html.replace(/<[^>]*>/g, '') : '';
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
        description: "Quick and flavorful stir fry with tender beef",
        instructions: "1. Brown beef mince in hot pan. 2. Add vegetables and stir fry. 3. Season with soy sauce, garlic, and ginger. 4. Serve hot.",
        nutrition: {
          calories: 380,
          protein: 25,
          carbs: 15,
          fat: 22
        }
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