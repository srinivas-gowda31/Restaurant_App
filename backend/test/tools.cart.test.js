import { describe, it, expect, beforeEach, vi } from "vitest";

// tools.js talks to Postgres exclusively through prisma (src/db.js) — mocking that one module
// lets these tests exercise the real cart/order business logic (quantity merging, empty-cart
// guard, room-number requirement, cart clearing on confirm) without touching the real
// database, and without needing DATABASE_URL set at all.
let cartRows = [];
let nextId = 1;

function matches(row, where) {
  return Object.entries(where).every(([key, cond]) => {
    const value = row[key];
    if (cond && typeof cond === "object" && "equals" in cond) {
      return String(value).toLowerCase() === String(cond.equals).toLowerCase();
    }
    return value === cond;
  });
}

const prismaMock = {
  menuItem: {
    findFirst: vi.fn(({ where }) => {
      const catalog = [{ id: "mi_1", name: "Butter Chicken", price: 350 }];
      const hit = catalog.find((c) => c.name.toLowerCase() === String(where.name.equals).toLowerCase());
      return Promise.resolve(hit || null);
    }),
  },
  spaService: { findFirst: vi.fn(() => Promise.resolve(null)) },
  housekeepingItem: { findFirst: vi.fn(() => Promise.resolve(null)) },
  libraryItem: { findFirst: vi.fn(() => Promise.resolve(null)) },
  cartItem: {
    findMany: vi.fn(({ where }) => Promise.resolve(cartRows.filter((r) => matches(r, where)))),
    findFirst: vi.fn(({ where }) => Promise.resolve(cartRows.find((r) => matches(r, where)) || null)),
    create: vi.fn(({ data }) => {
      const row = { id: `ci_${nextId++}`, createdAt: new Date(), ...data };
      cartRows.push(row);
      return Promise.resolve(row);
    }),
    update: vi.fn(({ where, data }) => {
      const row = cartRows.find((r) => r.id === where.id);
      Object.assign(row, data);
      return Promise.resolve(row);
    }),
    deleteMany: vi.fn(({ where }) => {
      const before = cartRows.length;
      cartRows = cartRows.filter((r) => !matches(r, where));
      return Promise.resolve({ count: before - cartRows.length });
    }),
  },
  session: { findUnique: vi.fn(() => Promise.resolve(null)) },
  order: {
    create: vi.fn(({ data }) =>
      Promise.resolve({
        id: "order_1",
        total: data.total,
        items: data.items.create.map((i, idx) => ({ id: `oi_${idx}`, ...i })),
      })
    ),
  },
  kitchenTicket: { create: vi.fn(() => Promise.resolve({})) },
  housekeepingRequest: { create: vi.fn(() => Promise.resolve({})) },
  spaBooking: { create: vi.fn(() => Promise.resolve({})) },
  libraryRequest: { create: vi.fn(() => Promise.resolve({})) },
};

vi.mock("../src/db.js", () => ({ prisma: prismaMock, DEFAULT_HOTEL_ID: "hotel_1" }));

const { executeTool } = await import("../src/tools.js");

const SESSION = "session_1";

beforeEach(() => {
  cartRows = [];
  nextId = 1;
  vi.clearAllMocks();
});

describe("cart tools", () => {
  it("adding an item twice merges quantity instead of duplicating", async () => {
    await executeTool("add_to_order", { name: "Butter Chicken", quantity: 1 }, { sessionId: SESSION });
    const second = await executeTool("add_to_order", { name: "Butter Chicken", quantity: 2 }, { sessionId: SESSION });

    expect(second.cart).toHaveLength(1);
    expect(second.cart[0].quantity).toBe(3);
    expect(second.total).toBe(3 * 350);
  });

  it("get_cart reflects state written by a previous add (simulating a separate request)", async () => {
    await executeTool("add_to_order", { name: "Butter Chicken", quantity: 2 }, { sessionId: SESSION });
    const cart = await executeTool("get_cart", {}, { sessionId: SESSION });
    expect(cart.total).toBe(700);
  });

  it("removing an item drops it from the cart and total", async () => {
    await executeTool("add_to_order", { name: "Butter Chicken", quantity: 2 }, { sessionId: SESSION });
    const afterRemove = await executeTool("remove_from_order", { name: "Butter Chicken" }, { sessionId: SESSION });
    expect(afterRemove.cart).toHaveLength(0);
    expect(afterRemove.total).toBe(0);
  });

  it("adding an unknown item fails without touching the cart", async () => {
    const result = await executeTool("add_to_order", { name: "Nonexistent Dish" }, { sessionId: SESSION });
    expect(result.success).toBe(false);
    expect(cartRows).toHaveLength(0);
  });

  it("confirming an empty cart is rejected", async () => {
    const result = await executeTool("confirm_order", { roomNumber: "204" }, { sessionId: SESSION });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/empty/i);
  });

  it("confirming without a room number is rejected even with items in the cart", async () => {
    await executeTool("add_to_order", { name: "Butter Chicken" }, { sessionId: SESSION });
    const result = await executeTool("confirm_order", {}, { sessionId: SESSION });
    expect(result.success).toBe(false);
    expect(result.message).toMatch(/room number/i);
  });

  it("confirming a valid cart creates the order and clears the persisted cart", async () => {
    await executeTool("add_to_order", { name: "Butter Chicken", quantity: 2 }, { sessionId: SESSION });
    const result = await executeTool("confirm_order", { roomNumber: "204", guestName: "Arun" }, { sessionId: SESSION });

    expect(result.success).toBe(true);
    expect(result.total).toBe(700);

    const cartAfter = await executeTool("get_cart", {}, { sessionId: SESSION });
    expect(cartAfter.cart).toHaveLength(0);
  });
});
