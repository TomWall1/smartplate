import { Recipe, FilterType } from '../types';

export const FILTERS: { key: FilterType; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'quick', label: 'Quick (<30 min)' },
  { key: 'vegetarian', label: 'Vegetarian' },
  { key: 'vegan', label: 'Vegan' },
  { key: 'gluten-free', label: 'Gluten-free' },
];

export const PROTEIN_FILTERS = [
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  { id: 'beef', label: 'Beef', keywords: ['beef', 'steak', 'brisket', 'sirloin', 'rump', 'scotch fillet', 'eye fillet', 'porterhouse', 'rib'] },
  { id: 'lamb', label: 'Lamb', keywords: ['lamb'] },
  { id: 'pork', label: 'Pork', keywords: ['pork'] },
  { id: 'mince', label: 'Mince', keywords: ['mince', 'minced'] },
  { id: 'salmon', label: 'Salmon', keywords: ['salmon'] },
  { id: 'fish', label: 'Fish', keywords: ['fish', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'cod', 'tuna', 'tilapia', 'trout'] },
  { id: 'seafood', label: 'Seafood', keywords: ['prawn', 'shrimp', 'scallop', 'calamari', 'squid', 'mussel', 'crab', 'lobster', 'octopus'] },
  { id: 'turkey', label: 'Turkey', keywords: ['turkey'] },
  { id: 'duck', label: 'Duck', keywords: ['duck'] },
  { id: 'veal', label: 'Veal', keywords: ['veal'] },
];

const PROCESSED_INDICATORS = ['canned', 'tinned', 'stock', 'broth', 'soup', 'paste'];

export function hasProteinDeal(recipe: Recipe, proteinId: string | null): boolean {
  if (!proteinId) return true;
  const protein = PROTEIN_FILTERS.find((p) => p.id === proteinId);
  if (!protein) return true;
  return (recipe.matchedDeals ?? []).some((deal) => {
    const name = ((deal.dealName || '') + ' ' + (deal.ingredient || '')).toLowerCase();
    if (PROCESSED_INDICATORS.some((ind) => name.includes(ind))) return false;
    return protein.keywords.some((kw) => name.includes(kw));
  });
}

export function applyFilter(recipes: Recipe[], filter: FilterType): Recipe[] {
  switch (filter) {
    case 'quick':
      return recipes.filter((r) => {
        const p = r.prepTime ?? r.cookTime ?? 0;
        return p > 0 && p < 30;
      });
    case 'vegetarian':
      return recipes.filter((r) => r.tags?.some((t) => t.toLowerCase() === 'vegetarian'));
    case 'vegan':
      return recipes.filter((r) => r.tags?.some((t) => t.toLowerCase() === 'vegan'));
    case 'gluten-free':
      return recipes.filter((r) => r.tags?.some((t) => t.toLowerCase() === 'gluten-free'));
    default:
      return recipes;
  }
}
