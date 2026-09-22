import ExcelJS from "exceljs";

const NAME_KEYS = ["name", "item", "itemname", "item name", "dish", "dish name"];
const CATEGORY_KEYS = ["category", "type", "section"];
const VEG_KEYS = ["vegetarian", "veg", "isveg", "is_veg", "veg/nonveg", "veg type"];
const PRICE_KEYS = ["price", "cost", "rate", "amount"];
const DESCRIPTION_KEYS = ["description", "desc", "details", "notes"];
const DURATION_KEYS = ["duration", "durationmin", "duration (min)", "duration_min", "duration in minutes"];

function normalizeHeader(h) {
  return String(h || "").trim().toLowerCase();
}

function findValue(rowObj, keys) {
  for (const key of keys) {
    if (rowObj[key] !== undefined && rowObj[key] !== "") return rowObj[key];
  }
  return undefined;
}

function parseVegetarian(raw) {
  if (typeof raw === "boolean") return raw;
  const s = String(raw || "").trim().toLowerCase();
  return ["true", "yes", "veg", "v", "1"].includes(s);
}

/**
 * Parses an uploaded .xlsx spreadsheet into menu/spa item rows.
 * Expects a header row with recognizable column names (case-insensitive):
 * name, category, vegetarian (menu only), price, description, duration (spa only).
 */
export async function parseSpreadsheet(buffer, type) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer);
  const sheet = workbook.worksheets[0];
  if (!sheet) return [];

  const headerRow = sheet.getRow(1);
  const headers = [];
  headerRow.eachCell({ includeEmpty: true }, (cell, colNumber) => {
    headers[colNumber] = normalizeHeader(cell.value);
  });

  const items = [];
  for (let rowNumber = 2; rowNumber <= sheet.rowCount; rowNumber++) {
    const row = sheet.getRow(rowNumber);
    if (row.cellCount === 0) continue;

    const rowObj = {};
    row.eachCell({ includeEmpty: true }, (cell, colNumber) => {
      const header = headers[colNumber];
      if (header) rowObj[header] = cell.value;
    });

    const name = String(findValue(rowObj, NAME_KEYS) || "").trim();
    if (!name) continue;

    const price = Number(findValue(rowObj, PRICE_KEYS)) || 0;
    const category = String(findValue(rowObj, CATEGORY_KEYS) || "Other").trim();
    const description = String(findValue(rowObj, DESCRIPTION_KEYS) || "").trim();

    if (type === "spa") {
      const durationRaw = findValue(rowObj, DURATION_KEYS);
      items.push({
        name,
        category,
        price,
        description,
        durationMin: durationRaw ? Number(durationRaw) : undefined,
      });
    } else {
      items.push({
        name,
        category,
        price,
        description,
        vegetarian: parseVegetarian(findValue(rowObj, VEG_KEYS)),
      });
    }
  }

  return items;
}
