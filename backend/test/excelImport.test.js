import { describe, it, expect } from "vitest";
import ExcelJS from "exceljs";
import { parseSpreadsheet } from "../src/excelImport.js";

async function buildSheet(headers, rows) {
  const workbook = new ExcelJS.Workbook();
  const sheet = workbook.addWorksheet("Sheet1");
  sheet.addRow(headers);
  for (const row of rows) sheet.addRow(row);
  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}

describe("parseSpreadsheet", () => {
  it("parses menu rows with vegetarian and optional cuisine columns", async () => {
    const buffer = await buildSheet(
      ["name", "category", "price", "description", "vegetarian", "cuisine"],
      [
        ["Butter Chicken", "Main Course", 350, "Rich tomato gravy", "no", "Indian"],
        ["Veg Fried Rice", "Main Course", 220, "", "yes", ""],
      ]
    );
    const items = await parseSpreadsheet(buffer, "menu");

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ name: "Butter Chicken", category: "Main Course", price: 350, vegetarian: false, cuisine: "Indian" });
    expect(items[1]).toMatchObject({ name: "Veg Fried Rice", vegetarian: true });
    // No cuisine column value given for this row — left undefined, not an empty string,
    // so downstream code (buildCatalogData) can tell "not provided" from "explicitly blank".
    expect(items[1].cuisine).toBeUndefined();
  });

  it("skips rows with no name", async () => {
    const buffer = await buildSheet(
      ["name", "category", "price"],
      [
        ["", "Main Course", 100],
        ["Real Item", "Main Course", 100],
      ]
    );
    const items = await parseSpreadsheet(buffer, "menu");
    expect(items).toHaveLength(1);
    expect(items[0].name).toBe("Real Item");
  });

  it("recognizes header aliases case-insensitively", async () => {
    const buffer = await buildSheet(["Item Name", "Section", "Rate"], [["Green Tea", "Beverages", 80]]);
    const items = await parseSpreadsheet(buffer, "menu");
    expect(items[0]).toMatchObject({ name: "Green Tea", category: "Beverages", price: 80 });
  });

  it("defaults price to 0 when missing/non-numeric", async () => {
    const buffer = await buildSheet(["name", "category", "price"], [["Free Item", "Main Course", "n/a"]]);
    const items = await parseSpreadsheet(buffer, "menu");
    expect(items[0].price).toBe(0);
  });
});
