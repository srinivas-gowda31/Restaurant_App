export const CUISINES = ["Indian", "Chinese", "Continental"];

/**
 * Normalizes any freeform cuisine string (manual admin entry, a stale value, or a model
 * that ignored the enum) onto one of the three canonical cuisines. Falls back to
 * "Continental" — the safest default for the many Western/French/generic dishes in this
 * catalog that aren't Indian or Chinese.
 */
export function normalizeCuisine(rawCuisine) {
  const value = String(rawCuisine || "").trim();
  const exact = CUISINES.find((c) => c.toLowerCase() === value.toLowerCase());
  return exact || "Continental";
}
