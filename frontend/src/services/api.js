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

export default api;
