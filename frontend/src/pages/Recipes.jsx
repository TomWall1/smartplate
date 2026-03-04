import React, { useState, useEffect } from 'react';
import { Search, Clock, Users, DollarSign, ChevronDown, ChevronUp, X, Plus, SlidersHorizontal, Tag, Sparkles } from 'lucide-react';
import { recipesApi } from '../services/api';

const Recipes = ({ deals, preferences, apiStatus }) => {
  const [recipes, setRecipes] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [error, setError] = useState(null);
  const [expandedRecipe, setExpandedRecipe] = useState(null);
  const [showFilters, setShowFilters] = useState(false);

  // Local preferences state for the inline form
  const [localPrefs, setLocalPrefs] = useState({
    dietary: preferences.dietary || [],
    maxPrepTime: '',
    budget: '',
    pantryItems: preferences.pantryItems || [],
    excludeIngredients: preferences.dislikes || [],
  });
  const [newPantryItem, setNewPantryItem] = useState('');
  const [newExclude, setNewExclude] = useState('');
  const [isPersonalised, setIsPersonalised] = useState(false);

  useEffect(() => {
    loadRecipes();
  }, [apiStatus]);

  // Sync from parent preferences when they change
  useEffect(() => {
    setLocalPrefs(prev => ({
      ...prev,
      dietary: preferences.dietary || [],
      pantryItems: preferences.pantryItems || [],
      excludeIngredients: preferences.dislikes || [],
    }));
  }, [preferences]);

  const loadRecipes = async (withPreferences = false) => {
    setLoading(true);
    setError(null);

    try {
      const dealIngredients = deals.map(deal => deal.name);
      const pantryItems = localPrefs.pantryItems;

      let prefsToSend = {};
      if (withPreferences) {
        prefsToSend = {};
        if (localPrefs.dietary.length > 0) prefsToSend.dietary = localPrefs.dietary;
        if (localPrefs.maxPrepTime) prefsToSend.maxPrepTime = parseInt(localPrefs.maxPrepTime);
        if (localPrefs.budget) prefsToSend.budget = localPrefs.budget;
        if (localPrefs.excludeIngredients.length > 0) prefsToSend.excludeIngredients = localPrefs.excludeIngredients;
      }

      const recipesData = await recipesApi.getRecipeSuggestions(
        dealIngredients,
        prefsToSend,
        withPreferences ? pantryItems : []
      );

      setRecipes(recipesData);
      setIsPersonalised(withPreferences);
      console.log(`Loaded ${recipesData.length} recipes${withPreferences ? ' (personalised)' : ''}`);
    } catch (err) {
      console.error('Error loading recipes:', err);
      setError('Failed to load recipes. Showing cached results.');
    } finally {
      setLoading(false);
    }
  };

  const handleApplyFilters = () => {
    loadRecipes(true);
  };

  const handleClearFilters = () => {
    setLocalPrefs({
      dietary: [],
      maxPrepTime: '',
      budget: '',
      pantryItems: [],
      excludeIngredients: [],
    });
    loadRecipes(false);
  };

  const toggleDietary = (id) => {
    setLocalPrefs(prev => ({
      ...prev,
      dietary: prev.dietary.includes(id)
        ? prev.dietary.filter(d => d !== id)
        : [...prev.dietary, id],
    }));
  };

  const addPantryItem = () => {
    if (newPantryItem.trim()) {
      setLocalPrefs(prev => ({
        ...prev,
        pantryItems: [...prev.pantryItems, newPantryItem.trim()],
      }));
      setNewPantryItem('');
    }
  };

  const addExclude = () => {
    if (newExclude.trim()) {
      setLocalPrefs(prev => ({
        ...prev,
        excludeIngredients: [...prev.excludeIngredients, newExclude.trim()],
      }));
      setNewExclude('');
    }
  };

  const filteredRecipes = recipes.filter(recipe => {
    if (!searchQuery) return true;
    const q = searchQuery.toLowerCase();
    return (
      recipe.title?.toLowerCase().includes(q) ||
      recipe.description?.toLowerCase().includes(q) ||
      recipe.dealIngredients?.some(i => i.toLowerCase().includes(q)) ||
      recipe.allIngredients?.some(i => i.toLowerCase().includes(q)) ||
      recipe.tags?.some(t => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="text-center">
        <h1 className="text-3xl font-bold text-gray-900 mb-2">
          Recipe Suggestions
        </h1>
        <p className="text-gray-600 mb-4">
          {isPersonalised
            ? 'Personalised recipes ranked for your preferences'
            : "This week's recipes built around supermarket specials"}
        </p>
      </div>

      {/* Search + Filter toggle */}
      <div className="flex items-center gap-3 max-w-2xl mx-auto">
        <div className="relative flex-1">
          <Search className="w-5 h-5 absolute left-3 top-1/2 transform -translate-y-1/2 text-gray-400" />
          <input
            type="text"
            placeholder="Search recipes, ingredients, or tags..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>
        <button
          onClick={() => setShowFilters(!showFilters)}
          className={`flex items-center gap-2 px-4 py-2 rounded-lg border transition-colors ${
            showFilters ? 'bg-blue-50 border-blue-300 text-blue-700' : 'border-gray-300 text-gray-700 hover:bg-gray-50'
          }`}
        >
          <SlidersHorizontal className="w-4 h-4" />
          <span className="hidden sm:inline">Preferences</span>
        </button>
      </div>

      {/* Preferences panel */}
      {showFilters && (
        <div className="max-w-2xl mx-auto bg-white border border-gray-200 rounded-lg p-5 space-y-4 shadow-sm">
          <h3 className="font-semibold text-gray-900 flex items-center gap-2">
            <Sparkles className="w-4 h-4 text-blue-500" />
            Personalise your recipes
          </h3>
          <p className="text-sm text-gray-500">
            Set your preferences and click "Apply" to get AI-ranked recipes tailored to you.
          </p>

          {/* Dietary */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Dietary restrictions</label>
            <div className="flex flex-wrap gap-2">
              {['vegetarian', 'vegan', 'gluten-free', 'dairy-free'].map(id => (
                <button
                  key={id}
                  onClick={() => toggleDietary(id)}
                  className={`px-3 py-1 rounded-full text-sm border transition-colors ${
                    localPrefs.dietary.includes(id)
                      ? 'bg-blue-100 border-blue-300 text-blue-800'
                      : 'bg-white border-gray-300 text-gray-600 hover:bg-gray-50'
                  }`}
                >
                  {id.charAt(0).toUpperCase() + id.slice(1)}
                </button>
              ))}
            </div>
          </div>

          {/* Max prep time + Budget */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Max prep time</label>
              <select
                value={localPrefs.maxPrepTime}
                onChange={(e) => setLocalPrefs(prev => ({ ...prev, maxPrepTime: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Any</option>
                <option value="15">15 min</option>
                <option value="30">30 min</option>
                <option value="45">45 min</option>
                <option value="60">60 min</option>
              </select>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1">Budget</label>
              <select
                value={localPrefs.budget}
                onChange={(e) => setLocalPrefs(prev => ({ ...prev, budget: e.target.value }))}
                className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              >
                <option value="">Any</option>
                <option value="low">Budget-friendly</option>
                <option value="medium">Medium</option>
                <option value="high">No limit</option>
              </select>
            </div>
          </div>

          {/* Pantry items */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Ingredients I have at home</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newPantryItem}
                onChange={(e) => setNewPantryItem(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addPantryItem()}
                placeholder="e.g. rice, eggs, soy sauce..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button onClick={addPantryItem} className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {localPrefs.pantryItems.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-blue-50 text-blue-700 text-xs px-2 py-1 rounded-full">
                  {item}
                  <button onClick={() => setLocalPrefs(prev => ({
                    ...prev,
                    pantryItems: prev.pantryItems.filter((_, idx) => idx !== i),
                  }))} className="text-blue-500 hover:text-blue-700">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Exclude ingredients */}
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1">Ingredients to avoid</label>
            <div className="flex gap-2 mb-2">
              <input
                type="text"
                value={newExclude}
                onChange={(e) => setNewExclude(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && addExclude()}
                placeholder="e.g. mushrooms, anchovies..."
                className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <button onClick={addExclude} className="px-3 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600">
                <Plus className="w-4 h-4" />
              </button>
            </div>
            <div className="flex flex-wrap gap-1">
              {localPrefs.excludeIngredients.map((item, i) => (
                <span key={i} className="inline-flex items-center gap-1 bg-red-50 text-red-700 text-xs px-2 py-1 rounded-full">
                  {item}
                  <button onClick={() => setLocalPrefs(prev => ({
                    ...prev,
                    excludeIngredients: prev.excludeIngredients.filter((_, idx) => idx !== i),
                  }))} className="text-red-500 hover:text-red-700">
                    <X className="w-3 h-3" />
                  </button>
                </span>
              ))}
            </div>
          </div>

          {/* Action buttons */}
          <div className="flex gap-3 pt-2">
            <button
              onClick={handleApplyFilters}
              disabled={loading}
              className="flex-1 px-4 py-2 bg-blue-500 text-white rounded-md hover:bg-blue-600 disabled:opacity-50 transition-colors font-medium"
            >
              {loading ? 'Finding recipes...' : 'Apply & personalise'}
            </button>
            <button
              onClick={handleClearFilters}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-md hover:bg-gray-50 transition-colors"
            >
              Clear all
            </button>
          </div>
        </div>
      )}

      {/* Error */}
      {error && (
        <div className="max-w-2xl mx-auto text-sm text-red-600 bg-red-50 p-3 rounded-lg">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto"></div>
          <p className="text-gray-600 mt-4">
            {isPersonalised ? 'Personalising recipes with AI...' : 'Loading recipes...'}
          </p>
        </div>
      ) : (
        <>
          {/* Results info */}
          {isPersonalised && recipes.length > 0 && (
            <div className="max-w-2xl mx-auto bg-blue-50 border border-blue-200 rounded-lg p-3 text-sm text-blue-800 flex items-center gap-2">
              <Sparkles className="w-4 h-4 flex-shrink-0" />
              Showing {recipes.length} personalised recipe{recipes.length !== 1 ? 's' : ''} ranked by AI for your preferences.
              <button onClick={() => loadRecipes(false)} className="ml-auto underline hover:no-underline">
                Show all
              </button>
            </div>
          )}

          {/* Recipe grid */}
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredRecipes.map(recipe => (
              <RecipeCard
                key={recipe.id}
                recipe={recipe}
                isExpanded={expandedRecipe === recipe.id}
                onToggle={() => setExpandedRecipe(expandedRecipe === recipe.id ? null : recipe.id)}
              />
            ))}
          </div>

          {/* Empty state */}
          {filteredRecipes.length === 0 && (
            <div className="text-center py-12">
              <p className="text-gray-600 mb-2">No recipes found{searchQuery ? ' matching your search' : ''}.</p>
              {searchQuery && (
                <button onClick={() => setSearchQuery('')} className="text-blue-500 hover:text-blue-600">
                  Clear search
                </button>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
};

// ── Recipe Card ──────────────────────────────────────────────────────

const RecipeCard = ({ recipe, isExpanded, onToggle }) => {
  const dealCount = recipe.dealIngredients?.length || 0;

  return (
    <div className="bg-white rounded-lg shadow-sm border overflow-hidden hover:shadow-md transition-shadow">
      {/* Card header */}
      <div className="p-4">
        <div className="flex items-start justify-between mb-2">
          <h3 className="text-lg font-semibold text-gray-900 leading-tight">{recipe.title}</h3>
          {dealCount > 0 && (
            <span className="bg-green-100 text-green-800 text-xs px-2 py-1 rounded-full flex-shrink-0 ml-2 font-medium">
              {dealCount} on special
            </span>
          )}
        </div>

        <p className="text-gray-600 text-sm mb-3 line-clamp-2">{recipe.description}</p>

        {/* Match reason (personalised) */}
        {recipe.matchReason && (
          <div className="text-sm text-blue-700 bg-blue-50 px-3 py-1.5 rounded mb-3 flex items-start gap-1.5">
            <Sparkles className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
            {recipe.matchReason}
          </div>
        )}

        {/* Stats row */}
        <div className="flex items-center justify-between text-sm text-gray-500 mb-3">
          <div className="flex items-center gap-1">
            <Clock className="w-4 h-4" />
            <span>{recipe.prepTime || recipe.cookTime || 30} min</span>
          </div>
          <div className="flex items-center gap-1">
            <Users className="w-4 h-4" />
            <span>{recipe.servings || 4}</span>
          </div>
          {recipe.totalEstimatedCost > 0 && (
            <div className="flex items-center gap-1">
              <DollarSign className="w-4 h-4" />
              <span>${recipe.totalEstimatedCost.toFixed(2)}</span>
            </div>
          )}
          {recipe.estimatedSaving > 0 && (
            <span className="text-green-600 font-medium">
              Save ${recipe.estimatedSaving.toFixed(2)}
            </span>
          )}
        </div>

        {/* Deal ingredients */}
        {dealCount > 0 && (
          <div className="mb-3">
            <p className="text-xs font-medium text-gray-500 mb-1">On special this week:</p>
            <div className="flex flex-wrap gap-1">
              {recipe.dealIngredients.map((ingredient, i) => (
                <span key={i} className="bg-green-50 text-green-700 text-xs px-2 py-0.5 rounded-full border border-green-200">
                  {ingredient}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Tags */}
        {recipe.tags && recipe.tags.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-3">
            {recipe.tags.slice(0, 5).map((tag, i) => (
              <span key={i} className="text-xs text-gray-500 bg-gray-100 px-2 py-0.5 rounded">
                {tag}
              </span>
            ))}
          </div>
        )}

        {/* Expand/collapse button */}
        <button
          onClick={onToggle}
          className="w-full flex items-center justify-center gap-1 py-2 text-sm font-medium text-blue-600 hover:text-blue-700 hover:bg-blue-50 rounded-md transition-colors"
        >
          {isExpanded ? (
            <>Hide details <ChevronUp className="w-4 h-4" /></>
          ) : (
            <>View full recipe <ChevronDown className="w-4 h-4" /></>
          )}
        </button>
      </div>

      {/* Expanded detail */}
      {isExpanded && (
        <div className="border-t bg-gray-50 p-4 space-y-4">
          {/* All ingredients */}
          {recipe.allIngredients && recipe.allIngredients.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Ingredients</h4>
              <ul className="grid grid-cols-1 gap-1">
                {recipe.allIngredients.map((ing, i) => {
                  const isOnSpecial = recipe.dealIngredients?.some(d =>
                    ing.toLowerCase().includes(d.toLowerCase()) ||
                    d.toLowerCase().includes(ing.toLowerCase().split(' ').slice(-2).join(' '))
                  );
                  return (
                    <li key={i} className={`text-sm flex items-start gap-2 ${isOnSpecial ? 'text-green-700 font-medium' : 'text-gray-700'}`}>
                      <span className="mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0" style={{
                        backgroundColor: isOnSpecial ? '#15803d' : '#9ca3af'
                      }} />
                      {ing}
                      {isOnSpecial && (
                        <span className="text-xs bg-green-100 text-green-600 px-1.5 py-0.5 rounded ml-auto flex-shrink-0">
                          on special
                        </span>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
          )}

          {/* Cost summary */}
          {(recipe.totalEstimatedCost > 0 || recipe.estimatedSaving > 0) && (
            <div className="bg-white rounded-md p-3 border border-gray-200">
              <div className="grid grid-cols-2 gap-2 text-sm">
                {recipe.totalEstimatedCost > 0 && (
                  <div>
                    <span className="text-gray-500">Estimated cost</span>
                    <p className="font-semibold text-gray-900">${recipe.totalEstimatedCost.toFixed(2)}</p>
                  </div>
                )}
                {recipe.estimatedSaving > 0 && (
                  <div>
                    <span className="text-gray-500">You save</span>
                    <p className="font-semibold text-green-600">${recipe.estimatedSaving.toFixed(2)}</p>
                  </div>
                )}
                {recipe.servings > 0 && recipe.totalEstimatedCost > 0 && (
                  <div>
                    <span className="text-gray-500">Per serving</span>
                    <p className="font-semibold text-gray-900">${(recipe.totalEstimatedCost / recipe.servings).toFixed(2)}</p>
                  </div>
                )}
                {recipe.prepTime > 0 && (
                  <div>
                    <span className="text-gray-500">Total time</span>
                    <p className="font-semibold text-gray-900">{recipe.prepTime} min</p>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Steps */}
          {recipe.steps && recipe.steps.length > 0 && (
            <div>
              <h4 className="text-sm font-semibold text-gray-900 mb-2">Method</h4>
              <ol className="space-y-2">
                {recipe.steps.map((step, i) => (
                  <li key={i} className="flex gap-3 text-sm text-gray-700">
                    <span className="flex-shrink-0 w-6 h-6 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-medium">
                      {i + 1}
                    </span>
                    <span className="pt-0.5">{step}</span>
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default Recipes;
