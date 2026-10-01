import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

// Fallback only — used when a request carries no hotel identifier at all (an old QR code
// printed before multi-hotel support, or a bare local dev request). Every real multi-hotel
// flow resolves its own hotelId dynamically via getHotelBySlug/getHotelByAdminKey below instead
// of ever reaching for this.
export const DEFAULT_HOTEL_ID = "hotel_1";

// A guest's QR code / session URL carries ?hotel=<slug> — this is the ONE place that resolves
// it to a real hotelId. Falls back to the default hotel so an old QR code (no ?hotel= at all)
// still works exactly as it did before multi-hotel support existed.
export async function getHotelBySlug(slug) {
  if (!slug) return prisma.hotel.findUnique({ where: { id: DEFAULT_HOTEL_ID } });
  return prisma.hotel.findUnique({ where: { slug } });
}

// The admin panel's X-Admin-Key now identifies WHICH hotel is logging in, not just whether the
// request is authorized at all — replaces the single global ADMIN_API_KEY comparison so one
// hotel's staff can never see or touch another hotel's data through the admin panel.
export async function getHotelByAdminKey(key) {
  if (!key) return null;
  return prisma.hotel.findUnique({ where: { adminApiKey: key } });
}

// Every guest-facing prompt needs the hotel's real name (never hardcode "The Baikal Sphere
// Hotel" — that was fine for one hotel, wrong for every other one). Cached by id since a
// hotel's name changing mid-process is rare and every single guest turn needs this.
const hotelNameCache = new Map();

export async function getHotelName(hotelId) {
  if (hotelNameCache.has(hotelId)) return hotelNameCache.get(hotelId);
  const hotel = await prisma.hotel.findUnique({ where: { id: hotelId }, select: { name: true } });
  const name = hotel?.name || "the hotel";
  hotelNameCache.set(hotelId, name);
  return name;
}

// Confirmed directly: Prisma pays a real one-time cost the FIRST time each model is queried in a
// process's lifetime (~550ms per table, on top of ~2.5s for the very first query of any kind —
// TCP/TLS/Postgres-auth connection setup against this remote Neon DB) — every query after that,
// to a table already touched once, drops to ~270-300ms (pure network round-trip, not query
// complexity). That one-time tax is invisible once a server's been running a while and has
// naturally touched every table — but it repeats on every restart, and a guest whose very first
// action (e.g. add_to_order, which touches 5 different tables) happens to land right after a
// fresh deploy/restart would otherwise be the one paying it live. Firing one cheap query per
// hot-path table at startup, before any real request arrives, moves that cost to boot time
// instead of a guest's order.
export async function warmDatabase() {
  const start = Date.now();
  await Promise.all([
    prisma.menuItem.findFirst(),
    prisma.spaService.findFirst(),
    prisma.housekeepingItem.findFirst(),
    prisma.libraryItem.findFirst(),
    prisma.cartItem.findFirst(),
    prisma.session.findFirst(),
    prisma.chatMessage.findFirst(),
    prisma.order.findFirst(),
    prisma.frontDeskAlert.findFirst(),
  ]).catch((err) => console.error("[db] Warm-up query failed (non-fatal):", err.message));
  console.log(`[db] Warmed up in ${Date.now() - start}ms`);
}

// Neon's serverless Postgres can suspend its compute after a period of no activity, which then
// pays a real reconnect delay on whatever query happens to be unlucky enough to hit it next — a
// real risk for a demo with gaps between attempts. A trivial query well inside that idle window
// keeps the compute (and this process's connection) continuously warm instead.
const KEEP_ALIVE_INTERVAL_MS = 4 * 60 * 1000;

export function startKeepAlive() {
  setInterval(() => {
    prisma.$queryRaw`SELECT 1`.catch((err) => console.error("[db] Keep-alive query failed:", err.message));
  }, KEEP_ALIVE_INTERVAL_MS).unref();
}

// Sessions are never deleted, so once we've confirmed one exists we can skip re-checking the DB
// on every subsequent message in that session — keyed by hotelId (not just a Set of "seen" ids)
// so this fast path can still return a real hotelId. Confirmed as a real risk while wiring up
// multi-hotel support: the old version returned a bare {id: sessionId} with no hotelId at all
// on this path, which would have silently misrouted a returning guest's every tool call to the
// default hotel — a cross-tenant bug that would only show up once a second hotel actually existed.
const knownSessions = new Map(); // sessionId -> hotelId

// hotelId is only ever applied on CREATE — a session belongs to whichever hotel it started
// with for its entire lifetime, never reassigned later even if a caller passes a different one
// (that shouldn't happen in practice, but silently moving an in-progress session to a different
// hotel would be a real data-isolation bug if it ever did).
export async function getOrCreateSession(sessionId, { roomNumber, guestName, hotelId } = {}) {
  if (knownSessions.has(sessionId) && !roomNumber && !guestName) {
    return { id: sessionId, hotelId: knownSessions.get(sessionId) };
  }

  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (existing) {
    knownSessions.set(sessionId, existing.hotelId);
    const hasNewInfo =
      (roomNumber && roomNumber !== existing.roomNumber) || (guestName && guestName !== existing.guestName);
    if (!hasNewInfo) return existing;
    return prisma.session.update({
      where: { id: sessionId },
      data: {
        roomNumber: roomNumber || existing.roomNumber,
        guestName: guestName || existing.guestName,
      },
    });
  }

  let created;
  try {
    created = await prisma.session.create({
      data: {
        id: sessionId,
        hotelId: hotelId || DEFAULT_HOTEL_ID,
        roomNumber: roomNumber || null,
        guestName: guestName || null,
      },
    });
  } catch (err) {
    if (err.code === "P2002") {
      // Lost a create race against a concurrent request for the same new sessionId.
      created = await prisma.session.findUnique({ where: { id: sessionId } });
    } else {
      throw err;
    }
  }
  knownSessions.set(sessionId, created.hotelId);
  return created;
}

export async function getSession(sessionId) {
  return prisma.session.findUnique({ where: { id: sessionId } });
}

export async function logMessage(sessionId, role, content) {
  return prisma.chatMessage.create({
    data: { sessionId, role, content },
  });
}

export async function getRecentMessages(sessionId, limit = 30) {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "desc" },
    take: limit,
  });
  return messages.reverse();
}

export async function logTokenUsage({
  sessionId,
  callId = null,
  hotelId = DEFAULT_HOTEL_ID,
  source,
  model,
  promptTokens = 0,
  completionTokens = 0,
  totalTokens = 0,
}) {
  if (!totalTokens && !promptTokens && !completionTokens) return null;
  return prisma.tokenUsage.create({
    data: { sessionId, callId, hotelId, source, model, promptTokens, completionTokens, totalTokens },
  });
}
