export interface Deal {
  ingredient: string;
  dealName: string;
  store: 'woolworths' | 'coles' | 'iga' | string;
  price: number;
  savings: number;
}

export interface Ingredient {
  name: string;
  quantity: string;
  ingredientTags?: {
    category?: string;
  };
}

export interface Recipe {
  id: string;
  title: string;
  description: string;
  image_url: string;
  prep_time: number;
  servings: number;
  cuisine: string;
  meal_type: string;
  dietary_tags: string[];
  ingredients: Ingredient[];
  matchedDeals: Deal[];
  steps: string[];
  deal_count: number;
}

export interface User {
  id: string;
  email: string;
  state: string | null;
  is_premium: boolean;
  selected_store: string | null;
}

export interface PantryItem {
  id?: string;
  name: string;
}

export interface PantryMatchResult {
  recipe: Recipe;
  coveragePercent: number;
  matchedCount: number;
  totalCount: number;
  missingDeals: Deal[];
}

export interface AuthResponse {
  token: string;
  user: User;
}

export type FilterType = 'all' | 'quick' | 'vegetarian' | 'vegan' | 'gluten-free';
