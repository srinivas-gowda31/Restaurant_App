import { describe, it, expect } from "vitest";
import { MENU_CATEGORIES, normalizeMenuCategory } from "../src/menuCategories.js";

describe("normalizeMenuCategory", () => {
  it("passes through an exact canonical category", () => {
    for (const c of MENU_CATEGORIES) expect(normalizeMenuCategory(c)).toBe(c);
  });

  it("is case-insensitive on exact matches", () => {
    expect(normalizeMenuCategory("desserts")).toBe("Desserts");
  });

  it("maps known legacy labels", () => {
    expect(normalizeMenuCategory("Soups")).toBe("Starters");
    expect(normalizeMenuCategory("Pizza")).toBe("Main Course");
    expect(normalizeMenuCategory("Mojitos")).toBe("Beverages");
  });

  it("maps by keyword when no exact/legacy match exists", () => {
    expect(normalizeMenuCategory("Fresh Juice Counter")).toBe("Beverages");
    expect(normalizeMenuCategory("Chef's Soup Special")).toBe("Starters");
    expect(normalizeMenuCategory("House Cake")).toBe("Desserts");
  });

  it("falls back to Main Course for anything unrecognized", () => {
    expect(normalizeMenuCategory("Miscellaneous")).toBe("Main Course");
    expect(normalizeMenuCategory("")).toBe("Main Course");
    expect(normalizeMenuCategory(undefined)).toBe("Main Course");
  });
});
