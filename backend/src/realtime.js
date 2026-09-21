import { WebSocketServer, WebSocket } from "ws";
import { toolDeclarations, executeTool } from "./tools.js";
import { logMessage, getOrCreateSession } from "./db.js";

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_REALTIME_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_REALTIME_API_KEY;
const AZURE_DEPLOYMENT = process.env.AZURE_OPENAI_REALTIME_DEPLOYMENT;
const AZURE_API_VERSION = process.env.AZURE_OPENAI_REALTIME_API_VERSION || "2024-10-01-preview";

const REALTIME_INSTRUCTIONS = `You are a warm, professional hotel concierge assistant for The Baikal Sphere Hotel, speaking
with a guest over a live voice call. Help them browse the food/beverage menu and spa services, build an order, and
confirm it. Use the provided tools to search the menu/spa catalog and to add/remove items from the order. When a
guest asks to see options, call search_menu or search_spa — the full results are shown to the guest visually as a
table, so keep your spoken reply brief (a one-sentence intro is enough, not a recitation of every item and price).
Only call confirm_order when the guest has clearly and explicitly confirmed they want to place the order. Keep your
spoken responses short, natural, and conversational. Always mention prices in Indian Rupees using "rupees".`;

function isConfigured() {
  return Boolean(AZURE_ENDPOINT && AZURE_API_KEY && AZURE_DEPLOYMENT);
}

function azureRealtimeUrl() {
  const base = AZURE_ENDPOINT.replace(/^http/, "ws").replace(/\/$/, "");
  return `${base}/openai/realtime?api-version=${AZURE_API_VERSION}&deployment=${encodeURIComponent(AZURE_DEPLOYMENT)}`;
}

function toAzureTools() {
  return toolDeclarations.map((t) => ({
    type: "function",
    name: t.name,
    description: t.description,
    parameters: t.parameters,
  }));
}

export function attachRealtimeProxy(httpServer) {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/realtime" });

  if (!isConfigured()) {
    console.warn(
      "Azure Realtime env vars (AZURE_OPENAI_REALTIME_ENDPOINT / _API_KEY / _DEPLOYMENT) are not set — " +
        "/api/realtime will reject connections until they're configured."
    );
  }

  wss.on("connection", async (clientWs, req) => {
    if (!isConfigured()) {
      clientWs.send(JSON.stringify({ type: "error", message: "Azure Realtime is not configured on the server yet." }));
      clientWs.close();
      return;
    }

    const url = new URL(req.url, "http://localhost");
    const sessionId = url.searchParams.get("sessionId") || `realtime_${Date.now()}`;
    await getOrCreateSession(sessionId);

    let uiHints = { cartActions: [], orderId: null, itemsTable: null };
    const flushUiHints = () => {
      if (uiHints.cartActions.length || uiHints.orderId || uiHints.itemsTable) {
        clientWs.send(JSON.stringify({ type: "ui_hints", uiHints }));
        uiHints = { cartActions: [], orderId: null, itemsTable: null };
      }
    };

    let azureWs;
    try {
      azureWs = new WebSocket(azureRealtimeUrl(), { headers: { "api-key": AZURE_API_KEY } });
    } catch (err) {
      clientWs.send(JSON.stringify({ type: "error", message: "Could not start the voice connection." }));
      clientWs.close();
      return;
    }

    azureWs.on("open", () => {
      azureWs.send(
        JSON.stringify({
          type: "session.update",
          session: {
            modalities: ["audio", "text"],
            instructions: REALTIME_INSTRUCTIONS,
            voice: "alloy",
            input_audio_format: "pcm16",
            output_audio_format: "pcm16",
            input_audio_transcription: { model: "whisper-1" },
            turn_detection: { type: "server_vad", threshold: 0.5, prefix_padding_ms: 300, silence_duration_ms: 500 },
            tools: toAzureTools(),
            tool_choice: "auto",
          },
        })
      );
      clientWs.send(JSON.stringify({ type: "ready" }));
    });

    azureWs.on("message", async (raw) => {
      let event;
      try {
        event = JSON.parse(raw.toString());
      } catch {
        return;
      }

      switch (event.type) {
        case "response.audio.delta":
          clientWs.send(JSON.stringify({ type: "audio_delta", audio: event.delta }));
          break;

        case "conversation.item.input_audio_transcription.completed":
          if (event.transcript) {
            await logMessage(sessionId, "user", event.transcript);
            clientWs.send(JSON.stringify({ type: "transcript", role: "user", text: event.transcript }));
          }
          break;

        case "response.audio_transcript.done":
          if (event.transcript) {
            await logMessage(sessionId, "assistant", event.transcript);
            clientWs.send(JSON.stringify({ type: "transcript", role: "assistant", text: event.transcript }));
          }
          break;

        case "response.function_call_arguments.done": {
          const { call_id, name, arguments: argsJson } = event;
          let args = {};
          try {
            args = JSON.parse(argsJson || "{}");
          } catch {
            // leave args empty if malformed
          }

          const result = await executeTool(name, args, { sessionId });
          if (result.cartAction) uiHints.cartActions.push(result.cartAction);
          if (result.orderId) uiHints.orderId = result.orderId;
          if (name === "search_menu" && result.items) uiHints.itemsTable = { type: "menu", items: result.items };
          if (name === "search_spa" && result.services) uiHints.itemsTable = { type: "spa", items: result.services };
          flushUiHints();

          azureWs.send(
            JSON.stringify({
              type: "conversation.item.create",
              item: { type: "function_call_output", call_id, output: JSON.stringify(result) },
            })
          );
          azureWs.send(JSON.stringify({ type: "response.create" }));
          break;
        }

        case "response.done":
          flushUiHints();
          break;

        case "error":
          console.error("Azure Realtime error:", event.error);
          clientWs.send(JSON.stringify({ type: "error", message: event.error?.message || "Voice service error." }));
          break;

        default:
          break;
      }
    });

    azureWs.on("error", (err) => {
      console.error("Azure Realtime connection error:", err.message);
      try {
        clientWs.send(JSON.stringify({ type: "error", message: "Could not connect to the voice service." }));
      } catch {
        // client socket may already be closed
      }
    });

    azureWs.on("close", () => {
      if (clientWs.readyState === WebSocket.OPEN) clientWs.close();
    });

    clientWs.on("message", (raw) => {
      let msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch {
        return;
      }

      if (msg.type === "input_audio" && azureWs.readyState === WebSocket.OPEN) {
        azureWs.send(JSON.stringify({ type: "input_audio_buffer.append", audio: msg.audio }));
      }
    });

    clientWs.on("close", () => {
      if (azureWs.readyState === WebSocket.OPEN || azureWs.readyState === WebSocket.CONNECTING) {
        azureWs.close();
      }
    });
  });
}
