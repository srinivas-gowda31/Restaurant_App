import { PrismaClient } from "@prisma/client";

export const prisma = new PrismaClient();

export const DEFAULT_HOTEL_ID = "hotel_1";

export async function getOrCreateSession(sessionId) {
  const existing = await prisma.session.findUnique({ where: { id: sessionId } });
  if (existing) return existing;
  return prisma.session.create({
    data: { id: sessionId, hotelId: DEFAULT_HOTEL_ID },
  });
}

export async function logMessage(sessionId, role, content) {
  return prisma.chatMessage.create({
    data: { sessionId, role, content },
  });
}

export async function getRecentMessages(sessionId, limit = 20) {
  const messages = await prisma.chatMessage.findMany({
    where: { sessionId },
    orderBy: { createdAt: "asc" },
    take: limit,
  });
  return messages;
}
