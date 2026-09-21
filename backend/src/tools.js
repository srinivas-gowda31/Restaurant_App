import { prisma, DEFAULT_HOTEL_ID } from "./db.js";

export const toolDeclarations = [
  {
    name: "search_menu",
    description: "Search the hotel's food and beverage menu items, optionally filtered by category or vegetarian status.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search term to match against item names/descriptions." },
        category: { type: "string", description: "Filter by category, e.g. Starters, Mains, Desserts, Beverages." },
        vegetarian: { type: "boolean", description: "true for vegetarian-only, false for non-vegetarian-only." },
      },
    },
  },
  {
    name: "search_spa",
    description: "Search the hotel's spa services, optionally filtered by category.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text search term to match against service names/descriptions." },
        category: { type: "string", description: "Filter by category, e.g. Massage, Skincare." },
      },
    },
  },
  {
    name: "add_to_order",
    description: "Add an item (menu or spa) to the guest's current order cart.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact name of the item to add." },
        quantity: { type: "number", description: "Quantity to add. Defaults to 1." },
      },
      required: ["name"],
    },
  },
  {
    name: "remove_from_order",
    description: "Remove an item from the guest's current order cart.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact name of the item to remove." },
      },
      required: ["name"],
    },
  },
  {
    name: "confirm_order",
    description: "Finalize and confirm the guest's order, persisting it to the database. Only call this after the guest explicitly confirms.",
    parameters: {
      type: "object",
      properties: {
        items: {
          type: "array",
          description: "The full list of items in the order being confirmed.",
          items: {
            type: "object",
            properties: {
              name: { type: "string" },
              quantity: { type: "number" },
              unitPrice: { type: "number" },
            },
            required: ["name", "quantity", "unitPrice"],
          },
        },
        guestName: { type: "string" },
        roomNumber: { type: "string" },
      },
      required: ["items"],
    },
  },
];

async function searchMenu({ query, category, vegetarian }) {
  const where = { hotelId: DEFAULT_HOTEL_ID, isActive: true };
  if (category) where.category = { equals: category, mode: "insensitive" };
  if (typeof vegetarian === "boolean") where.vegetarian = vegetarian;
  if (query) where.name = { contains: query, mode: "insensitive" };

  const items = await prisma.menuItem.findMany({ where, take: 20 });
  return { items };
}

async function searchSpa({ query, category }) {
  const where = { hotelId: DEFAULT_HOTEL_ID, isActive: true };
  if (category) where.category = { equals: category, mode: "insensitive" };
  if (query) where.name = { contains: query, mode: "insensitive" };

  const services = await prisma.spaService.findMany({ where, take: 20 });
  return { services };
}

async function resolveItemPrice(name) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name } },
  });
  if (menuItem) return { unitPrice: menuItem.price, menuItemId: menuItem.id, spaServiceId: null };

  const spaService = await prisma.spaService.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name } },
  });
  if (spaService) return { unitPrice: spaService.price, menuItemId: null, spaServiceId: spaService.id };

  return null;
}

async function addToOrder({ name, quantity = 1 }) {
  const resolved = await resolveItemPrice(name);
  if (!resolved) return { success: false, message: `Could not find an item named "${name}".` };
  return {
    success: true,
    cartAction: { type: "add", name, quantity, unitPrice: resolved.unitPrice },
  };
}

async function removeFromOrder({ name }) {
  return {
    success: true,
    cartAction: { type: "remove", name },
  };
}

async function confirmOrder({ items, guestName, roomNumber }, sessionId) {
  if (!items || items.length === 0) {
    return { success: false, message: "Cannot confirm an empty order." };
  }

  const total = items.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0);

  const order = await prisma.order.create({
    data: {
      hotelId: DEFAULT_HOTEL_ID,
      sessionId,
      guestName: guestName || null,
      roomNumber: roomNumber || null,
      total,
      status: "confirmed",
      items: {
        create: await Promise.all(
          items.map(async (i) => {
            const resolved = await resolveItemPrice(i.name);
            return {
              name: i.name,
              quantity: i.quantity,
              unitPrice: i.unitPrice,
              menuItemId: resolved?.menuItemId || null,
              spaServiceId: resolved?.spaServiceId || null,
            };
          })
        ),
      },
    },
    include: { items: true },
  });

  return {
    success: true,
    orderId: order.id,
    total: order.total,
    cartAction: { type: "clear" },
  };
}

export async function executeTool(name, args, context) {
  switch (name) {
    case "search_menu":
      return searchMenu(args);
    case "search_spa":
      return searchSpa(args);
    case "add_to_order":
      return addToOrder(args);
    case "remove_from_order":
      return removeFromOrder(args);
    case "confirm_order":
      return confirmOrder(args, context.sessionId);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
