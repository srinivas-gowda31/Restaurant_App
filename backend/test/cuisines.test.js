import { describe, it, expect } from "vitest";
import { CUISINES, normalizeCuisine } from "../src/cuisines.js";

describe("normalizeCuisine", () => {
  it("passes through an exact canonical cuisine", () => {
    for (const c of CUISINES) expect(normalizeCuisine(c)).toBe(c);
  });

  it("is case-insensitive", () => {
    expect(normalizeCuisine("indian")).toBe("Indian");
    expect(normalizeCuisine("CHINESE")).toBe("Chinese");
  });

  it("trims whitespace", () => {
    expect(normalizeCuisine("  Indian  ")).toBe("Indian");
  });

  it("falls back to Continental for anything unrecognized", () => {
    expect(normalizeCuisine("Mexican")).toBe("Continental");
    expect(normalizeCuisine("")).toBe("Continental");
    expect(normalizeCuisine(null)).toBe("Continental");
    expect(normalizeCuisine(undefined)).toBe("Continental");
  });
});
