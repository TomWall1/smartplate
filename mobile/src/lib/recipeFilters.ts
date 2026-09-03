/**
 * Recipe ordering and faceted filtering for the recipe list.
 *
 * ORDERING — why "Recommended" is not "biggest saving".
 *
 * The backend already hands us a deliberately balanced menu:
 * recipeMatcher.selectMenu() drafts round-robin across protein families and
 * then across the specific on-special hero within each family, and
 * recipeService serves that draft in `storeOrder`. Any prefix of the served
 * list is therefore a spread of proteins — which is the whole point, because
 * the app only ever shows a prefix.
 *
 * The mobile list used to re-sort that by `estimatedSaving`, which threw the
 * draft away and collapsed the first screen onto whichever hero happened to
 * carry the deepest discount that week (a wall of prawn). Sorting a deal
 * catalogue by discount always degenerates that way.
 *
 * So: the default keeps the server's order and re-diversifies locally. The
 * local pass matters because it also runs over the FILTERED list — filter to
 * one feature and the survivors need re-spreading — and because recipes from
 * older artifacts arrive with `storeOrder: null` and no draft at all.
 */
import { Recipe, MatchedDeal, RecipeSortKey } from '../types';
import { costingFor } from './costing';

// ── Proteins ─────────────────────────────────────────────────────────────────

export interface ProteinFilter {
  id: string;
  label: string;
  keywords: string[];
}

export const PROTEIN_FILTERS: ProteinFilter[] = [
  { id: 'chicken', label: 'Chicken', keywords: ['chicken'] },
  { id: 'beef', label: 'Beef', keywords: ['beef', 'steak', 'brisket', 'sirloin', 'rump', 'scotch fillet', 'eye fillet', 'porterhouse', 'rib'] },
  { id: 'lamb', label: 'Lamb', keywords: ['lamb'] },
  { id: 'pork', label: 'Pork', keywords: ['pork', 'bacon', 'ham'] },
  { id: 'mince', label: 'Mince', keywords: ['mince', 'minced'] },
  { id: 'salmon', label: 'Salmon', keywords: ['salmon'] },
  { id: 'fish', label: 'Fish', keywords: ['fish', 'barramundi', 'snapper', 'bream', 'whiting', 'flathead', 'cod', 'tuna', 'tilapia', 'trout'] },
  { id: 'seafood', label: 'Seafood', keywords: ['prawn', 'shrimp', 'scallop', 'calamari', 'squid', 'mussel', 'crab', 'lobster', 'octopus'] },
  { id: 'turkey', label: 'Turkey', keywords: ['turkey'] },
  { id: 'duck', label: 'Duck', keywords: ['duck'] },
  { id: 'veal', label: 'Veal', keywords: ['veal'] },
];

// A deal in one of these forms is not the protein people mean: chicken stock
// does not make a recipe a chicken dish.
const PROCESSED_INDICATORS = ['canned', 'tinned', 'stock', 'broth', 'soup', 'paste'];

const dealText = (deal: MatchedDeal) =>
  ((deal.dealName || '') + ' ' + (deal.ingredient || '')).toLowerCase();

const isProcessed = (text: string) => PROCESSED_INDICATORS.some((ind) => text.includes(ind));

/** Every protein filter id this one deal satisfies (fresh/frozen forms only). */
function proteinIdsForDeal(deal: MatchedDeal): string[] {
  const text = dealText(deal);
  if (isProcessed(text)) return [];
  return PROTEIN_FILTERS.filter((p) => p.keywords.some((kw) => text.includes(kw))).map((p) => p.id);
}

/**
 * Multi-select protein match: a recipe qualifies when AT LEAST ONE of the
 * chosen proteins is on special in it. An empty selection means "no protein
 * filter", not "no proteins".
 */
export function hasAnyProteinDeal(recipe: Recipe, proteinIds: string[]): boolean {
  if (proteinIds.length === 0) return true;
  return (recipe.matchedDeals ?? []).some((deal) =>
    proteinIdsForDeal(deal).some((id) => proteinIds.includes(id))
  );
}

// ── Features ─────────────────────────────────────────────────────────────────

export interface FeatureFilter {
  id: string;
  label: string;
  test: (recipe: Recipe) => boolean;
}

const hasTag = (recipe: Recipe, re: RegExp) =>
  (recipe.tags ?? []).some((t) => re.test(t.toLowerCase()));

/** Kitchen time in minutes, or 0 when the source recipe never said. */
export function totalMinutes(recipe: Recipe): number {
  return recipe.prepTime ?? recipe.cookTime ?? 0;
}

/**
 * Candidate features. Which of these the UI actually offers is decided from
 * the week's data, not from this list — an option that matches nothing is a
 * dead end, so `facetCounts` drives visibility.
 */
export const FEATURE_FILTERS: FeatureFilter[] = [
  {
    id: 'quick',
    label: 'Quick (under 30 min)',
    // Times are the reliable signal; the scrapers' own `quick` tag is applied
    // inconsistently across the five libraries, so it is only a fallback.
    test: (r) => {
      const mins = totalMinutes(r);
      return mins > 0 ? mins <= 30 : hasTag(r, /^quick$/);
    },
  },
  { id: 'one-pot', label: 'One pot', test: (r) => hasTag(r, /one.?(pot|pan|tray)/) },
  // A vegan recipe is also vegetarian — filtering to "vegetarian" and hiding
  // the vegan dishes would be a plain wrong answer.
  { id: 'vegetarian', label: 'Vegetarian', test: (r) => hasTag(r, /vegetarian|vegan/) },
  { id: 'vegan', label: 'Vegan', test: (r) => hasTag(r, /vegan/) },
  { id: 'gluten-free', label: 'Gluten-free', test: (r) => hasTag(r, /gluten/) },
  { id: 'dairy-free', label: 'Dairy-free', test: (r) => hasTag(r, /dairy.?free/) },
  { id: 'meal-prep', label: 'Meal prep', test: (r) => hasTag(r, /meal.?prep/) },
  { id: 'freezer', label: 'Freezer friendly', test: (r) => hasTag(r, /freez/) },
  { id: 'bbq', label: 'Barbecue', test: (r) => hasTag(r, /bbq|barbecue/) },
  { id: 'salad', label: 'Salad', test: (r) => hasTag(r, /salad/) },
  { id: 'breakfast', label: 'Breakfast', test: (r) => hasTag(r, /breakfast|brunch/) },
];

/**
 * Features are ANDed: "quick" plus "vegetarian" means a quick vegetarian
 * dinner, which is how anyone reads two ticked boxes here. (Proteins are ORed
 * — those are alternatives, these are refinements.)
 */
export function matchesFeatures(recipe: Recipe, featureIds: string[]): boolean {
  return featureIds.every((id) => FEATURE_FILTERS.find((f) => f.id === id)?.test(recipe) ?? true);
}

export interface Facets {
  proteins: string[];
  features: string[];
}

export function applyFacets(recipes: Recipe[], facets: Facets): Recipe[] {
  return recipes.filter(
    (r) => hasAnyProteinDeal(r, facets.proteins) && matchesFeatures(r, facets.features)
  );
}

/**
 * How many results each option would leave, so the sheet can show counts and
 * disable the dead ones. Standard facet counting: an option is counted with
 * the OTHER facet applied, but with its own facet's current selection ignored
 * (the ORed protein facet) or added to (the ANDed feature facet).
 *
 * Two multiplying facets over a 50-recipe week produce empty lists very
 * easily; this is what stops someone walking into one.
 */
export function facetCounts(recipes: Recipe[], facets: Facets) {
  const byFeatures = recipes.filter((r) => matchesFeatures(r, facets.features));
  const byProteins = recipes.filter((r) => hasAnyProteinDeal(r, facets.proteins));

  const proteins: Record<string, number> = {};
  for (const p of PROTEIN_FILTERS) {
    proteins[p.id] = byFeatures.filter((r) => hasAnyProteinDeal(r, [p.id])).length;
  }

  const features: Record<string, number> = {};
  for (const f of FEATURE_FILTERS) {
    const withThis = facets.features.includes(f.id)
      ? facets.features
      : [...facets.features, f.id];
    features[f.id] = byProteins.filter((r) => matchesFeatures(r, withThis)).length;
  }

  return { proteins, features };
}

// ── Hero lanes (the variety fix) ─────────────────────────────────────────────

/** Per-meal saving where the server enriched it, whole-pack saving otherwise. */
const mealSaveOf = (deal: MatchedDeal) => deal.savings?.mealSaving ?? deal.saving ?? 0;

// Mirrors backend/config/matching.js HERO_FAMILIES. Families are the outer
// loop of the draft so one protein cannot hold several lanes at once — the
// bug that once put 41 pork recipes in a 50-recipe menu.
const HERO_FAMILIES: [string, RegExp][] = [
  ['pork', /\b(pork|bacon|ham|prosciutto|chorizo|salami|speck|pancetta)\b/],
  ['lamb', /\blamb\b/],
  ['beef', /\b(beef|steak|brisket|veal|mince)\b/],
  ['chicken', /\b(chicken|turkey|duck|poultry)\b/],
  ['seafood', /\b(fish|salmon|tuna|prawn|shrimp|barramundi|basa|snapper|squid|mussel|crab|scallop)\b/],
];

/**
 * The specific on-special hero a recipe is anchored to — "prawn", "salmon",
 * "lamb", not the broad family. Keeping heroes per-product is what stops a
 * single seafood deal speaking for the whole family.
 *
 * The backend computes a better version of this (`_heroKeyFromDeals`, weighted
 * by ingredient importance) but drops it before serving. Deriving it from the
 * matched deals here needs no backend change; if `heroGroup` is ever added to
 * the served shape, prefer it and delete this.
 */
export function heroKeyOf(recipe: Recipe): string {
  const deals = [...(recipe.matchedDeals ?? [])].sort((a, b) => mealSaveOf(b) - mealSaveOf(a));

  for (const deal of deals) {
    const text = dealText(deal);
    if (isProcessed(text)) continue;
    for (const protein of PROTEIN_FILTERS) {
      // The matched KEYWORD, not the filter id: prawn and scallop are both
      // "seafood" to the filter, but they are different dinners.
      const kw = protein.keywords.find((k) => text.includes(k));
      if (kw) return kw;
    }
  }

  // No protein on special (a vegetable-anchored dish) — lane it on its best
  // deal so those spread too, rather than clumping into one "other".
  const top = deals[0];
  if (top) return (top.ingredient || top.dealName || 'other').toLowerCase().trim();
  return 'other';
}

function familyOf(heroKey: string): string {
  for (const [family, re] of HERO_FAMILIES) if (re.test(heroKey)) return family;
  return 'other';
}

/**
 * Round-robin the list across hero lanes — families outer, heroes inner —
 * preserving the incoming order within each lane.
 *
 * Every recipe comes out exactly once: this reorders, it never drops. The
 * effect is that the first screen shows one of each hero before it shows a
 * second of anything.
 */
export function diversify(recipes: Recipe[]): Recipe[] {
  const lanes = new Map<string, Recipe[]>();
  const families = new Map<string, { heroes: string[]; cursor: number }>();

  for (const recipe of recipes) {
    const hero = heroKeyOf(recipe);
    if (!lanes.has(hero)) {
      lanes.set(hero, []);
      const family = familyOf(hero);
      if (!families.has(family)) families.set(family, { heroes: [], cursor: 0 });
      families.get(family)!.heroes.push(hero);
    }
    lanes.get(hero)!.push(recipe);
  }

  const taken = new Map<string, number>();
  const out: Recipe[] = [];
  let progress = true;

  // Insertion order of both maps follows the incoming (server-ranked) order,
  // so the strongest family and hero still lead — this spreads the list, it
  // does not shuffle it.
  while (out.length < recipes.length && progress) {
    progress = false;
    for (const family of families.values()) {
      for (let k = 0; k < family.heroes.length; k++) {
        const hero = family.heroes[(family.cursor + k) % family.heroes.length];
        const lane = lanes.get(hero)!;
        const idx = taken.get(hero) ?? 0;
        if (idx >= lane.length) continue;
        out.push(lane[idx]);
        taken.set(hero, idx + 1);
        family.cursor = (family.cursor + k + 1) % family.heroes.length;
        progress = true;
        break; // one pick per family per round
      }
    }
  }

  return out;
}

// ── Pantry overlap ───────────────────────────────────────────────────────────

const normalise = (s: string) =>
  s.toLowerCase().replace(/[^a-z\s]/g, ' ').replace(/\s+/g, ' ').trim();

/**
 * Rough share of a recipe's ingredients already in the pantry, 0–1.
 *
 * Deliberately rough: the real matcher is server-side (POST /api/pantry/match)
 * and has the pantry results screen to itself. This only has to ORDER a list
 * the device already holds, so it stays offline and instant rather than firing
 * a request every time someone changes a filter.
 */
export function pantryOverlap(recipe: Recipe, pantryTerms: string[]): number {
  const ingredients = (recipe.allIngredients ?? recipe.ingredients ?? [])
    .map(normalise)
    .filter(Boolean);
  if (ingredients.length === 0 || pantryTerms.length === 0) return 0;
  const matched = ingredients.filter((ing) =>
    pantryTerms.some((term) => ing.includes(term) || term.includes(ing))
  );
  return matched.length / ingredients.length;
}

/** Saved pantry lines → comparable terms. Two-letter scraps match everything. */
export function pantryTermsFrom(ingredients: string[] | undefined): string[] {
  return (ingredients ?? []).map(normalise).filter((t) => t.length >= 3);
}

// ── Sorting ──────────────────────────────────────────────────────────────────

export interface SortOption {
  key: RecipeSortKey;
  label: string;
  hint: string;
}

export const SORT_OPTIONS: SortOption[] = [
  { key: 'recommended', label: 'Recommended', hint: 'A spread of this week’s specials, best first' },
  { key: 'savings', label: 'Biggest savings', hint: 'Most saved against normal prices' },
  { key: 'cheapest', label: 'Cheapest per serve', hint: 'Least to spend on one serving' },
  { key: 'quickest', label: 'Quickest', hint: 'Least time in the kitchen' },
  { key: 'pantry', label: 'Uses what I have', hint: 'Most ingredients already in your pantry' },
];

/** Recipes missing the figure a sort needs go last — a 0 must not win. */
const LAST = Number.POSITIVE_INFINITY;

export function sortRecipes(
  recipes: Recipe[],
  sort: RecipeSortKey,
  opts: { pantryTerms?: string[] } = {}
): Recipe[] {
  const list = [...recipes];

  switch (sort) {
    case 'savings':
      return list.sort((a, b) => (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0));

    case 'cheapest':
      return list.sort(
        (a, b) => (costingFor(a)?.perServe ?? LAST) - (costingFor(b)?.perServe ?? LAST)
      );

    case 'quickest':
      return list.sort((a, b) => (totalMinutes(a) || LAST) - (totalMinutes(b) || LAST));

    case 'pantry': {
      const terms = opts.pantryTerms ?? [];
      if (terms.length === 0) return diversify(list); // nothing saved yet
      const score = new Map(list.map((r) => [r.id, pantryOverlap(r, terms)]));
      return list.sort(
        (a, b) =>
          (score.get(b.id) ?? 0) - (score.get(a.id) ?? 0) ||
          (b.estimatedSaving ?? 0) - (a.estimatedSaving ?? 0)
      );
    }

    case 'recommended':
    default:
      // The server's own draft order, re-spread across hero lanes.
      return diversify(list);
  }
}
