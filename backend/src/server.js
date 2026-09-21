import "dotenv/config";
import http from "http";
import express from "express";
import cors from "cors";

import chatRouter from "./routes/chat.js";
import voiceRouter from "./routes/voice.js";
import menuRouter from "./routes/menu.js";
import adminRouter from "./routes/admin.js";
import ordersRouter from "./routes/orders.js";
import { attachRealtimeProxy } from "./realtime.js";

const app = express();
const PORT = process.env.PORT || 4000;

app.use(cors());
app.use(express.json({ limit: "5mb" }));

app.get("/api/health", (req, res) => res.json({ status: "ok" }));

app.use("/api/chat", chatRouter);
app.use("/api/voice", voiceRouter);
app.use("/api", menuRouter);
app.use("/api/orders", ordersRouter);
app.use("/api/admin", adminRouter);

app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: "Internal server error." });
});

const server = http.createServer(app);
attachRealtimeProxy(server);

server.listen(PORT, () => {
  console.log(`Hotel assistant backend listening on http://localhost:${PORT}`);
});
