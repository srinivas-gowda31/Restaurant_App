import { Router } from "express";
import { getOrCreateSession, getRecentMessages, getHotelBySlug } from "../db.js";

const router = Router();

// Called once the guest page picks up ?hotel=&room=&guest= from a scanned QR code, so the
// session carries that context server-side for every later chat/voice turn and tool call.
// hotel (a slug) only matters the first time this session is created — getOrCreateSession never
// changes an existing session's hotel afterward. Falls back to the single default hotel when
// omitted, so an old QR code printed before multi-hotel support still works exactly as before.
router.post("/guest-info", async (req, res) => {
  const { sessionId, roomNumber, guestName, hotel } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required." });
  }
  const resolvedHotel = await getHotelBySlug(hotel);
  const session = await getOrCreateSession(sessionId, { roomNumber, guestName, hotelId: resolvedHotel?.id });
  res.json({ session });
});

// Public, read-only — lets the guest page show the RIGHT hotel's name/branding instead of a
// hardcoded one. Falls back to the single default hotel for a bare visit or an old QR code.
router.get("/hotel-info", async (req, res) => {
  const hotel = await getHotelBySlug(req.query.hotel);
  if (!hotel) return res.status(404).json({ error: "Hotel not found." });
  res.json({ hotel: { name: hotel.name, slug: hotel.slug } });
});

// Read-only — lets the guest page re-hydrate the on-screen transcript from what's already
// durably logged server-side (every voice/chat turn already goes through logMessage regardless
// of this route). Every message/tool call this bot makes was already being persisted; this
// just gives the frontend a way to read it back after a reload/remount instead of starting
// blank, since the transcript itself only ever lived in local React state before.
router.get("/:sessionId/messages", async (req, res) => {
  const messages = await getRecentMessages(req.params.sessionId, 50);
  res.json({
    messages: messages.map((m) => ({ id: m.id, role: m.role, content: m.content })),
  });
});

export default router;
