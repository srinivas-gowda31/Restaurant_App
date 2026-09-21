import { Router } from "express";
import multer from "multer";
import { getOrCreateSession, prisma } from "../db.js";
import { transcribeAudio, synthesizeSpeech, describeGeminiError } from "../gemini.js";
import { runAssistantTurn } from "../assistant.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 15 * 1024 * 1024 } });
const router = Router();

router.post("/", upload.single("audio"), async (req, res) => {
  try {
    const { sessionId } = req.body;
    if (!sessionId || !req.file) {
      return res.status(400).json({ error: "sessionId and audio file are required." });
    }

    await getOrCreateSession(sessionId);

    const transcript = await transcribeAudio(req.file.buffer, req.file.mimetype || "audio/wav");
    if (!transcript) {
      return res.status(422).json({ error: "Could not transcribe audio." });
    }

    await prisma.voiceLog.create({ data: { sessionId, transcript } });

    const { reply, uiHints } = await runAssistantTurn({ sessionId, userMessage: transcript });
    const audioBase64 = await synthesizeSpeech(reply);

    res.json({ transcript, reply, uiHints, audioBase64 });
  } catch (err) {
    console.error("Voice error:", err);
    const { httpStatus, message } = describeGeminiError(err);
    res.status(httpStatus).json({ error: message });
  }
});

export default router;
