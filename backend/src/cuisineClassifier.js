import { callGroqChat } from "./groqExtract.js";
import { CUISINES, normalizeCuisine } from "./cuisines.js";

const GROQ_STRUCTURE_MODEL = process.env.GROQ_STRUCTURE_MODEL || "openai/gpt-oss-120b";

// Chunked to stay well under the structuring model's per-minute token budget (see
// groqExtract.js) — a single request classifying 200+ dish names at once risks the same
// "Request too large" 429 that budgeted extraction already works around.
const CHUNK_SIZE = 40;

function chunk(array, size) {
  const chunks = [];
  for (let i = 0; i < array.length; i += size) chunks.push(array.slice(i, i + size));
  return chunks;
}

function parseJsonResponse(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

async function classifyChunk(items) {
  const numbered = items.map((item, i) => `${i}. ${item.name}${item.description ? " — " + item.description : ""}`).join("\n");

  const prompt = `Classify each numbered menu item below into EXACTLY one cuisine: ${CUISINES.join(", ")}.
Indian: biryani, tikka, tandoori, paneer, naan, paratha, chaat, curries, Indian sweets/chai, etc.
Chinese: manchurian, hakka noodles, momos, schezwan, fried rice, chilli-tossed dishes, etc.
Continental: everything else — pizza, pasta, burgers, sandwiches, steaks, salads, French/Western dishes,
desserts, and beverages.

Items:
${numbered}

Respond with ONLY a JSON object of this exact shape, one entry per item, same order, no commentary:
{"cuisines":[string, ...]}`;

  const data = await callGroqChat({
    model: GROQ_STRUCTURE_MODEL,
    max_tokens: 800,
    temperature: 0,
    reasoning_effort: "low",
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = data.choices?.[0]?.message?.content || "";
  const parsed = parseJsonResponse(content);
  if (!Array.isArray(parsed.cuisines)) throw new Error('response has no "cuisines" array');
  return items.map((_, i) => normalizeCuisine(parsed.cuisines[i]));
}

/**
 * Batch-classifies menu items lacking a cuisine into Indian/Chinese/Continental using the
 * same Groq model already used for catalog extraction. Returns cuisine strings aligned by
 * index with the input array (never throws per-item — a chunk that fails to parse falls
 * back to "Continental" for its items rather than failing the whole batch).
 */
export async function classifyCuisines(items) {
  const results = [];
  for (const batch of chunk(items, CHUNK_SIZE)) {
    try {
      results.push(...(await classifyChunk(batch)));
    } catch (err) {
      console.error("Cuisine classification chunk failed, defaulting to Continental:", err.message);
      results.push(...batch.map(() => "Continental"));
    }
  }
  return results;
}
