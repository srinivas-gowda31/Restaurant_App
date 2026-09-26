import { MENU_CATEGORIES } from "./menuCategories.js";
import { CUISINES } from "./cuisines.js";

export const EXTRACTION_INSTRUCTIONS = {
  spa: "Extract all spa/wellness services from this document. For each: name, category (e.g. Massage, Skincare), price (number, no currency symbols), durationMin (minutes, if listed), and a short description.",
  housekeeping:
    "Extract all housekeeping/amenity items guests can request from this document (e.g. water bottles, towels, toiletries). For each: name, category (e.g. Amenities, Linens, Toiletries), price (number, no currency symbols; use 0 if complimentary), and a short description.",
  library:
    "Extract all books/reading material from this document. For each: name (the title), category (genre), author (if listed), price (number; use 0 if free to borrow), and a short description.",
  menu: `Extract all food and beverage menu items from this document. For each item, classify it into EXACTLY one of
these four categories based on what it is (not on any section heading in the source document): ${MENU_CATEGORIES.join(", ")}.
Rice/noodle/pasta dishes, pizzas, burgers, sandwiches, and other full plates go in "Main Course". Soups, salads,
small plates, and finger food go in "Starters". Sweets and desserts go in "Desserts". Drinks (hot, cold, alcoholic
or not) go in "Beverages". Also classify each item into EXACTLY one of these three cuisines, based on the dish
itself (not the section heading): ${CUISINES.join(", ")}. Dishes like biryani, tikka, tandoori, paneer, naan,
paratha, chaat, and Indian sweets/chai are "Indian". Dishes like manchurian, hakka noodles, momos, schezwan,
fried rice, and chilli-tossed items are "Chinese". Everything else — pizza, pasta, burgers, sandwiches, steaks,
salads, French/Western dishes, desserts, and beverages — is "Continental". For each item also give: name,
vegetarian (true/false), price (number, no currency symbols), and a short description. This text came from OCR
and item names may be garbled with odd spacing or misread characters — extract every name-plus-price pattern you
can find anyway, using your best guess at the intended name, category, and cuisine rather than skipping it. Never
return an empty items list if the text contains any recognizable name/price pairs.`,
};
