/**
 * When the current catalogue week started.
 *
 * Deals — and everything derived from them — are true for exactly one
 * catalogue week. The weekly pipeline runs Tuesday 17:00 UTC, which is early
 * Wednesday in Sydney, when the Woolworths and Coles catalogues turn over
 * (see .github/workflows/weekly-refresh.yml). Anything from before that
 * boundary belongs to a week that has since been replaced.
 *
 * The shopping list uses this to spot items left over from last week's shop.
 */

const WEDNESDAY = 3; // Date.getDay(): Sunday is 0

/** Local midnight on the most recent Wednesday, inclusive of today. */
export function currentCatalogueWeekStart(now: Date = new Date()): Date {
  const start = new Date(now);
  start.setHours(0, 0, 0, 0);
  // Days back to the last Wednesday; 0 when today IS Wednesday.
  const back = (start.getDay() - WEDNESDAY + 7) % 7;
  start.setDate(start.getDate() - back);
  return start;
}

/** The current week as a stable key, for remembering "already asked". */
export function catalogueWeekKey(now: Date = new Date()): string {
  return currentCatalogueWeekStart(now).toISOString().slice(0, 10);
}

/**
 * True when `iso` predates the current catalogue week.
 *
 * An absent date counts as OLD here. Items added before this field existed
 * have no stamp, and they are precisely the ninety-item backlog this is meant
 * to catch — treating them as current would hide the problem from the people
 * who already have it.
 */
export function isFromPreviousWeek(iso?: string, now: Date = new Date()): boolean {
  if (!iso) return true;
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return true;
  return at.getTime() < currentCatalogueWeekStart(now).getTime();
}
