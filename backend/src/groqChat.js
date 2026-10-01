import { callGroqChat } from "./groqExtract.js";
import { withNullableOptionals } from "./tools.js";

// Groq's free tier (~1000 req/day) vs Gemini's free tier (hit its 20/day cap during testing) —
// this is the chat provider for when GEMINI_API_KEY's project quota isn't enough.
//
// Own dedicated key (GROQ_CHAT_API_KEY), separate from catalog extraction/cuisine
// classification's GROQ_API_KEY — confirmed live: sharing one key let a burst of chat traffic
// exhaust the whole account's 200K-tokens/day budget and silently break admin uploads and
// cuisine tagging too, with no relation to how much either of those was actually used that day.
// Falls back to GROQ_API_KEY only if a dedicated key was never configured.
const GROQ_CHAT_API_KEY = process.env.GROQ_CHAT_API_KEY || process.env.GROQ_API_KEY;
export const CHAT_MODEL = process.env.GROQ_CHAT_MODEL || "openai/gpt-oss-120b";

// assistant.js's whole tool-calling loop, cart logic, and system prompt are written against
// Gemini's response shape (candidates[0].content.parts, response.text, usageMetadata). Rather
// than rewriting that carefully-tuned logic per provider, this adapter speaks Gemini's shape on
// the outside and Groq's OpenAI-compatible chat-completions format underneath — assistant.js
// doesn't need to know which provider is actually answering.

// Gemini's function-call/response parts carry no id at all; OpenAI's format requires an
// assistant tool_call.id to match a later tool message's tool_call_id. assistant.js always
// pushes a function-calls model turn immediately followed by a function-responses user turn,
// in the same call order — so a deterministic id based on (message index, position within
// that message) reliably pairs them back up on every reconversion of the full history.
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
  // See withNullableOptionals (tools.js) for why — Groq's strict tool-call validation rejects
  // its own generation if it emits null for an optional field typed as plain "string".
  return withNullableOptionals(tools).map((t) => ({
    type: "function",
    function: { name: t.name, description: t.description, parameters: t.parameters },
  }));
}

// Converts Groq's OpenAI-shaped response back into the Gemini shape assistant.js reads from.
function toGeminiShape(data) {
  const message = data.choices?.[0]?.message || {};
  const parts = [];
  if (message.content) parts.push({ text: message.content });
  for (const toolCall of message.tool_calls || []) {
    let args = {};
    try {
      args = JSON.parse(toolCall.function.arguments || "{}");
    } catch (err) {
      console.error(`[groqChat] Failed to parse tool call args for ${toolCall.function.name}:`, err.message);
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

// maxRetries: assistant.js passes 0 here when it has a working fallback provider ready — fail
// immediately on a rate limit instead of sitting through Groq's own honored Retry-After (up to
// 45s, confirmed live), so assistant.js can fail over to a completely separate provider/quota
// in a fraction of the time instead of waiting out a shared per-minute budget a single complex
// turn can exceed on its own. Left undefined (groqExtract.js's normal retry-friendly default)
// when no fallback is configured, so this stays resilient rather than failing outright.
export async function generateWithTools({ systemInstruction, contents, tools }, { maxRetries } = {}) {
  const data = await callGroqChat(
    {
      model: CHAT_MODEL,
      messages: contentsToMessages(systemInstruction, contents),
      tools: toOpenAiTools(tools),
      tool_choice: "auto",
      // groqExtract.js found this exact model needs temperature:0 for reliable structured
      // behavior — at default temperature it picked the wrong tool entirely in testing here too
      // (add_to_order again instead of get_cart when just asked for the total). Same fix.
      temperature: 0,
    },
    GROQ_CHAT_API_KEY,
    { maxRetries }
  );
  return toGeminiShape(data);
}
