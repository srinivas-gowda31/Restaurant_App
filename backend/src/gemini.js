import { GoogleGenAI } from "@google/genai";
import { MENU_CATEGORIES } from "./menuCategories.js";
import { CUISINES } from "./cuisines.js";
import { EXTRACTION_INSTRUCTIONS } from "./extractionInstructions.js";

const apiKey = process.env.GEMINI_API_KEY;
if (!apiKey) {
  console.warn("GEMINI_API_KEY is not set. Gemini calls will fail.");
}

const ai = new GoogleGenAI({ apiKey });

export const CHAT_MODEL = process.env.GEMINI_MODEL_CHAT || "gemini-3.6-flash";
const EXTRACT_MODEL = process.env.GEMINI_MODEL_EXTRACT || "gemini-3.1-pro-preview";
const TTS_MODEL = process.env.GEMINI_MODEL_TTS || "gemini-2.5-flash-preview-tts";

/**
 * Wraps raw 16-bit PCM audio in a WAV container so browsers can play it directly.
 */
function pcmToWav(pcmBase64, { sampleRate = 24000, channels = 1, bitDepth = 16 } = {}) {
  const pcmBuffer = Buffer.from(pcmBase64, "base64");
  const byteRate = (sampleRate * channels * bitDepth) / 8;
  const blockAlign = (channels * bitDepth) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmBuffer.length, 4);
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(channels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitDepth, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmBuffer.length, 40);

  return Buffer.concat([header, pcmBuffer]).toString("base64");
}

export async function transcribeAudio(audioBuffer, mimeType) {
  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: "Transcribe this audio exactly as spoken. Return only the transcript text, no commentary." },
          { inlineData: { mimeType, data: audioBuffer.toString("base64") } },
        ],
      },
    ],
  });
  return (response.text || "").trim();
}

export async function synthesizeSpeech(text) {
  const response = await ai.models.generateContent({
    model: TTS_MODEL,
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: { prebuiltVoiceConfig: { voiceName: "Kore" } },
      },
    },
  });

  const part = response.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) return null;

  return pcmToWav(part.inlineData.data, { sampleRate: 24000 });
}

function buildExtractionSchema(type) {
  const categorySchema =
    type === "menu" ? { type: "string", enum: MENU_CATEGORIES } : { type: "string" };
  const properties = {
    name: { type: "string" },
    category: categorySchema,
    vegetarian: { type: "boolean" },
    price: { type: "number" },
    description: { type: "string" },
    durationMin: { type: "number" },
    author: { type: "string" },
  };
  if (type === "menu") properties.cuisine = { type: "string", enum: CUISINES };

  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties,
          required: type === "menu" ? ["name", "category", "cuisine", "price"] : ["name", "category", "price"],
        },
      },
    },
    required: ["items"],
  };
}

export async function extractItemsFromFile(fileBuffer, mimeType, type) {
  const instructions = EXTRACTION_INSTRUCTIONS[type] || EXTRACTION_INSTRUCTIONS.menu;

  const response = await ai.models.generateContent({
    model: EXTRACT_MODEL,
    contents: [
      {
        role: "user",
        parts: [
          { text: instructions },
          { inlineData: { mimeType, data: fileBuffer.toString("base64") } },
        ],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: buildExtractionSchema(type),
    },
  });

  try {
    return JSON.parse(response.text);
  } catch (err) {
    throw new Error("Failed to parse extraction result: " + err.message);
  }
}

// Structures already-OCR'd plain text into the catalog schema, using the cheaper/higher-quota
// chat model instead of EXTRACT_MODEL — there's no image here, just text, so the pro-preview
// model buys nothing. Used by the local-OCR extraction path, which does its own OCR outside
// Gemini and only needs this to turn raw text into structured items.
export async function structureExtractedText(text, type) {
  const instructions = EXTRACTION_INSTRUCTIONS[type] || EXTRACTION_INSTRUCTIONS.menu;

  const response = await ai.models.generateContent({
    model: CHAT_MODEL,
    contents: [
      {
        role: "user",
        parts: [{ text: `${instructions}\n\nDocument text (from OCR, may contain minor errors):\n${text}` }],
      },
    ],
    config: {
      responseMimeType: "application/json",
      responseSchema: buildExtractionSchema(type),
    },
  });

  try {
    return JSON.parse(response.text);
  } catch (err) {
    throw new Error("Failed to parse extraction result: " + err.message);
  }
}

export function describeGeminiError(err) {
  if (err?.status === 429) {
    return {
      httpStatus: 429,
      message: "The concierge is getting a lot of requests right now — please try again in about a minute.",
    };
  }
  if (err?.status === 503) {
    return {
      httpStatus: 503,
      message: "The concierge is temporarily unavailable — please try again in a few seconds.",
    };
  }
  return {
    httpStatus: 500,
    message: "Sorry, something went wrong. Please try again.",
  };
}

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function generateWithTools({ systemInstruction, contents, tools }) {
  let attempt = 0;
  for (;;) {
    try {
      return await ai.models.generateContent({
        model: CHAT_MODEL,
        contents,
        config: {
          systemInstruction,
          tools: tools ? [{ functionDeclarations: tools }] : undefined,
        },
      });
    } catch (err) {
      // Gemini's demand spikes (429/503) are usually seconds-long — one or two quick
      // retries with backoff often succeed rather than failing the guest's whole turn.
      if (attempt >= MAX_RETRIES || !RETRYABLE_STATUS.has(err?.status)) throw err;
      attempt += 1;
      await sleep(300 * 2 ** (attempt - 1));
    }
  }
}
