import { Prisma } from "@prisma/client";
import { prisma, DEFAULT_HOTEL_ID } from "./db.js";
import { CUISINES } from "./cuisines.js";
import { MENU_CATEGORIES, normalizeMenuCategory } from "./menuCategories.js";

export const toolDeclarations = [
  {
    name: "search_menu",
    description:
      "Search food/beverage menu items. Optional category, cuisine, breakfast, snack, or vegetarian filter. Use " +
      "cuisine whenever the guest asks for a cuisine by name (e.g. \"Indian food\", \"something Chinese\"). If " +
      "they name more than one cuisine in the same breath (\"South Indian or Chinese\"), pass ALL of them in one " +
      "call (e.g. cuisine: [\"South Indian\", \"Chinese\"]) instead of calling search_menu once per cuisine — " +
      "each call costs real time and budget, so one combined call beats several separate ones. " +
      "Use breakfast:true for \"breakfast\" and snack:true for \"snacks\"/\"something light\" — neither is a " +
      "category value (category is Starters/Main Course/Desserts/Beverages), they're separate filters. Starters " +
      "includes salads/soups too, which are NOT snacks — snack:true excludes those automatically. For \"lunch\" " +
      "or \"dinner\" specifically (there's no separate lunch/dinner data — this menu just excludes breakfast), " +
      "pass breakfast:false so breakfast-only dishes don't show up in a lunch/dinner browse.",
    parameters: {
      type: "object",
      properties: {
        query: { type: "string", description: "Free-text term against name/description." },
        category: { type: "string", description: `One of: ${MENU_CATEGORIES.join(", ")}.`, enum: MENU_CATEGORIES },
        cuisine: {
          type: "array",
          items: { type: "string", enum: CUISINES },
          description: `One or more of: ${CUISINES.join(", ")}. Pass every cuisine the guest mentioned in this one call, not one call per cuisine.`,
        },
        breakfast: {
          type: "boolean",
          description: "true = only breakfast-appropriate dishes (dosa, idli, omelette, toast, etc). false = exclude them (use for lunch/dinner requests).",
        },
        snack: { type: "boolean", description: "true = only casual snack items (excludes salads/soups/bread loaves)." },
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
  {
    name: "get_order_history",
    description:
      "Look up past confirmed orders for the guest's own room — use when they ask what they ordered before, " +
      "their order history, or similar. Takes no parameters: it always uses the room already on file for this " +
      "conversation, never a room the guest types or says, so one guest can never see another room's orders.",
    parameters: { type: "object", properties: {}, required: [] },
  },
  {
    name: "get_recommendation",
    description:
      "Get data-driven pairing suggestions for a food item — ranked from what real past guests actually ordered " +
      "alongside it, falling back to sensible category rules (a bread pairs with a gravy/curry main, a main " +
      "course pairs with a starter, etc.) when there's no order history yet for that item, or when the closest " +
      "real co-occurrence isn't actually a sensible pairing (e.g. a condiment). Also returns a separate " +
      "beverageRecommendation alongside the main one whenever a drink makes sense — mention both naturally if " +
      "both come back. Call this once, silently, right after add_to_order for a food item, before replying — " +
      "never invent a pairing yourself, only use what this returns. Either field can come back null if nothing " +
      "suitable exists (e.g. everything's already in the cart).",
    parameters: {
      type: "object",
      properties: {
        itemName: { type: "string", description: "Exact name of the menu item just added." },
      },
      required: ["itemName"],
    },
  },
  {
    name: "verify_room",
    description:
      "Checks a room number the guest just SPOKE OR TYPED against this hotel's real room list — call this the " +
      "moment they give you one that wasn't already known from context (e.g. a scanned QR code), before doing " +
      "anything else with it. Returns exists:false if it doesn't match a real room, which means the transcription " +
      "or input was probably wrong — ask the guest to repeat or spell it out instead of proceeding with it. " +
      "Never skip this for a spoken/typed room number, and never substitute a nearby-sounding number yourself.",
    parameters: {
      type: "object",
      properties: {
        roomNumber: { type: "string", description: "The room number exactly as the guest said or typed it." },
      },
      required: ["roomNumber"],
    },
  },
  {
    name: "request_concierge_service",
    description:
      "Log a request for the CONCIERGE desk — transportation/cab booking, tours or sightseeing arrangements, " +
      "reserving a table at an outside restaurant, currency exchange, or sending/receiving a courier/package. " +
      "This is a real staff member arranging something, not an instant catalog item — never invent a price or " +
      "confirm a booking yourself; just log what the guest needs and reassure them staff will follow up.",
    parameters: {
      type: "object",
      properties: {
        category: {
          type: "string",
          enum: ["transportation", "tour", "reservation", "currency_exchange", "courier", "other"],
          description: "Which concierge desk this belongs to.",
        },
        details: { type: "string", description: "Everything staff need to actually arrange this (what, when, how many people, etc)." },
        roomNumber: { type: "string", description: "If already given." },
        urgent: { type: "boolean", description: "true only for a genuinely time-sensitive request (e.g. a cab needed in 10 minutes)." },
      },
      required: ["category", "details"],
    },
  },
];

// Groq's tool-use validation turned out to be strict enough to matter: confirmed live, the
// model generated notify_front_desk with roomNumber explicitly set to null (a normal thing for
// an LLM to do for an optional field it has no value for) and Groq rejected its OWN generation
// against our schema — a plain `type: "string"` doesn't accept null in JSON Schema — returning a
// hard 400 that crashed the whole chat turn with no reply at all. This isn't specific to that one
// tool/field; ANY optional string/array parameter across ANY tool could hit the same crash the
// next time a model chooses null over omitting the key. Rather than hand-annotating every
// optional field everywhere (easy to miss one), this widens every property NOT in a tool's
// `required` list to also accept null, generically, for any OpenAI-compatible provider that
// enforces this strictly (Groq, OpenRouter — see groqChat.js/openrouterChat.js). Azure's realtime
// API hasn't shown this failure mode, but applying the same widening there costs nothing and
// closes the door on it happening there too.
export function withNullableOptionals(tools) {
  return tools.map((t) => {
    const required = new Set(t.parameters?.required || []);
    const properties = t.parameters?.properties || {};
    const patched = {};
    for (const [key, schema] of Object.entries(properties)) {
      if (required.has(key) || Array.isArray(schema.type)) {
        patched[key] = schema;
      } else {
        patched[key] = { ...schema, type: [schema.type, "null"] };
      }
    }
    return { ...t, parameters: { ...t.parameters, properties: patched } };
  });
}

const RESULT_LIMIT = 20;

/**
 * Fuzzy/typo-tolerant catalog search shared by all four catalogs. A free-text query uses
 * trigram similarity (pg_trgm) so plurals, typos, and imperfect voice transcriptions
 * ("water bottles" vs. "Water Bottle", "buttar chicken" vs. "Butter Chicken") still find
 * the right item instead of requiring an exact substring match.
 *
 * Always returns totalCount alongside the (capped) items — a broad browse-by-category
 * query can genuinely match 100+ rows, and silently truncating to RESULT_LIMIT with no
 * signal that anything was cut looks identical to "that's everything" from the guest's
 * side. The model/UI can only offer to narrow the search down if they know there's more.
 */
async function fuzzyCatalogSearch(tableName, { hotelId, query, category, extraConditions = [], queryColumns = ["name"] } = {}) {
  const trimmedQuery = query?.trim();
  const table = Prisma.raw(`"${tableName}"`);
  const conditions = [
    Prisma.sql`"hotelId" = ${hotelId}`,
    Prisma.sql`"isActive" = true`,
    ...extraConditions,
  ];
  if (category) conditions.push(Prisma.sql`category ILIKE ${category}`);
  if (trimmedQuery) {
    // queryColumns lets a caller match more than just name — LibraryItem's author is the case
    // this exists for (confirmed directly: "the Orwell book" found nothing, since 1984's own
    // name has no "Orwell" in it at all). A NULL column (author is optional) just never matches
    // here rather than erroring — same as ILIKE/similarity against NULL normally behaving.
    const columnMatches = queryColumns.map((col) => {
      const column = Prisma.raw(col);
      return Prisma.sql`(${column} ILIKE ${"%" + trimmedQuery + "%"} OR similarity(${column}, ${trimmedQuery}) > 0.2)`;
    });
    conditions.push(Prisma.sql`(${Prisma.join(columnMatches, " OR ")})`);
  }
  const whereClause = Prisma.join(conditions, " AND ");

  const orderClause = trimmedQuery ? Prisma.sql`ORDER BY similarity(name, ${trimmedQuery}) DESC` : Prisma.empty;

  const [items, countRows] = await Promise.all([
    prisma.$queryRaw(Prisma.sql`
      SELECT * FROM ${table}
      WHERE ${whereClause}
      ${orderClause}
      LIMIT ${RESULT_LIMIT}
    `),
    prisma.$queryRaw(Prisma.sql`SELECT COUNT(*)::int AS count FROM ${table} WHERE ${whereClause}`),
  ]);

  return { items, totalCount: countRows[0].count };
}

async function searchMenu({ query, category, cuisine, breakfast, snack, vegetarian }, hotelId) {
  const extraConditions = [];
  if (typeof vegetarian === "boolean") extraConditions.push(Prisma.sql`vegetarian = ${vegetarian}`);
  // Accepts a single string too — some providers' tool-calling is loose about arrays of one,
  // and this is cheap to tolerate rather than reject.
  const cuisines = Array.isArray(cuisine) ? cuisine : cuisine ? [cuisine] : [];
  if (cuisines.length === 1) {
    extraConditions.push(Prisma.sql`cuisine ILIKE ${cuisines[0]}`);
  } else if (cuisines.length > 1) {
    extraConditions.push(
      Prisma.sql`(${Prisma.join(
        cuisines.map((c) => Prisma.sql`cuisine ILIKE ${c}`),
        " OR "
      )})`
    );
  }
  // breakfast:false/snack:false are real exclusion filters (a "lunch" request needs to
  // exclude breakfast items), not just no-ops like an omitted filter — previously only
  // `=== true` was ever handled, so there was no way to filter breakfast OUT of results.
  if (typeof breakfast === "boolean") extraConditions.push(Prisma.sql`breakfast = ${breakfast}`);
  if (typeof snack === "boolean") extraConditions.push(Prisma.sql`snack = ${snack}`);
  // Normalized rather than passed through as-is — the category filter below is an exact
  // match, so an off-by-a-word guess (e.g. "Mains" instead of the canonical "Main Course")
  // would otherwise silently match almost nothing instead of the intended category. This is
  // exactly the bug that made "vegetarian mains" return 2 items instead of 100+: a stray
  // legacy row literally labeled "Mains" matched, every correctly-labeled "Main Course" row
  // didn't. Normalizing here means any near-miss category value still resolves correctly.
  const normalizedCategory = category ? normalizeMenuCategory(category) : undefined;
  const { items, totalCount } = await fuzzyCatalogSearch("MenuItem", { hotelId, query, category: normalizedCategory, extraConditions });
  return { items, totalMatches: totalCount };
}

async function searchSpa({ query, category }, hotelId) {
  const { items, totalCount } = await fuzzyCatalogSearch("SpaService", { hotelId, query, category });
  return { services: items, totalMatches: totalCount };
}

async function searchHousekeeping({ query, category }, hotelId) {
  const { items, totalCount } = await fuzzyCatalogSearch("HousekeepingItem", { hotelId, query, category });
  return { items, totalMatches: totalCount };
}

async function searchLibrary({ query, category }, hotelId) {
  // Guests naturally ask for a book "by [author]" as often as by title — match both.
  const { items, totalCount } = await fuzzyCatalogSearch("LibraryItem", { hotelId, query, category, queryColumns: ["name", "author"] });
  return { items, totalMatches: totalCount };
}

/**
 * Resolves an item name against every catalog so add/confirm can route it to
 * the right fulfillment department (kitchen, housekeeping, spa, library).
 *
 * Was 4 sequential lookups (menu, then spa, then housekeeping, then library, stopping at the
 * first hit) — fine for a menu item (the common case, resolves on the first query), but a
 * spa/housekeeping/library item paid for 3-4 round trips back to back, each ~270-300ms against
 * this DB (that per-query cost is real network latency to Neon, not query complexity — confirmed
 * directly, a trivial findFirst measured the same). Running all four concurrently turns that
 * worst case into one round-trip's worth of wall time no matter which catalog actually matches.
 */
async function resolveItem(name, hotelId) {
  const where = { hotelId, isActive: true, name: { equals: name, mode: "insensitive" } };
  const [menuItem, spaService, housekeepingItem, libraryItem] = await Promise.all([
    prisma.menuItem.findFirst({ where }),
    prisma.spaService.findFirst({ where }),
    prisma.housekeepingItem.findFirst({ where }),
    prisma.libraryItem.findFirst({ where }),
  ]);

  // Priority order preserved exactly as before (menu > spa > housekeeping > library) for the
  // rare case a name collides across catalogs — just decided after all four come back instead
  // of short-circuiting between them.
  if (menuItem) return { department: "kitchen", unitPrice: menuItem.price, menuItemId: menuItem.id };
  if (spaService) return { department: "spa", unitPrice: spaService.price, spaServiceId: spaService.id };
  if (housekeepingItem) {
    return { department: "housekeeping", unitPrice: housekeepingItem.price, housekeepingItemId: housekeepingItem.id };
  }
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

async function addToOrder({ name, quantity = 1 }, sessionId, hotelId) {
  // resolveItem (a catalog lookup) and the existing-cart-item check don't depend on each other —
  // running them together instead of one after the other saves a full round trip's worth of
  // wall time (~270-300ms against this DB) on every single add_to_order call.
  const [resolved, existing] = await Promise.all([
    resolveItem(name, hotelId),
    prisma.cartItem.findFirst({ where: { sessionId, name: { equals: name, mode: "insensitive" } } }),
  ]);
  if (!resolved) return { success: false, message: `Could not find an item named "${name}".` };

  const qty = Number.isFinite(quantity) && quantity > 0 ? Math.floor(quantity) : 1;
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

export async function getCartTool(sessionId) {
  return { success: true, ...cartSummary(await getCart(sessionId)) };
}

// roomNumber comes from the verified session (set via the room's own QR code scan, see
// guestContext.js), never from tool args a guest could type — otherwise any guest could ask
// "show me room 305's orders" and read another guest's order history. This is the only reason
// this tool takes no parameters at all despite needing a room to look up.
const ORDER_HISTORY_LIMIT = 10;

async function getOrderHistory(roomNumber, hotelId) {
  if (!roomNumber) {
    return { success: false, message: "No room number on file yet for this conversation, so there's no order history to look up." };
  }

  // hotelId scoping matters here specifically: room numbers are only unique WITHIN a hotel
  // (@@unique([hotelId, number])), not globally — without this, "Room 204" at one hotel could
  // see another hotel's "Room 204" order history, a real cross-tenant data leak once more than
  // one hotel shares this database.
  const [orders, totalCount] = await Promise.all([
    prisma.order.findMany({
      where: { roomNumber, hotelId },
      include: { items: true },
      orderBy: { createdAt: "desc" },
      take: ORDER_HISTORY_LIMIT,
    }),
    prisma.order.count({ where: { roomNumber, hotelId } }),
  ]);

  return {
    success: true,
    orders: orders.map((o) => ({
      orderId: o.id,
      placedAt: o.createdAt,
      total: o.total,
      items: o.items.map((i) => ({ name: i.name, quantity: i.quantity, unitPrice: i.unitPrice })),
    })),
    totalMatches: totalCount,
  };
}

// Pairing recommendations used to live entirely in the system prompt as a hand-written list of
// category rules the model had to re-read and apply correctly on every single turn — real token
// cost for something deterministic, and no better than a lookup table since it never actually
// used this hotel's own order data. This does two things a prompt can't: (1) ranks by what real
// guests actually ordered together (gets smarter as orders accumulate, this hotel's actual
// patterns rather than generic assumptions), (2) is a single flat, cheap tool call instead of an
// LLM having to hold a whole category-mapping table in its head every reply.
const RECOMMENDATION_CANDIDATES = 10;

async function findFirstAvailable(where, excludeNames, hotelId) {
  const items = await prisma.menuItem.findMany({
    where: { hotelId, isActive: true, ...where },
    take: RECOMMENDATION_CANDIDATES,
  });
  return items.find((i) => !excludeNames.has(i.name.toLowerCase())) || null;
}

const BREAD_RE = /\b(naan|roti|rotis|paratha|parantha|kulcha|chapati|chapathi|khakhra|bhatura|bhature)\b/;
const GRAVY_RE = /curry|gravy|masala|makhani|korma|kadai|handi/;

// The single source of truth for "what's actually a sensible pairing for this item" — used to
// both filter real order-history co-occurrence AND drive the no-history fallback, so a
// frequent-but-nonsensical co-occurrence (see getRecommendation below) can never win just for
// being common. Returns a Prisma where-clause describing the TARGET category, or null if this
// item doesn't have an obvious one (nothing to constrain against).
function pairingFilter(source) {
  const name = source.name.toLowerCase();
  const vegConstraint = source.vegetarian ? { vegetarian: true } : {};

  if (source.breakfast) return { category: "Beverages", ...vegConstraint };

  if (name.includes("biryani")) {
    return {
      ...vegConstraint,
      OR: [
        { name: { contains: "raita", mode: "insensitive" } },
        { name: { contains: "buttermilk", mode: "insensitive" } },
        { name: { contains: "chaas", mode: "insensitive" } },
      ],
    };
  }

  // A bread's whole job is scooping up a gravy — confirmed live, real order history had guests
  // ordering Naan alongside Raita often enough to look like a real pattern, but a condiment is
  // not what "what goes with this" should ever answer for a bread. Always a real curry/gravy
  // main course, never a side.
  if (BREAD_RE.test(name)) {
    return {
      category: "Main Course",
      ...vegConstraint,
      OR: [
        { name: { contains: "curry", mode: "insensitive" } },
        { name: { contains: "gravy", mode: "insensitive" } },
        { name: { contains: "masala", mode: "insensitive" } },
        { name: { contains: "makhani", mode: "insensitive" } },
        { name: { contains: "korma", mode: "insensitive" } },
        { name: { contains: "kadai", mode: "insensitive" } },
      ],
    };
  }

  if (source.category === "Main Course" && GRAVY_RE.test(name)) {
    return {
      ...vegConstraint,
      OR: [{ name: { contains: "naan", mode: "insensitive" } }, { name: { contains: "rice", mode: "insensitive" } }],
    };
  }

  if (/pizza|burger|sandwich/.test(name)) {
    return {
      ...vegConstraint,
      OR: [
        { name: { contains: "fries", mode: "insensitive" } },
        { name: { contains: "garlic bread", mode: "insensitive" } },
        { name: { contains: "milkshake", mode: "insensitive" } },
      ],
    };
  }

  // Guests routinely ask for a starter alongside their main, so a main course pairs with a
  // starter — never the other way toward another main. A starter pairs with a main course.
  if (source.category === "Starters") return { category: "Main Course", ...vegConstraint };
  if (source.category === "Main Course") return { category: "Starters", ...vegConstraint };
  if (source.category === "Beverages") return { category: "Starters", snack: true, ...vegConstraint };
  if (source.category === "Desserts") return { category: "Beverages", ...vegConstraint };
  return null;
}

// Cold-start fallback for an item with no (or no usable) order history yet — the same pairing
// logic that used to be spelled out in the system prompt, now applied deterministically instead
// of re-derived by the model from a description every turn. Falls through to a beverage if the
// primary target category has nothing available, so a pairing is (almost) never just "none".
async function ruleBasedPairing(source, excludeNames, hotelId) {
  const filter = pairingFilter(source);
  const primary = filter ? await findFirstAvailable(filter, excludeNames, hotelId) : null;
  if (primary) return primary;
  if (source.category === "Beverages") return null; // already tried its own fallback above
  const vegConstraint = source.vegetarian ? { vegetarian: true } : {};
  return findFirstAvailable({ category: "Beverages", ...vegConstraint }, excludeNames, hotelId);
}

// Always tries to add a beverage alongside the primary pairing (never in place of it) — skipped
// only when the source itself, or the primary recommendation, is already a beverage, since
// suggesting a drink to go with a drink isn't a real pairing.
async function beveragePairing(source, primary, excludeNames, hotelId) {
  if (source.category === "Beverages" || primary?.category === "Beverages") return null;
  const vegConstraint = source.vegetarian ? { vegetarian: true } : {};
  const excluding = primary ? new Set([...excludeNames, primary.name.toLowerCase()]) : excludeNames;
  return findFirstAvailable({ category: "Beverages", ...vegConstraint }, excluding, hotelId);
}

function toRecommendationShape(item) {
  if (!item) return null;
  return { name: item.name, price: item.price, category: item.category, cuisine: item.cuisine };
}

async function getRecommendation({ itemName }, sessionId, hotelId) {
  // source (a catalog lookup) and the cart (a different table, keyed by sessionId) don't depend
  // on each other — running them together saves a round trip, same reasoning as addToOrder above.
  const [source, cart] = await Promise.all([
    prisma.menuItem.findFirst({
      where: { hotelId, isActive: true, name: { equals: itemName, mode: "insensitive" } },
    }),
    getCart(sessionId),
  ]);
  if (!source) {
    return { success: false, message: `"${itemName}" isn't a menu item on file, so there's nothing to pair it with.` };
  }
  const excludeNames = new Set([source.name.toLowerCase(), ...cart.map((i) => i.name.toLowerCase())]);

  // The same category filter that drives the no-history fallback ALSO gates which real
  // co-occurring items are even eligible — a frequent-but-nonsensical co-occurrence should never
  // win just for being common. Confirmed live: guests who ordered Naan often also ordered Raita
  // (a condiment), which passed the frequency bar easily but is not what "what goes with my
  // naan" should ever answer — a bread's pairing has to actually be a gravy/curry main course.
  // null filter (an item type with no obvious pairing rule) leaves co-occurrence unconstrained,
  // same as before this existed.
  const filter = pairingFilter(source);
  const eligibleIds = filter
    ? new Set(
        (await prisma.menuItem.findMany({ where: { hotelId, isActive: true, ...filter }, select: { id: true } })).map(
          (i) => i.id
        )
      )
    : null;

  // Real co-occurrence first: what did guests who ordered this item ALSO order, across every
  // past confirmed order in this hotel — ranked by how often, most common first. Only menu-item
  // pairings are considered (spa/housekeeping/library co-orders aren't meaningful "pairings").
  //
  // MIN_COOCCURRENCE_FREQ guards against a small hotel's thin order history: confirmed directly
  // — Chicken Biryani had only 5 past orders, and EVERY co-occurring item (including the ideal
  // "Raita") tied at freq=1, so plain "ORDER BY freq DESC" picked whichever one Postgres happened
  // to return first for a tie — not a real pattern, just noise from a single coincidental order.
  // Requiring a real repeated signal before trusting order history, and falling through to the
  // deterministic category rule otherwise, is what actually gets "biryani → raita" right until
  // this hotel has enough order volume for co-occurrence to mean something.
  const MIN_COOCCURRENCE_FREQ = 3;
  const coOccurring = await prisma.$queryRaw`
    SELECT oi2."menuItemId" AS "menuItemId", COUNT(*)::int AS freq
    FROM "OrderItem" oi1
    JOIN "OrderItem" oi2 ON oi1."orderId" = oi2."orderId" AND oi2.id != oi1.id
    WHERE oi1."menuItemId" = ${source.id} AND oi2."menuItemId" IS NOT NULL
    GROUP BY oi2."menuItemId"
    HAVING COUNT(*) >= ${MIN_COOCCURRENCE_FREQ}
    ORDER BY freq DESC, oi2."menuItemId" ASC
    LIMIT ${RECOMMENDATION_CANDIDATES}
  `;

  let primary = null;
  let basis = "none";
  for (const row of coOccurring) {
    if (eligibleIds && !eligibleIds.has(row.menuItemId)) continue;
    const candidate = await prisma.menuItem.findUnique({ where: { id: row.menuItemId } });
    if (candidate?.isActive && !excludeNames.has(candidate.name.toLowerCase())) {
      primary = candidate;
      basis = "order_history";
      break;
    }
  }

  // No usable order-history signal (new item, every co-occurring item excluded, or none of them
  // were actually a sensible pairing) — fall back to the deterministic category rules.
  if (!primary) {
    primary = await ruleBasedPairing(source, excludeNames, hotelId);
    basis = primary ? "category_rule" : "none";
  }

  // Always attempts a beverage alongside the primary pairing, per the standing rule that every
  // recommendation should offer a drink too, not just a food-to-food pairing.
  const beverage = await beveragePairing(source, primary, excludeNames, hotelId);

  return {
    success: true,
    recommendation: toRecommendationShape(primary),
    beverageRecommendation: toRecommendationShape(beverage),
    basis,
  };
}

// Used by the REST cart routes (the +/- quantity steppers in the order panel), not exposed to
// the LLM — add_to_order/remove_from_order (relative, delta-based) are what the model uses;
// this sets an absolute quantity, which is what a stepper button actually needs.
export async function setCartQuantity({ name, quantity }, sessionId) {
  const existing = await prisma.cartItem.findFirst({ where: { sessionId, name: { equals: name, mode: "insensitive" } } });
  if (!existing) return { success: false, message: `"${name}" is not in the cart.` };

  if (quantity <= 0) {
    await prisma.cartItem.delete({ where: { id: existing.id } });
  } else {
    await prisma.cartItem.update({ where: { id: existing.id }, data: { quantity } });
  }

  const cart = await getCart(sessionId);
  return { success: true, ...cartSummary(cart) };
}

const DEPARTMENT_TABLE = {
  kitchen: prisma.kitchenTicket,
  housekeeping: prisma.housekeepingRequest,
  spa: prisma.spaBooking,
  library: prisma.libraryRequest,
};

// Normalizes "Room 102", "room-102", "102 " etc. down to a bare comparable form — voice input
// in particular can carry a spoken "room" prefix or stray punctuation that a strict equality
// check against the stored bare number ("102") would otherwise reject as "not found."
function normalizeRoomNumber(raw) {
  return String(raw || "")
    .trim()
    .toLowerCase()
    .replace(/^room\s*/i, "")
    .replace(/[^a-z0-9]/gi, "");
}

async function findRoom(roomNumber, hotelId) {
  const normalized = normalizeRoomNumber(roomNumber);
  if (!normalized) return null;
  const rooms = await prisma.room.findMany({ where: { hotelId } });
  return rooms.find((r) => normalizeRoomNumber(r.number) === normalized) || null;
}

async function verifyRoom({ roomNumber }, hotelId) {
  if (!roomNumber || !roomNumber.trim()) {
    return { success: false, exists: false, message: "No room number given to verify." };
  }
  // A guest saying "table 4" is unambiguously a dine-in table number, never a room — confirmed
  // live, the model called this tool on "Table 4" anyway despite the prompt saying not to,
  // got exists:false back, and used that to wrongly block a perfectly valid dine-in order
  // before ever reaching confirm_order. A prompt instruction alone wasn't reliable enough here
  // (same lesson as the room-number hard-backstop below) — short-circuiting it in code means a
  // table number can never be misread as an invalid room, regardless of what the model recalls.
  if (/\btable\b/i.test(roomNumber)) {
    return {
      success: true,
      exists: true,
      isTable: true,
      roomNumber,
      message: `"${roomNumber}" is a dining table number, not a hotel room — there's nothing to verify it against; just use it exactly as given for confirm_order.`,
    };
  }
  const room = await findRoom(roomNumber, hotelId);
  if (!room) {
    return {
      success: true,
      exists: false,
      message: `Room "${roomNumber}" isn't in our system — ask the guest to repeat or spell out the number, don't guess or round to a nearby-sounding one.`,
    };
  }
  return { success: true, exists: true, roomNumber: room.number, guestName: room.guestName || null };
}

async function confirmOrder({ guestName, roomNumber }, sessionId) {
  // The cart the model has been building via add_to_order/remove_from_order is the
  // authoritative source — not whatever the model might separately claim the order is,
  // which is exactly what was producing wrong totals when it recomputed from memory.
  const cart = await getCart(sessionId);
  if (cart.length === 0) {
    return { success: false, message: "Cannot confirm an empty order." };
  }

  // Fall back to whatever room/guest context the session already carries (e.g. set from a
  // scanned room QR code) so the guest is never re-asked for details we already have. Whether
  // that context existed BEFORE this call (i.e. came from a real scanned QR, via
  // registerGuestSession) is what decides how strict the check below can be — a dining guest
  // who never scanned anything may legitimately be giving a TABLE number, not a room.
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  const cameFromQr = Boolean(session?.roomNumber);
  if (!roomNumber || !guestName) {
    roomNumber = roomNumber || session?.roomNumber || null;
    guestName = guestName || session?.guestName || null;
  }

  if (!roomNumber || !roomNumber.trim()) {
    return {
      success: false,
      message: "Ask the guest whether this is room service or dine-in, then get their room number or table number before confirming — it's required so staff know where to deliver.",
    };
  }

  // Confirmed live: a garbled voice transcription ("सनजरवान") got silently reinterpreted by the
  // model as room "102" and very nearly got confirmed as-is — nothing before this point ever
  // checked a spoken room number against a REAL room. This is the backstop: even if the model
  // skips calling verify_room itself (or invents a plausible-looking number from unclear audio),
  // an order can never actually confirm against a room that doesn't exist in this hotel's system.
  // An explicit "table" mention is never held to the room registry, full stop — a QR scan
  // context couldn't have produced this text (that path already has a real room number), so
  // there's no scenario where a guest's own "table 4" should ever be checked against it.
  const isExplicitTable = /\btable\b/i.test(roomNumber);
  const room = isExplicitTable ? null : await findRoom(roomNumber, session.hotelId);
  if (room) {
    roomNumber = room.number; // normalize to the exact stored form for the order record
  } else if (cameFromQr && !isExplicitTable) {
    // Only a hard rejection when we KNOW this is meant to be a real room (the guest scanned a
    // room's own QR code) — a dining-table guest's table number was never expected to match
    // the Room registry at all, so it isn't held to this check.
    return {
      success: false,
      message: `Room "${roomNumber}" isn't in our system — this needs a real, valid room number before the order can be placed. Ask the guest to repeat or spell it out; never guess or substitute a similar-sounding one.`,
    };
  }
  // else: no QR was scanned and this isn't a registered room — treated as a dining table
  // number instead, stored as-is in the same field.

  // Re-resolve each item against the live catalog rather than trusting the cart's cached
  // unitPrice — a menu price could have changed since it was added — so money/fulfillment
  // always reflects the current catalog.
  const resolvedItems = await Promise.all(
    cart.map(async (i) => {
      const resolved = await resolveItem(i.name, session.hotelId);
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
      hotelId: session.hotelId,
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

  // Always fetched (not just when roomNumber is missing) — hotelId has to come from the
  // session's own real hotel regardless, never a value a caller happens to pass in.
  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  roomNumber = roomNumber || session?.roomNumber || null;

  const alert = await prisma.frontDeskAlert.create({
    data: {
      hotelId: session.hotelId,
      sessionId,
      issue: issue.trim(),
      roomNumber: roomNumber || null,
      urgency: urgent ? "urgent" : "normal",
    },
  });

  return { success: true, alertId: alert.id, escalation: { issue: alert.issue, urgent: !!urgent } };
}

const CONCIERGE_CATEGORIES = new Set(["transportation", "tour", "reservation", "currency_exchange", "courier", "other"]);

// A real 5-star concierge desk: transportation/cab booking, tours/sightseeing, external
// restaurant reservations, currency exchange, courier — deliberately its own tool/table, not
// folded into notify_front_desk, since a real hotel routes these to a different desk/department
// than facility complaints, and staff need to filter/track them separately in the admin panel.
async function requestConciergeService({ category, details, roomNumber, urgent }, sessionId) {
  if (!details || !details.trim()) {
    return { success: false, message: "Cannot log a concierge request without details of what the guest needs." };
  }
  const normalizedCategory = CONCIERGE_CATEGORIES.has(category) ? category : "other";

  const session = await prisma.session.findUnique({ where: { id: sessionId } });
  roomNumber = roomNumber || session?.roomNumber || null;

  const request = await prisma.conciergeRequest.create({
    data: {
      hotelId: session.hotelId,
      sessionId,
      category: normalizedCategory,
      details: details.trim(),
      roomNumber: roomNumber || null,
      guestName: session?.guestName || null,
      urgency: urgent ? "urgent" : "normal",
    },
  });

  return { success: true, requestId: request.id, escalation: { issue: request.details, urgent: !!urgent } };
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
  return { type: mapping.type, items, totalMatches: result.totalMatches };
}

// Only the fields the model actually reasons over — item resolution happens by name
// lookup elsewhere, so id/hotelId/isActive/timestamps are pure token cost with zero
// behavioral value once they're in the model's context. The frontend table (buildItemsTable,
// above) still gets the full untrimmed rows; this only shrinks what goes to the LLM.
const MODEL_ITEM_FIELDS = {
  search_menu: ({ name, category, cuisine, breakfast, snack, vegetarian, price, description }) => ({ name, category, cuisine, breakfast, snack, vegetarian, price, description }),
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
  // Falls back to the single pre-multi-hotel default only when a caller genuinely has no
  // hotelId to give (shouldn't happen once every call site threads it through, but this keeps
  // an old/incomplete context from hard-crashing instead of just misbehaving loudly).
  const hotelId = context.hotelId || DEFAULT_HOTEL_ID;
  switch (name) {
    case "search_menu":
      return searchMenu(args, hotelId);
    case "search_spa":
      return searchSpa(args, hotelId);
    case "search_housekeeping":
      return searchHousekeeping(args, hotelId);
    case "search_library":
      return searchLibrary(args, hotelId);
    case "add_to_order":
      return addToOrder(args, context.sessionId, hotelId);
    case "remove_from_order":
      return removeFromOrder(args, context.sessionId);
    case "get_cart":
      return getCartTool(context.sessionId);
    case "confirm_order":
      return confirmOrder(args, context.sessionId);
    case "notify_front_desk":
      return notifyFrontDesk(args, context.sessionId);
    case "request_concierge_service":
      return requestConciergeService(args, context.sessionId);
    case "get_order_history":
      return getOrderHistory(context.roomNumber, hotelId);
    case "get_recommendation":
      return getRecommendation(args, context.sessionId, hotelId);
    case "verify_room":
      return verifyRoom(args, hotelId);
    default:
      return { success: false, message: `Unknown tool: ${name}` };
  }
}
