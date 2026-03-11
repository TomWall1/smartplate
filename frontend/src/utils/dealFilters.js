/**
 * utils/dealFilters.js
 * Client-side non-food deal filtering.
 *
 * The backend already excludes these from recipe matching, but the deals
 * endpoint returns everything so the frontend needs to filter for display.
 */

const NON_FOOD_CATEGORIES = new Set([
  'baby',
  'baby & toddler',
  'health & beauty',
  'pharmacy',
  'pet',
  'household',
  'cleaning',
  'laundry',
  'personal care',
  'vitamins & supplements',
  'liquor',
]);

/**
 * Returns false for deals whose supermarket category is clearly non-food.
 * Leaves all other deals (including uncategorized) through.
 */
export function isFoodDeal(deal) {
  if (!deal.category) return true;
  return !NON_FOOD_CATEGORIES.has(deal.category.toLowerCase());
}

export function filterFoodDeals(deals) {
  return deals.filter(isFoodDeal);
}
