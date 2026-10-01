// Whether a dish is breakfast-appropriate — a separate dimension from category (which is
// course type: Starters/Main Course/Desserts/Beverages) and cuisine, since a dish like Masala
// Dosa is a "Main Course" item that's also specifically a breakfast dish. Matched against the
// item NAME only, not description — descriptions list ingredients ("hard-boiled eggs" in a
// Niçoise salad, "eggplant" in a curry), which produced false positives when matched too.
const BREAKFAST_KEYWORDS =
  /dosa|idli|poha|upma|uttapam|\bvada\b|paratha|\bpuri\b|chole bhature|bhature|sabudana|thepla|omelette|omelet|boiled eggs?|croissant|pancake|waffle|cereal|muesli|\btoast\b|bagel|\bmuffin\b|granola|porridge|congee|pain au chocolate/i;

export function isBreakfastItem(name) {
  return BREAKFAST_KEYWORDS.test(String(name || ""));
}
