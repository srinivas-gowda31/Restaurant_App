import { Router } from "express";
import { getOrCreateSession, getHotelBySlug } from "../db.js";
import { runAssistantTurn } from "../assistant.js";
import { describeGeminiError } from "../gemini.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { sessionId, message, hotel } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required." });
    }

    // hotel (a slug) only matters the FIRST time this session is created — getOrCreateSession
    // never changes an existing session's hotel. Falls back to the single default hotel when
    // omitted, same as every other guest-facing entry point.
    const resolvedHotel = await getHotelBySlug(hotel);
    await getOrCreateSession(sessionId, { hotelId: resolvedHotel?.id });
    const { reply, uiHints } = await runAssistantTurn({ sessionId, userMessage: message });

    res.json({ reply, uiHints });
  } catch (err) {
    console.error("Chat error:", err);
    const { httpStatus, message } = describeGeminiError(err);
    res.status(httpStatus).json({ error: message });
  }
});

export default router;
