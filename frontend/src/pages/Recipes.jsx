import React, { useState, useEffect } from 'react';
import { Search, Clock, Users, Star } from 'lucide-react';

const Recipes = ({ deals, preferences }) => {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    loadRecipes();
  }, [deals, preferences]);

  const loadRecipes = async () => {
    setLoading(true);
    // Mock recipes for now
    const mockRecipes = [
      {
        id: 1,
        title: "Grilled Salmon with Spinach",
        image: "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=300",
        cookTime: 25,
        servings: 4,
        rating: 4.8,
        ingredients: ["Atlantic Salmon", "Baby Spinach", "Lemon", "Olive Oil"],
        dealIngredients: ["Atlantic Salmon", "Baby Spinach"],
        description: "Fresh salmon grilled to perfection with sautéed spinach"
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
        description: "Healthy bowl with grilled chicken and creamy avocado"
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
        description: "Quick and healthy breakfast or snack option"
      }
    ];
    
    setTimeout(() => {
      setRecipes(mockRecipes);
      setLoading(false);
    }, 1000);
  };

  const filteredRecipes = recipes.filter(recipe =>
    recipe.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
    recipe.ingredients.some(ingredient => 
      ingredient.toLowerCase().includes(searchQuery.toLowerCase())
    )
  );

  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-4">
          Recipe Suggestions
        </h1>
        <p className="text-gray-600 mb-6">
          Recipes featuring this week's discounted ingredients
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
      </div>

      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">Finding the best recipes...</p>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
          {filteredRecipes.map(recipe => (
            <RecipeCard key={recipe.id} recipe={recipe} />
          ))}
        </div>
      )}

      {!loading && filteredRecipes.length === 0 && (
        <div className="text-center py-12">
          <p className="text-gray-600">No recipes found matching your search.</p>
        </div>
      )}
    </div>
  );
};

const RecipeCard = ({ recipe }) => {
  const savings = recipe.dealIngredients.length;
  
  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition-shadow">
      <img 
        src={recipe.image} 
        alt={recipe.title}
        className="w-full h-48 object-cover"
      />
      
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900">{recipe.title}</h3>
          {savings > 0 && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded">
              ${savings} saves
            </span>
          )}
        </div>
        
        <p className="text-gray-600 text-sm mb-3">{recipe.description}</p>
        
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
        
        <button className="w-full mt-4 bg-primary-500 text-white py-2 rounded-md hover:bg-primary-600 transition-colors">
          View Recipe
        </button>
      </div>
    </div>
  );
};

export default Recipes;