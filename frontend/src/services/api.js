import axios from 'axios';
import { supabase } from './supabase';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 120000,
});

// Request interceptor — attach Supabase JWT when logged in
api.interceptors.request.use(
  async (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
    if (supabase) {
      const { data: { session } } = await supabase.auth.getSession();
      if (session?.access_token) {
        config.headers.Authorization = `Bearer ${session.access_token}`;
      }
    }
    return config;
  },
  (error) => {
    console.error('API Request Error:', error);
    return Promise.reject(error);
  }
);

// Response interceptor for error handling
api.interceptors.response.use(
  (response) => {
    console.log(`API Response: ${response.status} ${response.config.url}`);
    return response;
  },
  (error) => {
    console.error('API Response Error:', error.response?.status, error.message);
    return Promise.reject(error);
  }
);

// Deal API calls
export const dealsApi = {
  getCurrentDeals: async () => {
    try {
      const response = await api.get('/api/deals/current');
      return response.data;
    } catch (error) {
      console.error('Error fetching deals:', error);
      throw error;
    }
  },

  refreshDeals: async () => {
    try {
      const response = await api.post('/api/deals/refresh', {}, { timeout: 120000 });
      return response.data;
    } catch (error) {
      console.error('Error refreshing deals:', error);
      throw error;
    }
  },

  getDealsByStore: async (storeName) => {
    try {
      const response = await api.get(`/api/deals/store/${storeName}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching ${storeName} deals:`, error);
      throw error;
    }
  },
};

// Recipe API calls
export const recipesApi = {
  getRecipeSuggestions: async (dealIngredients, preferences = {}, pantryItems = []) => {
    try {
      const response = await api.post('/api/recipes/suggestions', {
        dealIngredients,
        preferences,
        pantryItems,
      }, { timeout: 60000 });
      return response.data;
    } catch (error) {
      console.error('Error fetching recipe suggestions:', error);
      throw error;
    }
  },

  getRecipeDetails: async (recipeId, store = null) => {
    try {
      const params = store ? { store } : {};
      const response = await api.get(`/api/recipes/${recipeId}`, { params });
      return response.data;
    } catch (error) {
      console.error('Error fetching recipe details:', error);
      throw error;
    }
  },

  searchRecipes: async (query, diet, type) => {
    try {
      const params = { query };
      if (diet) params.diet = diet;
      if (type) params.type = type;

      const response = await api.get('/api/recipes/search', { params });
      return response.data;
    } catch (error) {
      console.error('Error searching recipes:', error);
      throw error;
    }
  },

  getRecipesForStore: async (store) => {
    try {
      const response = await api.post('/api/recipes/suggestions', { store });
      return response.data;
    } catch (error) {
      console.error(`Error fetching recipes for store ${store}:`, error);
      throw error;
    }
  },

  generateWeekly: async () => {
    try {
      const response = await api.post('/api/recipes/generate-weekly', {}, { timeout: 300000 });
      return response.data;
    } catch (error) {
      console.error('Error generating weekly recipes:', error);
      throw error;
    }
  },
};

// User profile / preferences API
export const usersApi = {
  getProfile: async () => {
    const response = await api.get('/api/users/profile');
    return response.data;
  },

  updatePreferences: async (prefs) => {
    const response = await api.put('/api/users/preferences', prefs);
    return response.data;
  },
};

// Health check
export const healthApi = {
  checkHealth: async () => {
    try {
      const response = await api.get('/health');
      return response.data;
    } catch (error) {
      console.error('Health check failed:', error);
      throw error;
    }
  },
};

// Premium API
export const premiumApi = {
  getStatus: async () => {
    const response = await api.get('/api/premium/status');
    return response.data;
  },
  getFavorites: async () => {
    const response = await api.get('/api/premium/favorites');
    return response.data;
  },
  addFavorite: async (recipeId, recipeData) => {
    const response = await api.post(`/api/premium/favorites/${recipeId}`, { recipe_data: recipeData });
    return response.data;
  },
  removeFavorite: async (recipeId) => {
    const response = await api.delete(`/api/premium/favorites/${recipeId}`);
    return response.data;
  },
  getMealPlan: async (startDate, endDate) => {
    const response = await api.get('/api/premium/meal-plan', { params: { startDate, endDate } });
    return response.data;
  },
  addToMealPlan: async (date, mealType, recipeId, recipeData) => {
    const response = await api.post('/api/premium/meal-plan', {
      date,
      meal_type: mealType,
      recipe_id: recipeId,
      recipe_data: recipeData,
    });
    return response.data;
  },
  removeFromMealPlan: async (id) => {
    const response = await api.delete(`/api/premium/meal-plan/${id}`);
    return response.data;
  },
  getShoppingLists: async () => {
    const response = await api.get('/api/premium/shopping-lists');
    return response.data;
  },
  createShoppingList: async (name, items) => {
    const response = await api.post('/api/premium/shopping-lists', { name, items });
    return response.data;
  },
  updateShoppingList: async (id, updates) => {
    const response = await api.put(`/api/premium/shopping-lists/${id}`, updates);
    return response.data;
  },
  deleteShoppingList: async (id) => {
    const response = await api.delete(`/api/premium/shopping-lists/${id}`);
    return response.data;
  },
  getPriceAlerts: async () => {
    const response = await api.get('/api/premium/price-alerts');
    return response.data;
  },
  createPriceAlert: async (productName, targetPrice, store) => {
    const response = await api.post('/api/premium/price-alerts', {
      product_name: productName,
      target_price: targetPrice,
      store,
    });
    return response.data;
  },
  deletePriceAlert: async (id) => {
    const response = await api.delete(`/api/premium/price-alerts/${id}`);
    return response.data;
  },
};

// Admin API
export const adminApi = {
  getUsers: async () => {
    const response = await api.get('/api/admin/users');
    return response.data;
  },
  togglePremium: async (userId) => {
    const response = await api.post(`/api/admin/users/${userId}/toggle-premium`);
    return response.data;
  },
  getStats: async () => {
    const response = await api.get('/api/admin/stats');
    return response.data;
  },
};

export default api;
