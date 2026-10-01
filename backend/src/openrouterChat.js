// Third CHAT_PROVIDER option alongside gemini/groq — OpenRouter is also OpenAI-compatible, so
// this reuses the exact same Gemini-shape adapter pattern as groqChat.js (see that file for why
// assistant.js's tool-calling loop never needs to know which provider is actually answering).

import { withNullableOptionals } from "./tools.js";

const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
export const CHAT_MODEL = process.env.OPENROUTER_CHAT_MODEL || "";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_RETRIES = 3;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// maxRetries lets a caller (assistant.js, when this is used as the FALLBACK provider) opt out
// of sitting through a rate-limit wait here too — same reasoning as groqChat.js's identical
// option: fail fast so a caller already failing over from one rate-limited provider doesn't
// then get stuck waiting on the fallback's own retry instead.
async function callOpenRouterChat(body, { maxRetries = MAX_RETRIES } = {}) {
  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${OPENROUTER_API_KEY}`,
          "Content-Type": "application/json",
          // Not required for the API to work, but OpenRouter's own docs ask for these to
          // attribute usage — harmless to include either way.
          "HTTP-Referer": "https://baikalsphere-hotel.local",
          "X-Title": "Baikal Sphere Hotel Concierge",
        },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A raw network failure (connection reset, DNS hiccup) throws before there's any HTTP
      // response to check a status code on — confirmed hitting this directly against a free
      // OpenRouter model (ECONNRESET), which crashed the whole process uncaught before this
      // try/catch existed. Retry it the same as a 429/503 rather than letting one flaky
      // connection take down a guest's entire conversation turn.
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(500 * 2 ** (attempt - 1));
        continue;
      }
      throw err;
    }
    if (response.ok) return response.json();

    if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
      attempt += 1;
      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfterHeader) ? retryAfterHeader * 1000 + 500 : 500 * 2 ** (attempt - 1);
      await sleep(waitMs);
      continue;
    }

    const bodyText = await response.text().catch(() => "");
    const err = new Error(`OpenRouter request failed (${response.status}): ${bodyText}`);
    err.status = response.status;
    throw err;
  }
}

// Same conversion logic as groqChat.js — see there for why the positional (message index,
// call index) id scheme reliably pairs function calls with their responses.
function contentsToMessages(systemInstruction, contents) {
  const messages = [{ role: "system", content: systemInstruction }];

  contents.forEach((entry, idx) => {
    if (entry.role === "model") {
      const textPart = entry.parts.find((p) => p.text);
      const callParts = entry.parts.filter((p) => p.functionCall);
      const message = { role: "assistant", content: textPart?.text || null };
      if (callParts.length > 0) {
        message.tool_calls = callParts.map((p, i) => ({
          id: `call_${idx}_${i}`,
          type: "function",
          function: { name: p.functionCall.name, arguments: JSON.stringify(p.functionCall.args || {}) },
        }));
      }
      messages.push(message);
      return;
    }

    const responseParts = entry.parts.filter((p) => p.functionResponse);
    if (responseParts.length > 0) {
      responseParts.forEach((p, i) => {
        messages.push({
          role: "tool",
          tool_call_id: `call_${idx - 1}_${i}`,
          content: JSON.stringify(p.functionResponse.response),
        });
      });
      return;
    }

    const textPart = entry.parts.find((p) => p.text);
    messages.push({ role: "user", content: textPart?.text || "" });
  });

  return messages;
}

// undefined when assistant.js forces a tool-free final reply (see its MAX_TOOL_ROUNDS safety
// net) — omitting `tools` entirely from the request is how OpenAI-compatible APIs get a plain
// text-only completion, so this must not throw on a missing list.
function toOpenAiTools(tools) {
  if (!tools) return undefined;
  // See withNullableOptionals (tools.js) — same strict null-vs-optional-string validation risk
  // applies to any OpenAI-compatible provider, not just Groq.
  return withNullableOptionals(tools).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

function toGeminiShape(data) {
  const message = data.choices?.[0]?.message || {};
  const parts = [];
  if (message.content) parts.push({ text: message.content });
  for (const toolCall of message.tool_calls || []) {
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch (err) {
      console.error(`[openrouterChat] Failed to parse tool call args for ${toolCall.function.name}:`, err.message);
    }
    parts.push({ functionCall: { name: toolCall.function.name, args } });
  }

  return {
    candidates: [{ content: { role: "model", parts } }],
    text: message.content || "",
    usageMetadata: {
      promptTokenCount: data.usage?.prompt_tokens || 0,
      candidatesTokenCount: data.usage?.completion_tokens || 0,
      totalTokenCount: data.usage?.total_tokens || 0,
    },
  };
}

export async function generateWithTools({ systemInstruction, contents, tools }, { maxRetries } = {}) {
  if (!OPENROUTER_API_KEY) {
    throw Object.assign(new Error("OPENROUTER_API_KEY is not set."), { status: 500 });
  }
  if (!CHAT_MODEL) {
    throw Object.assign(new Error("OPENROUTER_CHAT_MODEL is not set — pick a model slug from openrouter.ai/models."), { status: 500 });
  }
  const data = await callOpenRouterChat(
    {
      model: CHAT_MODEL,
      messages: contentsToMessages(systemInstruction, contents),
      tools: toOpenAiTools(tools),
      tool_choice: "auto",
      temperature: 0,
    },
    { maxRetries }
  );
  return toGeminiShape(data);
}
