import "dotenv/config";
import http from "http";
import express from "express";
// Patches Express so a thrown/rejected error inside an async route handler reaches the
// error-handling middleware below instead of becoming an unhandled rejection that can
// crash the whole process (Express 4 doesn't catch those on its own).
import "express-async-errors";
import cors from "cors";
import rateLimit from "express-rate-limit";

import chatRouter from "./routes/chat.js";
import voiceRouter from "./routes/voice.js";
import menuRouter from "./routes/menu.js";
import adminRouter from "./routes/admin.js";
import ordersRouter from "./routes/orders.js";
import sessionRouter from "./routes/session.js";
import { attachRealtimeProxy } from "./realtime.js";

const app = express();
const PORT = process.env.PORT || 4000;

// ALLOWED_ORIGIN restricts CORS to the real frontend origin(s) in production (comma-separated
// for more than one). Left unset in development, it stays open for convenience. Left unset
// with NODE_ENV=production, fail closed instead — an open-to-any-origin API in production is
// a real vulnerability (any website's JS could call it as the logged-in browser), and it's
// safer to refuse every cross-origin request at startup than to silently allow all of them.
const allowedOrigins = process.env.ALLOWED_ORIGIN?.split(",").map((o) => o.trim());
const isProduction = process.env.NODE_ENV === "production";
if (!allowedOrigins) {
  if (isProduction) {
    console.error("ALLOWED_ORIGIN is not set in production — CORS will reject all cross-origin requests until it's configured.");
  } else {
    console.warn("ALLOWED_ORIGIN is not set — CORS is open to any origin. Set it before going to production.");
  }
}
const corsOrigin = allowedOrigins || (isProduction ? false : true);

// Let browsers cache the CORS preflight so repeated chat requests skip the extra OPTIONS round-trip.
app.use(cors({ origin: corsOrigin, maxAge: 86400 }));
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

// /api/chat and /api/voice are public and each call spends real Gemini/TTS API budget —
// cap per-IP request rate so a script (or a bug in a client) can't run up the bill.
const llmRateLimit = rateLimit({
  windowMs: 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests — please wait a moment and try again." },
});

app.use("/api/chat", llmRateLimit, chatRouter);
app.use("/api/voice", llmRateLimit, voiceRouter);
app.use("/api", menuRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminRouter);
app.use("/api/session", sessionRouter);

app.use((err, req, res, next) => {
  // Prisma's "record to update/delete not found" — every admin PATCH/DELETE-by-id route
  // hits this on a stale/bad id, so handle it once here instead of in each route.
  if (err.code === "P2025") {
    return res.status(404).json({ error: "Not found." });
  }
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const server = http.createServer(app);
attachRealtimeProxy(server);

server.listen(PORT, () => {
  console.log(`Hotel assistant backend listening on http://localhost:${PORT}`);
});
