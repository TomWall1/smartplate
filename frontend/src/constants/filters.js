// Shared recipe filter definitions — used by Recipes.jsx and StorePage.jsx.
// These were previously duplicated verbatim in both pages.

export const TAG_FILTERS = [
  { id: 'all',        label: 'All' },
  { id: 'quick',      label: 'Quick' },
  { id: 'vegetarian', label: 'Vegetarian' },
  { id: 'vegan',      label: 'Vegan' },
  { id: 'meal prep',  label: 'Meal prep' },
  { id: 'breakfast',  label: 'Breakfast' },
  { id: 'lunch',      label: 'Lunch' },
  { id: 'dinner',     label: 'Dinner' },
];

export const PROTEIN_FILTERS = [
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  { id: 'beef',    label: 'Beef',    keywords: ['beef', 'steak', 'brisket', 'sirloin', 'rump', 'scotch fillet', 'eye fillet', 'porterhouse', 'rib'] },
  { id: 'lamb',    label: 'Lamb',    keywords: ['lamb'] },
  { id: 'pork',    label: 'Pork',    keywords: ['pork'] },
  { id: 'mince',   label: 'Mince',   keywords: ['mince', 'minced'] },
  { id: 'salmon',  label: 'Salmon',  keywords: ['salmon'] },
  { id: 'fish',    label: 'Fish',    keywords: ['fish', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'cod', 'tuna', 'tilapia', 'trout'] },
  { id: 'seafood', label: 'Seafood', keywords: ['prawn', 'shrimp', 'scallop', 'calamari', 'squid', 'mussel', 'crab', 'lobster', 'octopus'] },
  { id: 'turkey',  label: 'Turkey',  keywords: ['turkey'] },
  { id: 'duck',    label: 'Duck',    keywords: ['duck'] },
  { id: 'veal',    label: 'Veal',    keywords: ['veal'] },
];

// Indicators that the deal is canned/processed, not fresh or frozen
const PROCESSED_INDICATORS = ['canned', 'tinned', 'stock', 'broth', 'soup', 'paste'];

/**
 * True if the recipe has a fresh/frozen matched deal for the given protein
 * filter (processed forms like stock or canned don't count).
 */
export function hasProteinDeal(recipe, proteinId) {
  if (!proteinId) return true;
  const protein = PROTEIN_FILTERS.find((p) => p.id === proteinId);
  if (!protein) return true;
  return (recipe.matchedDeals ?? []).some((deal) => {
    const name = ((deal.dealName || '') + ' ' + (deal.ingredient || '')).toLowerCase();
    if (PROCESSED_INDICATORS.some((ind) => name.includes(ind))) return false;
    return protein.keywords.some((kw) => name.includes(kw));
  });
}

/**
 * Apply the user's saved preferences to a recipe list. The rule across the
 * app: preferences are edited in one place and respected silently on every
 * page that shows recipes — no per-page "Apply" step.
 *
 * - excludeIngredients: tag matching recipes with excludedWarnings (badge on
 *   the card) and push them to the bottom. Never removes a recipe.
 * - mealTypes: recipes matching a preferred meal type float to the top
 *   (skippable — the premium personalised view orders server-side).
 */
export function applyPreferenceOrdering(list, preferences = {}, { mealTypeSort = true } = {}) {
  let result = list;

  if (mealTypeSort) {
    const mealTypes = (preferences.mealTypes ?? []).map((m) => m.toLowerCase());
    if (mealTypes.length > 0) {
      result = [
        ...result.filter((r) => (r.tags ?? []).some((t) => mealTypes.includes(t.toLowerCase()))),
        ...result.filter((r) => !(r.tags ?? []).some((t) => mealTypes.includes(t.toLowerCase()))),
      ];
    }
  }

  const excluded = (preferences.excludeIngredients ?? [])
    .map((e) => e.toLowerCase().trim())
    .filter(Boolean);

  if (excluded.length > 0) {
    result = result.map((r) => {
      if (r.excludedWarnings !== undefined) return r; // already tagged server-side
      const allText = [
        ...(r.allIngredients ?? []),
        ...(r.ingredients ?? []),
      ].join(' ').toLowerCase();
      const warnings = excluded.filter((ex) => allText.includes(ex));
      return { ...r, excludedWarnings: warnings };
    });
    result = [
      ...result.filter((r) => r.excludedWarnings.length === 0),
      ...result.filter((r) => r.excludedWarnings.length > 0),
    ];
  }

  return result;
}
