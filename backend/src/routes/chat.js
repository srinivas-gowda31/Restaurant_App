import { Router } from "express";
import { getOrCreateSession } from "../db.js";
import { runAssistantTurn } from "../assistant.js";
import { describeGeminiError } from "../gemini.js";

const router = Router();

router.post("/", async (req, res) => {
  try {
    const { sessionId, message } = req.body;
    if (!sessionId || !message) {
      return res.status(400).json({ error: "sessionId and message are required." });
    }

    await getOrCreateSession(sessionId);
    const { reply, uiHints } = await runAssistantTurn({ sessionId, userMessage: message });

    res.json({ reply, uiHints });
  } catch (err) {
    console.error("Chat error:", err);
    const { httpStatus, message } = describeGeminiError(err);
    res.status(httpStatus).json({ error: message });
  }
});

export default router;
