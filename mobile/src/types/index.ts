// Raw store deal — GET /api/deals/store/:name (scraped catalogue items).
export interface Deal {
  name: string;
  price: number;
  originalPrice?: number;
  discountPercentage?: number;
  store: string;
  category?: string;
  image?: string;
  imageUrl?: string;
  productImage?: string;
  /** 'kg', 'each', … or absent when the catalogue text did not say. */
  unit?: string | null;
  /** Set by the catalogue fetch to fetch-time + 7 days. */
  validUntil?: string;
  productIntelligence?: { category?: string };
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
  /** ISO date this recipe was saved. Present only on favourites, where the
   *  savings and cost above were computed against THAT week's specials and
   *  must not be shown as if they were current. */
  savedAt?: string;
}

export interface User {
  id: string;
  email: string;
  state: string | null;
  is_premium: boolean;
  selected_store: string | null;
  /** How many people are usually cooked for. Drives per-serve costing. */
  household_size?: number | null;
  /** Present on rows from /api/users/profile; absent on the trimmed fallback. */
  created_at?: string;
}

/** A row of the saved pantry — GET /api/pantry returns one row per user. */
export interface Pantry {
  ingredients: string[];
  has_pantry_staples: boolean;
  updated_at?: string;
}

/**
 * One structured ingredient line as the matcher returns it. `deal` is attached
 * by the server to missing ingredients that are on special this week.
 */
export interface PantryIngredient {
  name?: string;
  raw?: string;
  quantity?: string;
  deal?: {
    name: string;
    price?: number;
    wasPrice?: number;
    store?: string;
  };
}

/**
 * POST /api/pantry/match result — mirrors pantryMatcher.js exactly. The old
 * shape here (coveragePercent / matchedCount / missingDeals) was invented and
 * matched no endpoint, so every field read as undefined.
 */
export interface PantryMatchResult {
  recipe: Recipe;
  /** 0–1, not a percentage. */
  coverage: number;
  matchedIngredients: PantryIngredient[];
  missingIngredients: PantryIngredient[];
  /** How many ingredients still have to be bought. */
  missingCount: number;
  /** Of those, how many carry no current catalogue price. */
  unpricedCount: number;
  /**
   * Null when nothing could be priced. A number here is a FLOOR unless
   * `costIsComplete` — never render it as a total without checking that flag.
   */
  totalCostToComplete: number | null;
  /** Only ever set when every missing item has a real price. */
  costToCompletePerServe: number | null;
  costIsComplete: boolean;
  costConfidence: 'complete' | 'measured' | 'partial' | 'unpriced';
  totalSavings: number;
}

/** GET /api/premium/price-alerts */
export interface PriceAlert {
  id: string;
  product_name: string;
  target_price: number;
  store: string | null;
  created_at?: string;
  /** Live status against this week's deals; null when nothing matches. */
  status: {
    currentPrice: number;
    store: string;
    productName: string;
    met: boolean;
  } | null;
}

/** One line on a shopping list. Stored as JSON in shopping_lists.items. */
export interface ShoppingListItem {
  name: string;
  checked: boolean;
  /** Which recipe put it on the list, for grouping and de-duplication. */
  recipeTitle?: string;
  recipeId?: string;
  /** ISO date this item was added. Absent on anything added before the
   *  field existed, which is treated as "from a previous week". */
  addedAt?: string;
}

/** GET /api/premium/shopping-lists */
export interface ShoppingList {
  id: string;
  name: string;
  items: ShoppingListItem[];
  created_at?: string;
  updated_at?: string;
}

export interface AuthResponse {
  token: string;
  refresh_token?: string;
  user: User;
}

/**
 * How the recipe list is ordered. 'recommended' is the default and is NOT a
 * saving sort — see lib/recipeFilters.ts for why that matters.
 */
export type RecipeSortKey = 'recommended' | 'savings' | 'cheapest' | 'quickest' | 'pantry';
