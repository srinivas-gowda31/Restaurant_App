// Whether a Starters-category dish is actually a "snack" in the everyday sense a guest means
// when they ask for one — casual finger food, not a sit-down salad or soup course. Matched
// against the item NAME only (mirrors mealTime.js's reasoning: descriptions cause false
// positives). Only applies within "Starters" — Main Course/Desserts/Beverages items are never
// classified as snacks here, which is a deliberate simplification, not an attempt at a full
// "what counts as a snack anywhere" taxonomy.
const NOT_SNACK_KEYWORDS =
  /\bsalad|\bsoup\b|insalata|bisque|\bloaf\b|baguette|sourdough|ciabatta|sandwich bread|bungla bread/i;
// Momos wins over the "soup" exclusion above — "Soupy Momos" and "Cold Soup Momos" are momo
// dishes (snacks), not an actual soup course, even though the word "soup" appears in the name.
const MOMOS_KEYWORD = /momos/i;

export function isSnackItem(category, name) {
  if (category !== "Starters") return false;
  const n = String(name || "");
  if (MOMOS_KEYWORD.test(n)) return true;
  return !NOT_SNACK_KEYWORDS.test(n);
}
