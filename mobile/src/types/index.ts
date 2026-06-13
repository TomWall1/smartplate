// Raw store deal — GET /api/deals/store/:name (scraped catalogue items).
export interface Deal {
  name: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  store: string;
  category?: string;
  image?: string;
  productImage?: string;
}

// A deal matched to a recipe ingredient — lives inside recipe.matchedDeals.
// (Different shape from a raw Deal: has dealName + ingredient + saving.)
export interface MatchedDeal {
  dealName: string;
  ingredient: string;
  store: string;
  price?: number;
  originalPrice?: number;
  discountPercentage?: number;
  saving?: number;
  productCategory?: string;
  savings?: { mealSaving?: number; perServingSaving?: number };
}

export interface Ingredient {
  name: string;
  quantity?: string;
}

// Served recipe shape — recipeService._composeWeeklyRecipe (camelCase).
export interface Recipe {
  id: number | string;
  title: string;
  image?: string;
  prepTime?: number;
  cookTime?: number;
  servings?: number;
  tags?: string[];
  matchedDeals?: MatchedDeal[];
  dealIngredients?: string[];
  dealHighlights?: string[];
  estimatedSaving?: number;
  totalEstimatedCost?: number;
  totalMealSaving?: number;
  totalPerServingSaving?: number;
  allIngredients?: string[];
  ingredients?: string[];
  source?: string;
  sourceUrl?: string;
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
  missingDeals: MatchedDeal[];
}

export interface AuthResponse {
  token: string;
  refresh_token?: string;
  user: User;
}

export type FilterType = 'all' | 'quick' | 'vegetarian' | 'vegan' | 'gluten-free';
