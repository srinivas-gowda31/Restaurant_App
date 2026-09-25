export const MENU_CATEGORIES = ["Starters", "Main Course", "Desserts", "Beverages"];

// Exact (case-insensitive) mapping for category labels already seen in this hotel's
// uploaded menus, so the one-time cleanup and any future re-upload of the same source
// documents classify consistently.
const LEGACY_CATEGORY_MAP = {
  starters: "Starters",
  soups: "Starters",
  salades: "Starters",
  salads: "Starters",
  "chinese tadka": "Starters",
  rolls: "Starters",
  momos: "Starters",
  snacks: "Starters",
  maggis: "Starters",
  fries: "Starters",
  "chaat adda special": "Starters",

  mains: "Main Course",
  plats: "Main Course",
  calzone: "Main Course",
  "fried rice": "Main Course",
  pastas: "Main Course",
  pasticcio: "Main Course",
  pizza: "Main Course",
  chika: "Main Course",
  noodles: "Main Course",
  tacos: "Main Course",
  sandwich: "Main Course",
  sandwiches: "Main Course",
  burger: "Main Course",
  burgers: "Main Course",

  dessert: "Desserts",
  desserts: "Desserts",
  pastries: "Desserts",

  beverages: "Beverages",
  mojitos: "Beverages",
  "tea/coffee": "Beverages",
  "shakes & coffee": "Beverages",
};

const KEYWORD_RULES = [
  {
    category: "Desserts",
    keywords: ["dessert", "sweet", "pastry", "cake", "tiramisu", "pudding", "brownie", "donut", "ice cream", "meetha"],
  },
  {
    category: "Beverages",
    keywords: ["beverage", "drink", "juice", "tea", "coffee", "shake", "mojito", "cocktail", "water", "soda", "lassi", "cola"],
  },
  {
    category: "Starters",
    keywords: ["starter", "appetizer", "soup", "salad", "snack", "chaat", "momo", "maggi", "fries", "roll", "spring roll", "manchurian"],
  },
];

/**
 * Maps any freeform category string (from Excel uploads, legacy data, or a
 * model that ignored the schema) onto one of the four canonical menu
 * categories. Falls back to "Main Course" as the safest default for a dish.
 */
export function normalizeMenuCategory(rawCategory) {
  const value = String(rawCategory || "").trim();
  const exact = MENU_CATEGORIES.find((c) => c.toLowerCase() === value.toLowerCase());
  if (exact) return exact;

  const lower = value.toLowerCase();
  if (LEGACY_CATEGORY_MAP[lower]) return LEGACY_CATEGORY_MAP[lower];

  for (const rule of KEYWORD_RULES) {
    if (rule.keywords.some((k) => lower.includes(k))) return rule.category;
  }
  return "Main Course";
}
