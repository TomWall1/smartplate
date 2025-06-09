import React, { useState, useEffect } from 'react';
import { Search, Clock, Users, Star, Wifi, WifiOff } from 'lucide-react';
import { recipesApi } from '../services/api';

const Recipes = ({ deals, preferences, apiStatus }) => {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);

  useEffect(() => {
    if (deals.length > 0) {
      loadRecipes();
    }
  }, [deals, preferences]);

  const loadRecipes = async () => {
    setLoading(true);
    setError(null);
    
    try {
      if (apiStatus === 'connected') {
        // Extract ingredient names from deals
        const dealIngredients = deals.map(deal => deal.name);
        const pantryItems = preferences.pantryItems || [];
        
        const recipesData = await recipesApi.getRecipeSuggestions(
          dealIngredients, 
          preferences, 
          pantryItems
        );
        
        setRecipes(recipesData);
        console.log(`Loaded ${recipesData.length} recipes from API`);
      } else {
        // Use mock data when API is not available
        setRecipes(getMockRecipes());
      }
    } catch (error) {
      console.error('Error loading recipes:', error);
      setError('Failed to load recipe suggestions');
      setRecipes(getMockRecipes());
    } finally {
      setLoading(false);
    }
  };

  const getMockRecipes = () => {
    return [
      {
        id: 1,
        title: "Grilled Salmon with Spinach",
        image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=300",
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
        image: "https://images.unsplash.com/photo-1512058564366-18510be2db19?w=300",
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
        image: "https://images.unsplash.com/photo-1488477181946-6428a0291777?w=300",
        cookTime: 5,
        servings: 1,
        rating: 4.4,
        ingredients: ["Greek Yogurt", "Mixed Berries", "Granola", "Honey"],
        dealIngredients: ["Greek Yogurt"],
        description: "Quick and healthy breakfast or snack option",
        sourceUrl: "#"
      }
    ];
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.ingredients.some(ingredient => 
      ingredient.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  const handleRecipeClick = async (recipe) => {
    if (apiStatus === 'connected' && recipe.sourceUrl && recipe.sourceUrl !== '#') {
      window.open(recipe.sourceUrl, '_blank');
    } else {
      alert(`Recipe: ${recipe.title}\n\nIngredients: ${recipe.ingredients.join(', ')}\n\nDescription: ${recipe.description}`);
    }
  };

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Recipe Suggestions
          {apiStatus === 'connected' && (
            <span className="inline-flex items-center ml-2 text-sm text-green-600">
              <Wifi className="w-4 h-4 mr-1" />
              Live API
            </span>
          )}
          {apiStatus === 'disconnected' && (
            <span className="inline-flex items-center ml-2 text-sm text-yellow-600">
              <WifiOff className="w-4 h-4 mr-1" />
              Demo Mode
            </span>
          )}
        </h1>
        <p className="text-gray-600 mb-6">
          {apiStatus === 'connected' 
            ? 'AI-powered recipes featuring this week\'s discounted ingredients'
            : 'Sample recipes based on typical supermarket deals'
          }
        </p>
        
        <div className="max-w-md mx-auto">
          <div className="relative">
            <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
            <input
              type="text"
              placeholder="Search recipes or ingredients..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
            />
          </div>
        </div>
        
        {error && (
          <div className="mt-4 text-sm text-red-600 bg-red-50 p-3 rounded-lg">
            {error} - Showing sample recipes instead
          </div>
        )}
      </div>

      <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
        <h3 className="font-medium text-blue-900 mb-2">Based on your deals:</h3>
        <div className="flex flex-wrap gap-2">
          {deals.slice(0, 6).map((deal, index) => (
            <span key={index} className="bg-blue-100 text-blue-800 text-sm px-3 py-1 rounded-full">
              {deal.name}
            </span>
          ))}
          {deals.length > 6 && (
            <span className="text-blue-600 text-sm">+{deals.length - 6} more</span>
          )}
        </div>
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">
            {apiStatus === 'connected' ? 'Finding the best recipes...' : 'Loading sample recipes...'}
          </p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map(recipe => (
            <RecipeCard 
              key={recipe.id} 
              recipe={recipe} 
              onClick={() => handleRecipeClick(recipe)}
              apiStatus={apiStatus}
            />
          ))}
        </div>
      )}

      {!loading && filteredRecipes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No recipes found matching your search.</p>
          <button
            onClick={() => setSearchQuery('')}
            className="mt-2 text-primary-500 hover:text-primary-600"
          >
            Clear search
          </button>
        </div>
      )}
      
      {apiStatus === 'connected' && (
        <div className="text-center">
          <button
            onClick={loadRecipes}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 bg-primary-500 text-white rounded-md hover:bg-primary-600 disabled:opacity-50"
          >
            {loading ? 'Loading...' : 'Refresh Recipes'}
          </button>
        </div>
      )}
    </div>
  );
};

const RecipeCard = ({ recipe, onClick, apiStatus }) => {
  const savings = recipe.dealIngredients ? recipe.dealIngredients.length : 0;
  
  return (
    <div 
      className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition-shadow cursor-pointer"
      onClick={onClick}
    >
      <img 
        src={recipe.image} 
        alt={recipe.title}
        className="w-full h-48 object-cover"
        onError={(e) => {
          e.target.src = 'https://images.unsplash.com/photo-1546549032-9571cd6b27df?w=300&h=200&fit=crop';
        }}
      />
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{recipe.title}</h3>
          {savings > 0 && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded flex-shrink-0">
              {savings} deal{savings > 1 ? 's' : ''}
            </span>
          )}
        </div>
        
        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{recipe.description}</p>
        
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <div className="flex items-center space-x-1">
            <Clock className="w-4 h-4" />
            <span>{recipe.cookTime} min</span>
          </div>
          <div className="flex items-center space-x-1">
            <Users className="w-4 h-4" />
            <span>{recipe.servings} servings</span>
          </div>
          <div className="flex items-center space-x-1">
            <Star className="w-4 h-4 fill-yellow-400 text-yellow-400" />
            <span>{recipe.rating}</span>
          </div>
        </div>
        
        {recipe.dealIngredients && recipe.dealIngredients.length > 0 && (
          <div className="space-y-2">
            <p className="text-xs font-medium text-gray-700">Deal Ingredients:</p>
            <div className="flex flex-wrap gap-1">
              {recipe.dealIngredients.map((ingredient, index) => (
                <span key={index} className="bg-green-50 text-green-700 text-xs px-2 py-1 rounded">
                  {ingredient}
                </span>
              ))}
            </div>
          </div>
        )}
        
        <div className="mt-4">
          <button className="w-full bg-primary-500 text-white py-2 rounded-md hover:bg-primary-600 transition-colors">
            {apiStatus === 'connected' ? 'View Recipe' : 'View Details'}
          </button>
        </div>
      </div>
    </div>
  );
};

export default Recipes;