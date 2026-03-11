/**
 * Map raw deal categories to standardized food types.
 * Prioritizes hero ingredients (proteins) at top.
 */

export const FOOD_CATEGORIES = {
  PROTEIN: 'Proteins',
  PRODUCE:  'Fresh Produce',
  DAIRY:    'Dairy & Eggs',
  PANTRY:   'Pantry Staples',
  BAKERY:   'Bakery',
  FROZEN:   'Frozen',
  OTHER:    'Other',
};

export const CATEGORY_ORDER = [
  'PROTEIN',
  'PRODUCE',
  'DAIRY',
  'PANTRY',
  'BAKERY',
  'FROZEN',
  'OTHER',
];

/**
 * Map a deal to a standardized food category key.
 * Prefers Product Intelligence category; falls back to deal.category string.
 */
export function categorizeDeal(deal) {
  // Product Intelligence category (most reliable)
  const piCat = (deal.productIntelligence?.category || '').toLowerCase();
  if (piCat) {
    if (piCat === 'meat' || piCat === 'seafood' || piCat === 'deli') return FOOD_CATEGORIES.PROTEIN;
    if (piCat === 'vegetables' || piCat === 'fruit')                  return FOOD_CATEGORIES.PRODUCE;
    if (piCat === 'dairy' || piCat === 'eggs')                        return FOOD_CATEGORIES.DAIRY;
    if (piCat === 'baked_goods')                                      return FOOD_CATEGORIES.BAKERY;
    if (piCat === 'frozen')                                           return FOOD_CATEGORIES.FROZEN;
    if (
      piCat === 'grains' || piCat === 'legumes' || piCat === 'nuts_seeds' ||
      piCat === 'oils_fats' || piCat === 'condiments' || piCat === 'sauces' ||
      piCat === 'herbs_spices' || piCat === 'canned_preserved' || piCat === 'snacks'
    ) return FOOD_CATEGORIES.PANTRY;
  }

  // Fallback: deal.category from the store scraper
  const cat = (deal.category || '').toLowerCase();
  if (cat.includes('meat') || cat.includes('seafood') || cat.includes('poultry') ||
      cat.includes('chicken') || cat.includes('beef') || cat.includes('deli')) {
    return FOOD_CATEGORIES.PROTEIN;
  }
  if (cat.includes('fruit') || cat.includes('vegetable') || cat.includes('produce') ||
      cat.includes('salad') || cat.includes('fresh')) {
    return FOOD_CATEGORIES.PRODUCE;
  }
  if (cat.includes('dairy') || cat.includes('egg') || cat.includes('cheese') ||
      cat.includes('milk') || cat.includes('yoghurt') || cat.includes('yogurt')) {
    return FOOD_CATEGORIES.DAIRY;
  }
  if (cat.includes('bakery') || cat.includes('bread') || cat.includes('pastry')) {
    return FOOD_CATEGORIES.BAKERY;
  }
  if (cat.includes('frozen')) {
    return FOOD_CATEGORIES.FROZEN;
  }
  if (cat.includes('pantry') || cat.includes('grocery') || cat.includes('condiment') ||
      cat.includes('sauce') || cat.includes('oil') || cat.includes('cereal') ||
      cat.includes('pasta') || cat.includes('rice') || cat.includes('snack')) {
    return FOOD_CATEGORIES.PANTRY;
  }

  return FOOD_CATEGORIES.OTHER;
}

/**
 * Group deals by food category in priority order.
 * Returns an object: { 'Proteins': [...], 'Fresh Produce': [...], ... }
 */
export function groupDealsByCategory(deals) {
  const grouped = {};

  deals.forEach((deal) => {
    const cat = categorizeDeal(deal);
    if (!grouped[cat]) grouped[cat] = [];
    grouped[cat].push(deal);
  });

  // Return only non-empty categories, in priority order
  const ordered = {};
  CATEGORY_ORDER.forEach((key) => {
    const name = FOOD_CATEGORIES[key];
    if (grouped[name]?.length > 0) ordered[name] = grouped[name];
  });

  return ordered;
}
