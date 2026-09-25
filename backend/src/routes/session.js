import { Router } from "express";
import { getOrCreateSession } from "../db.js";

const router = Router();

// Called once the guest page picks up ?room=&guest= from a scanned QR code, so the
// session carries that context server-side for every later chat/voice turn and tool call.
router.post("/guest-info", async (req, res) => {
  const { sessionId, roomNumber, guestName } = req.body;
  if (!sessionId) {
    return res.status(400).json({ error: "sessionId is required." });
  }
  const session = await getOrCreateSession(sessionId, { roomNumber, guestName });
  res.json({ session });
});

export default router;
