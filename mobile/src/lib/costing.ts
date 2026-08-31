/**
 * Per-serve costing.
 *
 * A recipe's `totalEstimatedCost` is the cost of the whole dish at this week's
 * prices, for however many servings the source recipe makes. That number is
 * hard to act on: "about $18" means nothing until you know whether it feeds two
 * or eight, and whether that matches how many you actually cook for.
 *
 * So we divide by the recipe's own servings to get a per-serve figure — which
 * IS comparable between recipes — and then multiply back up by the household
 * size to answer the real question: what does tonight cost me?
 *
 * Everything returns null rather than a guess when the inputs are missing. A
 * recipe with no servings count gets no per-serve figure, because inventing a
 * denominator would put a wrong dollar amount in front of someone.
 */
import { Recipe } from '../types';

export interface Costing {
  /** Cost of one serving at this week's prices. */
  perServe: number;
  /** Servings the recipe itself makes. */
  servings: number;
  /** People this account cooks for, when known. */
  householdSize: number | null;
  /** perServe × householdSize — what one meal for the household costs. */
  householdCost: number | null;
  /** How much the recipe must be scaled to feed the household. */
  scaleFactor: number | null;
  /** Saving per serving against normal prices, when the matcher found deals. */
  perServeSaving: number | null;
}

export function costingFor(recipe: Recipe, householdSize?: number | null): Costing | null {
  const total = recipe.totalEstimatedCost;
  const servings = recipe.servings;

  if (!total || total <= 0 || !servings || servings <= 0) return null;

  const perServe = total / servings;
  const household = householdSize && householdSize > 0 ? householdSize : null;

  // Prefer the server's own per-serving saving; fall back to dividing the
  // meal saving, which is the same arithmetic the backend does.
  const perServeSaving =
    recipe.totalPerServingSaving && recipe.totalPerServingSaving > 0
      ? recipe.totalPerServingSaving
      : recipe.totalMealSaving && recipe.totalMealSaving > 0
        ? recipe.totalMealSaving / servings
        : null;

  return {
    perServe,
    servings,
    householdSize: household,
    householdCost: household ? perServe * household : null,
    scaleFactor: household ? household / servings : null,
    perServeSaving,
  };
}

/** $4.20, or $4 when the cents add nothing. */
export function money(value: number): string {
  return value >= 10
    ? `$${value.toFixed(0)}`
    : `$${value.toFixed(2)}`;
}

/**
 * "makes 4, you cook for 6" needs a human-readable multiplier. Rounded to a
 * half because nobody scales a recipe by 1.4732.
 */
export function scaleLabel(scaleFactor: number): string | null {
  const rounded = Math.round(scaleFactor * 2) / 2;
  if (rounded === 1) return null;
  return `${rounded}×`;
}
