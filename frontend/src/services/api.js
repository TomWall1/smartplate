import axios from 'axios';

const API_BASE_URL = import.meta.env.VITE_API_URL || 'http://localhost:3001';

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 10000,
});

// Request interceptor for logging
api.interceptors.request.use(
  (config) => {
    console.log(`API Request: ${config.method?.toUpperCase()} ${config.url}`);
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
      const response = await api.post('/api/deals/refresh');
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
  }
};

// Recipe API calls
export const recipesApi = {
  getRecipeSuggestions: async (dealIngredients, preferences = {}, pantryItems = []) => {
    try {
      const response = await api.post('/api/recipes/suggestions', {
        dealIngredients,
        preferences,
        pantryItems
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching recipe suggestions:', error);
      throw error;
    }
  },

  getRecipeDetails: async (recipeId) => {
    try {
      const response = await api.get(`/api/recipes/${recipeId}`);
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
  }
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
  }
};

export default api;