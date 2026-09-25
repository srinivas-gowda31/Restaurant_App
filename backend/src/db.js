import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const DEFAULT_HOTEL_ID = "hotel_1";

// Sessions are never deleted, so once we've confirmed one exists we can skip
// re-checking the DB on every subsequent message in that session.
const knownSessionIds = new Set();

export async function getOrCreateSession(sessionId, { roomNumber, guestName } = {}) {
  if (knownSessionIds.has(sessionId) && !roomNumber && !guestName) return { id: sessionId };

  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (existing) {
    knownSessionIds.add(sessionId);
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

  const created = await prisma.session.create({
    data: { id: sessionId, hotelId: DEFAULT_HOTEL_ID, roomNumber: roomNumber || null, guestName: guestName || null },
  });
  knownSessionIds.add(sessionId);
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
