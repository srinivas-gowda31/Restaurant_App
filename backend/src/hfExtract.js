import { convertPdfToImages } from "./pdfToImages.js";
import { EXTRACTION_INSTRUCTIONS } from "./extractionInstructions.js";
import { MENU_CATEGORIES } from "./menuCategories.js";
import { CUISINES } from "./cuisines.js";
import { mapWithConcurrency } from "./concurrency.js";

// Hugging Face Inference Providers — a serverless router, not a deployment. A free
// fine-grained token ("Make calls to Inference Providers" permission) is all that's needed;
// no endpoint to provision, no infra to own.
// Note: provider mappings change over time and models can go stale (DeepSeek-OCR's Novita
// mapping broke server-side, confirmed via HF's own model API). If HF_OCR_MODEL starts 404ing,
// check https://huggingface.co/api/models/<model>?expand=inferenceProviderMapping for a live one.
const HF_TOKEN = process.env.HF_TOKEN;
const HF_OCR_MODEL = process.env.HF_OCR_MODEL || "google/gemma-3-27b-it:deepinfra";
// Same model does double duty: OCR (vision) and structuring (plain text -> JSON). Keeps the
// whole catalog-extraction pipeline off Gemini entirely — no cross-provider dependency, no
// shared quota with the chat assistant. Override separately if a different model structures
// JSON more reliably than it does OCR for your documents.
const HF_STRUCTURE_MODEL = process.env.HF_STRUCTURE_MODEL || HF_OCR_MODEL;
const HF_ROUTER_URL = "https://router.huggingface.co/v1/chat/completions";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

// How many pages of a multi-page PDF are OCR'd/structured at once. A real hotel menu can run
// 15-20+ pages — running them all concurrently would either flood the free-tier provider with
// 429s or leave a single request idling behind dozens of others; a small worker pool keeps
// steady throughput instead.
const PAGE_CONCURRENCY = 3;

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_RETRIES = 2;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// Free-tier providers behind the router (deepinfra, featherless-ai, etc.) occasionally return
// 429/503 under load — same class of transient error Gemini was producing, just from a
// different vendor. A couple of quick backoff retries absorb that instead of failing the
// guest-facing upload outright.
async function callHFChat(body) {
  let attempt = 0;
  for (;;) {
    const response = await fetch(HF_ROUTER_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${HF_TOKEN}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    if (response.ok) return response.json();

    if (RETRYABLE_STATUS.has(response.status) && attempt < MAX_RETRIES) {
      attempt += 1;
      await sleep(400 * 2 ** (attempt - 1));
      continue;
    }

    const bodyText = await response.text().catch(() => "");
    const err = new Error(`Hugging Face request failed (${response.status}): ${bodyText}`);
    err.status = response.status;
    throw err;
  }
}

async function ocrImageViaHF(fileBuffer, mimeType) {
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const data = await callHFChat({
    model: HF_OCR_MODEL,
    messages: [
      {
        role: "user",
        content: [
          {
            type: "text",
            text:
              "Transcribe every line of visible text in this document image exactly as written — item names, " +
              "categories, prices, descriptions. Return only the transcribed text, no commentary or formatting.",
          },
          { type: "image_url", image_url: { url: dataUrl } },
        ],
      },
    ],
  });

  return (data.choices?.[0]?.message?.content || "").trim();
}

// A general-purpose HF chat model isn't a JSON-schema-enforcing API like Gemini/Azure — it can
// only be asked nicely via response_format:"json_object" (guarantees syntactically valid JSON,
// but not our exact shape) and a spelled-out shape in the prompt. Strips markdown fences too,
// since some models wrap JSON in ```json even when told not to.
function parseJsonResponse(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function structureExtractedTextHF(text, type) {
  const instructions = EXTRACTION_INSTRUCTIONS[type] || EXTRACTION_INSTRUCTIONS.menu;
  const categoryHint = type === "menu" ? ` "category" must be exactly one of: ${MENU_CATEGORIES.join(", ")}.` : "";
  const cuisineHint = type === "menu" ? ` "cuisine" must be exactly one of: ${CUISINES.join(", ")}.` : "";
  const cuisineField = type === "menu" ? `,"cuisine":string` : "";

  const prompt = `${instructions}${categoryHint}${cuisineHint}

Document text (from OCR, may contain minor errors):
${text}

Respond with ONLY a JSON object of this exact shape — no markdown fences, no commentary, no extra top-level fields:
{"items":[{"name":string,"category":string${cuisineField},"vegetarian":boolean,"price":number,"description":string}]}
Omit "vegetarian" and "cuisine" for non-food catalogs. If you don't have a description, use "" (empty string) —
never the word null and never omit "items".`;

  const data = await callHFChat({
    model: HF_STRUCTURE_MODEL,
    messages: [{ role: "user", content: prompt }],
    response_format: { type: "json_object" },
  });

  const content = data.choices?.[0]?.message?.content || "";
  let parsed;
  try {
    parsed = parseJsonResponse(content);
    if (!Array.isArray(parsed.items)) throw new Error("response has no \"items\" array");
  } catch (err) {
    throw new Error("Failed to parse extraction result: " + err.message);
  }

  // Smaller open models sometimes write the literal string "null" instead of an empty
  // description (or actual JSON null) despite the prompt — normalize both to "".
  parsed.items = parsed.items.map((item) => ({
    ...item,
    description: !item.description || String(item.description).toLowerCase() === "null" ? "" : item.description,
  }));
  return parsed;
}

export async function extractItemsFromFileHF(fileBuffer, mimeType, type) {
  if (!HF_TOKEN) {
    const err = new Error(
      "Hugging Face extraction is not configured — set HF_TOKEN (a free fine-grained token with " +
        "'Make calls to Inference Providers' permission, from https://huggingface.co/settings/tokens/new)."
    );
    err.status = 500;
    throw err;
  }

  if (mimeType === "application/pdf") {
    const pageImages = await convertPdfToImages(fileBuffer);
    if (pageImages.length === 0) {
      const err = new Error("Could not read any pages from this PDF — it may be empty or corrupted.");
      err.status = 422;
      throw err;
    }
    // Each page is OCR'd then structured on its own (rather than stitching all pages into one
    // giant blob for a single structuring call) — a 15-20 page real hotel menu produces enough
    // text that one combined prompt risks truncation/timeouts on a free-tier model, and
    // structuring per page is naturally parallelizable and isolates a bad page's failure from
    // the rest of the document.
    const perPageItems = await mapWithConcurrency(pageImages, PAGE_CONCURRENCY, async (page) => {
      const pageText = await ocrImageViaHF(page, "image/png");
      if (!pageText || !pageText.trim()) return [];
      const structured = await structureExtractedTextHF(pageText, type);
      return structured.items || [];
    });

    const items = perPageItems.flat();
    if (items.length === 0) {
      const err = new Error("OCR could not read any items from this PDF — try a clearer scan.");
      err.status = 422;
      throw err;
    }
    return { items };
  }

  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    const err = new Error(
      `Hugging Face OCR only accepts image files (png/jpeg/webp) or PDFs — got "${mimeType}". Upload this file ` +
        "with EXTRACTION_PROVIDER=gemini instead."
    );
    err.status = 400;
    throw err;
  }

  const text = await ocrImageViaHF(fileBuffer, mimeType);
  if (!text || !text.trim()) {
    const err = new Error("OCR could not read any text from this file — try a clearer photo/scan.");
    err.status = 422;
    throw err;
  }

  return structureExtractedTextHF(text, type);
}

export function describeHFExtractError(err) {
  if (err?.status === 400 || err?.status === 422 || err?.status === 500) {
    return { httpStatus: err.status, message: err.message };
  }
  if (err?.status === 429 || err?.status === 503) {
    return {
      httpStatus: 429,
      message: "Extraction is getting a lot of requests right now — please try again in about a minute.",
    };
  }
  return { httpStatus: 500, message: "Sorry, something went wrong during extraction." };
}
