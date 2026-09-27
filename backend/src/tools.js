import { Prisma } from "@prisma/client";
import { prisma, DEFAULT_HOTEL_ID } from "./db.js";
import { CUISINES } from "./cuisines.js";

export const toolDeclarations = [
  {
    name: "search_menu",
    description:
      "Search food/beverage menu items. Optional category, cuisine, or vegetarian filter. Use cuisine whenever " +
      "the guest asks for a cuisine by name (e.g. \"Indian food\", \"something Chinese\") instead of relying on query text alone.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text term against name/description." },
        category: { type: "string", description: "e.g. Starters, Mains, Desserts, Beverages." },
        cuisine: { type: "string", description: `One of: ${CUISINES.join(", ")}.`, enum: CUISINES },
        vegetarian: { type: "boolean", description: "true=veg-only, false=non-veg-only." },
      },
      required: [],
    },
  },
  {
    name: "search_spa",
    description: "Search spa services. Optional category filter.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text term against name/description." },
        category: { type: "string", description: "e.g. Massage, Skincare." },
      },
      required: [],
    },
  },
  {
    name: "search_housekeeping",
    description: "Search housekeeping/amenity items (water, towels, toiletries, etc.).",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text term against name/description." },
        category: { type: "string", description: "e.g. Amenities, Linens, Toiletries." },
      },
      required: [],
    },
  },
  {
    name: "search_library",
    description: "Search library books/reading material.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text term against title/author/description." },
        category: { type: "string", description: "Genre." },
      },
      required: [],
    },
  },
  {
    name: "add_to_order",
    description:
      "Add an item to the cart. Returns the updated cart+total — quote that total verbatim to the guest, never compute it yourself.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact item name." },
        quantity: { type: "number", description: "Defaults to 1." },
      },
      required: ["name"],
    },
  },
  {
    name: "remove_from_order",
    description: "Remove an item from the cart. Returns the updated cart+total — quote it verbatim, never compute it yourself.",
    parameters: {
      type: "object",
      properties: {
        name: { type: "string", description: "Exact item name." },
      },
      required: ["name"],
    },
  },
  {
    name: "get_cart",
    description: "Look up the current cart+total server-side. Call if unsure (e.g. guest asks to hear it back) instead of relying on memory.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "confirm_order",
    description:
      "Finalize the current cart (tracked automatically — do not pass items) and persist it. Call only after the " +
      "guest explicitly confirms and you have their room number (ask first if you don't — staff need it to route the request).",
    parameters: {
      type: "object",
      properties: {
        guestName: { type: "string" },
        roomNumber: { type: "string", description: "Required." },
      },
      required: ["roomNumber"],
    },
  },
  {
    name: "notify_front_desk",
    description:
      "Alert staff about anything outside a catalog order — complaint, facility issue (AC/plumbing/Wi-Fi), wanting " +
      "a manager, safety concern, etc. Use instead of forcing it through search/order tools.",
    parameters: {
      type: "object",
      properties: {
        issue: { type: "string", description: "Concise summary of what staff need to handle." },
        roomNumber: { type: "string", description: "If already given." },
        urgent: { type: "boolean", description: "true for immediate attention (e.g. safety)." },
      },
      required: ["issue"],
    },
  },
];

/**
 * Fuzzy/typo-tolerant catalog search shared by all four catalogs. A free-text query uses
 * trigram similarity (pg_trgm) so plurals, typos, and imperfect voice transcriptions
 * ("water bottles" vs. "Water Bottle", "buttar chicken" vs. "Butter Chicken") still find
 * the right item instead of requiring an exact substring match.
 */
async function fuzzyCatalogSearch(tableName, { query, category, extraConditions = [] } = {}) {
  const trimmedQuery = query?.trim();
  const table = Prisma.raw(`"${tableName}"`);
  const conditions = [
    Prisma.sql`"hotelId" = ${DEFAULT_HOTEL_ID}`,
    Prisma.sql`"isActive" = true`,
    ...extraConditions,
  ];
  if (category) conditions.push(Prisma.sql`category ILIKE ${category}`);

  if (trimmedQuery) {
    conditions.push(Prisma.sql`(name ILIKE ${"%" + trimmedQuery + "%"} OR similarity(name, ${trimmedQuery}) > 0.2)`);
    return prisma.$queryRaw(Prisma.sql`
      SELECT * FROM ${table}
      WHERE ${Prisma.join(conditions, " AND ")}
      ORDER BY similarity(name, ${trimmedQuery}) DESC
      LIMIT 20
    `);
  }

  return prisma.$queryRaw(Prisma.sql`
    SELECT * FROM ${table}
    WHERE ${Prisma.join(conditions, " AND ")}
    LIMIT 20
  `);
}

async function searchMenu({ query, category, cuisine, vegetarian }) {
  const extraConditions = [];
  if (typeof vegetarian === "boolean") extraConditions.push(Prisma.sql`vegetarian = ${vegetarian}`);
  if (cuisine) extraConditions.push(Prisma.sql`cuisine ILIKE ${cuisine}`);
  const items = await fuzzyCatalogSearch("MenuItem", { query, category, extraConditions });
  return { items };
}

async function searchSpa({ query, category }) {
  const services = await fuzzyCatalogSearch("SpaService", { query, category });
  return { services };
}

async function searchHousekeeping({ query, category }) {
  const items = await fuzzyCatalogSearch("HousekeepingItem", { query, category });
  return { items };
}

async function searchLibrary({ query, category }) {
  const items = await fuzzyCatalogSearch("LibraryItem", { query, category });
  return { items };
}

/**
 * Resolves an item name against every catalog so add/confirm can route it to
 * the right fulfillment department (kitchen, housekeeping, spa, library).
 */
async function resolveItem(name) {
  const menuItem = await prisma.menuItem.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name, mode: "insensitive" } },
  });
  if (menuItem) return { department: "kitchen", unitPrice: menuItem.price, menuItemId: menuItem.id };

  const spaService = await prisma.spaService.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name, mode: "insensitive" } },
  });
  if (spaService) return { department: "spa", unitPrice: spaService.price, spaServiceId: spaService.id };

  const housekeepingItem = await prisma.housekeepingItem.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name, mode: "insensitive" } },
  });
  if (housekeepingItem) {
    return { department: "housekeeping", unitPrice: housekeepingItem.price, housekeepingItemId: housekeepingItem.id };
  }

  const libraryItem = await prisma.libraryItem.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true, name: { equals: name, mode: "insensitive" } },
  });
  if (libraryItem) return { department: "library", unitPrice: libraryItem.price, libraryItemId: libraryItem.id };

  return null;
}

// The model was asked to "track the cart yourself" and recite running totals from memory —
// it kept getting the arithmetic wrong (e.g. summing 3 items as if there were only 2). Cart
// state lives here instead, and every add/remove/get returns the authoritative total so the
// model only ever has to repeat a number back, never compute one. Persisted in Postgres
// (CartItem, keyed by sessionId) rather than an in-memory Map — a guest's in-progress cart
// used to vanish on every server restart/redeploy, and a single-process Map can't be shared
// if this backend ever runs as more than one instance.
async function getCart(sessionId) {
  return prisma.cartItem.findMany({ where: { sessionId }, orderBy: { createdAt: "asc" } });
}

function cartSummary(cart) {
  return {
    cart: cart.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    total: cart.reduce((sum, i) => sum + i.unitPrice * i.quantity, 0),
  };
}

async function addToOrder({ name, quantity = 1 }, sessionId) {
  const resolved = await resolveItem(name);
  if (!resolved) return { success: false, message: `Could not find an item named "${name}".` };

  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
  const existing = await prisma.cartItem.findFirst({
    where: { sessionId, name: { equals: name, mode: "insensitive" } },
  });
  if (existing) {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity: existing.quantity + qty } });
  } else {
    await prisma.cartItem.create({
      data: {
        sessionId,
        name,
        quantity: qty,
        unitPrice: resolved.unitPrice,
        department: resolved.department,
        menuItemId: resolved.menuItemId || null,
        spaServiceId: resolved.spaServiceId || null,
        housekeepingItemId: resolved.housekeepingItemId || null,
        libraryItemId: resolved.libraryItemId || null,
      },
    });
  }

  const cart = await getCart(sessionId);
  return {
    success: true,
    cartAction: { type: "add", name, quantity: qty, unitPrice: resolved.unitPrice, department: resolved.department },
    ...cartSummary(cart),
  };
}

async function removeFromOrder({ name }, sessionId) {
  await prisma.cartItem.deleteMany({ where: { sessionId, name: { equals: name, mode: "insensitive" } } });

  const cart = await getCart(sessionId);
  return {
    success: true,
    cartAction: { type: "remove", name },
    ...cartSummary(cart),
  };
}

async function getCartTool(sessionId) {
  return { success: true, ...cartSummary(await getCart(sessionId)) };
}

const DEPARTMENT_TABLE = {
  kitchen: prisma.kitchenTicket,
  housekeeping: prisma.housekeepingRequest,
  spa: prisma.spaBooking,
  library: prisma.libraryRequest,
};

async function confirmOrder({ guestName, roomNumber }, sessionId) {
  // The cart the model has been building via add_to_order/remove_from_order is the
  // authoritative source — not whatever the model might separately claim the order is,
  // which is exactly what was producing wrong totals when it recomputed from memory.
  const cart = await getCart(sessionId);
  if (cart.length === 0) {
    return { success: false, message: "Cannot confirm an empty order." };
  }

  // Fall back to whatever room/guest context the session already carries (e.g. set from a
  // scanned room QR code) so the guest is never re-asked for details we already have.
  if (!roomNumber || !guestName) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    roomNumber = roomNumber || session?.roomNumber || null;
    guestName = guestName || session?.guestName || null;
  }

  if (!roomNumber || !roomNumber.trim()) {
    return { success: false, message: "Ask the guest for their room number before confirming — it's required so staff know where to deliver." };
  }

  // Re-resolve each item against the live catalog rather than trusting the cart's cached
  // unitPrice — a menu price could have changed since it was added — so money/fulfillment
  // always reflects the current catalog.
  const resolvedItems = await Promise.all(
    cart.map(async (i) => {
      const resolved = await resolveItem(i.name);
      return { name: i.name, quantity: i.quantity, resolved };
    })
  );

  const unresolved = resolvedItems.filter((i) => !i.resolved);
  if (unresolved.length > 0) {
    return {
      success: false,
      message: `Could not confirm — these items are no longer on the catalog: ${unresolved.map((i) => i.name).join(", ")}. Remove them and try again.`,
    };
  }

  const total = resolvedItems.reduce((sum, i) => sum + i.resolved.unitPrice * i.quantity, 0);

  const order = await prisma.order.create({
    data: {
      hotelId: DEFAULT_HOTEL_ID,
      sessionId,
      guestName: guestName || null,
      roomNumber: roomNumber || null,
      total,
      status: "confirmed",
      items: {
        create: resolvedItems.map((i) => ({
          name: i.name,
          quantity: i.quantity,
          unitPrice: i.resolved.unitPrice,
          department: i.resolved.department,
          menuItemId: i.resolved.menuItemId || null,
          spaServiceId: i.resolved.spaServiceId || null,
          housekeepingItemId: i.resolved.housekeepingItemId || null,
          libraryItemId: i.resolved.libraryItemId || null,
        })),
      },
    },
    include: { items: true },
  });

  await Promise.all(
    order.items.map((orderItem) => {
      const table = DEPARTMENT_TABLE[orderItem.department] || DEPARTMENT_TABLE.kitchen;
      return table.create({
        data: {
          orderId: order.id,
          orderItemId: orderItem.id,
          itemName: orderItem.name,
          quantity: orderItem.quantity,
          roomNumber: roomNumber || null,
          status: "pending",
        },
      });
    })
  );

  await prisma.cartItem.deleteMany({ where: { sessionId } });

  return {
    success: true,
    orderId: order.id,
    total: order.total,
    cartAction: { type: "clear" },
  };
}

async function notifyFrontDesk({ issue, roomNumber, urgent }, sessionId) {
  if (!issue || !issue.trim()) {
    return { success: false, message: "Cannot notify the front desk without a description of the issue." };
  }

  if (!roomNumber) {
    const session = await prisma.session.findUnique({ where: { id: sessionId } });
    roomNumber = session?.roomNumber || null;
  }

  const alert = await prisma.frontDeskAlert.create({
    data: {
      hotelId: DEFAULT_HOTEL_ID,
      sessionId,
      issue: issue.trim(),
      roomNumber: roomNumber || null,
      urgency: urgent ? "urgent" : "normal",
    },
  });

  return { success: true, alertId: alert.id, escalation: { issue: alert.issue, urgent: !!urgent } };
}

const SEARCH_RESULT_KEYS = {
  search_menu: { type: "menu", key: "items" },
  search_spa: { type: "spa", key: "services" },
  search_housekeeping: { type: "housekeeping", key: "items" },
  search_library: { type: "library", key: "items" },
};

export function buildItemsTable(toolName, result) {
  const mapping = SEARCH_RESULT_KEYS[toolName];
  if (!mapping) return null;
  const items = result[mapping.key];
  if (!items) return null;
  return { type: mapping.type, items };
}

// Only the fields the model actually reasons over — item resolution happens by name
// lookup elsewhere, so id/hotelId/isActive/timestamps are pure token cost with zero
// behavioral value once they're in the model's context. The frontend table (buildItemsTable,
// above) still gets the full untrimmed rows; this only shrinks what goes to the LLM.
const MODEL_ITEM_FIELDS = {
  search_menu: ({ name, category, cuisine, vegetarian, price, description }) => ({ name, category, cuisine, vegetarian, price, description }),
  search_spa: ({ name, category, durationMin, price, description }) => ({ name, category, durationMin, price, description }),
  search_housekeeping: ({ name, category, price, description }) => ({ name, category, price, description }),
  search_library: ({ name, category, author, price, description }) => ({ name, category, author, price, description }),
};

export function trimResultForModel(toolName, result) {
  const mapping = SEARCH_RESULT_KEYS[toolName];
  const items = mapping && result[mapping.key];
  if (!mapping || !items) return result;
  return { ...result, [mapping.key]: items.map(MODEL_ITEM_FIELDS[toolName]) };
}

export async function executeTool(name, args, context) {
  switch (name) {
    case "search_menu":
      return searchMenu(args);
    case "search_spa":
      return searchSpa(args);
    case "search_housekeeping":
      return searchHousekeeping(args);
    case "search_library":
      return searchLibrary(args);
    case "add_to_order":
      return addToOrder(args, context.sessionId);
    case "remove_from_order":
      return removeFromOrder(args, context.sessionId);
    case "get_cart":
      return getCartTool(context.sessionId);
    case "confirm_order":
      return confirmOrder(args, context.sessionId);
    case "notify_front_desk":
      return notifyFrontDesk(args, context.sessionId);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
