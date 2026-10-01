import { convertPdfToImages } from "./pdfToImages.js";
import { ocrPagesWithPaddle } from "./paddleOcr.js";
import { EXTRACTION_INSTRUCTIONS } from "./extractionInstructions.js";
import { MENU_CATEGORIES } from "./menuCategories.js";
import { CUISINES } from "./cuisines.js";
import { mapWithConcurrency } from "./concurrency.js";

// Groq — no dollar-credit system, just rate limits, which comfortably covers occasional admin
// catalog uploads. Chosen over Hugging Face's Inference Providers after HF's free allowance
// turned out to be $0.10/month account-wide — nowhere near enough for real usage regardless of
// which model sits behind it. Groq's lineup churns fast (Llama 4 Scout/Maverick and Llama 3.3
// 70B were all deprecated within 2026) — if either model below 404s, check
// https://console.groq.com/docs/models and https://console.groq.com/docs/deprecations for the
// current roster before assuming it's a bug.
const GROQ_API_KEY = process.env.GROQ_API_KEY;
// Only vision-capable model on the free tier as of this writing — a preview model (Groq's own
// label), not production. Used only for single-image uploads (one API call, comfortably within
// budget); PDFs go through local PaddleOCR instead — see the PDF branch below for why.
// Acceptable to use a preview model here at all because every extraction still goes through a
// manual admin review/approve step before anything reaches a guest.
const GROQ_OCR_MODEL = process.env.GROQ_OCR_MODEL || "qwen/qwen3.8-27b";
// Text-only, production-status, strong at following a JSON-shape instruction.
const GROQ_STRUCTURE_MODEL = process.env.GROQ_STRUCTURE_MODEL || "openai/gpt-oss-120b";
const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);

// How many pages structure concurrently once OCR'd. Serialized (not just "modest") — the
// structuring model shares the same 8000-tokens-per-minute budget across every call, and
// concurrent calls race each other for the same refilling budget: one call's retry-after wait
// can complete just as a sibling call grabs the newly-refilled tokens, causing both to bounce
// off 429s repeatedly instead of the budget draining predictably. Confirmed directly — this
// exact race is what caused persistent 429s on gpt-oss-120b with concurrency 3.
const PAGE_CONCURRENCY = 1;

const RETRYABLE_STATUS = new Set([429, 503]);
const MAX_RETRIES = 5;
const MAX_RETRY_WAIT_MS = 45_000;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// apiKey lets a caller use its own dedicated Groq key instead of this module's — see
// groqChat.js and cuisineClassifier.js, which each now use a separate key so heavy use of one
// (chat, especially) can't exhaust the shared daily budget and starve the others. Confirmed
// directly: exactly that happened when chat and extraction shared one Groq account and chat
// traffic silently broke catalog uploads and cuisine tagging too.
//
// maxRetries overrides MAX_RETRIES — extraction/cuisine classification (admin-only, not guest-
// facing) are fine sitting through the default's honored Retry-After. Interactive chat isn't:
// confirmed directly, a single rate-limited call sat through a real 24-39s Retry-After wait,
// which is exactly the "inconsistent latency" a guest actually feels. groqChat.js passes 0 here
// so a rate limit fails immediately instead of sleeping through it, letting assistant.js fail
// over to a completely separate provider/quota in a fraction of the time instead.
export async function callGroqChat(body, apiKey = GROQ_API_KEY, { maxRetries = MAX_RETRIES } = {}) {
  let attempt = 0;
  for (;;) {
    let response;
    try {
      response = await fetch(GROQ_API_URL, {
        method: "POST",
        headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
    } catch (err) {
      // A raw network failure (connection reset, DNS hiccup) throws before there's any HTTP
      // response to check a status on — confirmed hitting this directly (ECONNRESET) mid guest
      // conversation, which crashed the whole backend process uncaught. Every Groq-backed
      // feature in this project goes through this one function (chat, cuisine classification,
      // catalog extraction), so this single fix covers all of them. Retry it the same as a
      // 429/503 rather than letting one flaky connection take the whole process down.
      if (attempt < maxRetries) {
        attempt += 1;
        await sleep(Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_WAIT_MS));
        continue;
      }
      throw err;
    }
    if (response.ok) return response.json();

    // "Request too large" is a 429 with the same rate_limit_exceeded code as a transient
    // "try again shortly" rate limit, but it means this specific request's own max_tokens
    // reservation exceeds the per-minute ceiling — retrying sends the identical oversized
    // reservation again, so it can never succeed. Fail fast instead of burning ~4 minutes of
    // retries on something only a smaller max_tokens (or a quota upgrade) can fix.
    if (response.status === 429) {
      const peek = await response.clone().text().catch(() => "");
      if (/request too large/i.test(peek)) {
        const err = new Error(`Groq request failed (429): ${peek}`);
        err.status = 429;
        throw err;
      }
    }

    if (RETRYABLE_STATUS.has(response.status) && attempt < maxRetries) {
      attempt += 1;
      // Groq's 429s carry an exact Retry-After (seconds) — the free tier's limit is a token
      // budget that refills on a schedule, so honoring the real number gets through reliably
      // instead of guessing a backoff and hitting the same wall again.
      const retryAfterHeader = Number(response.headers.get("retry-after"));
      const waitMs = Number.isFinite(retryAfterHeader)
        ? Math.min(retryAfterHeader * 1000 + 500, MAX_RETRY_WAIT_MS)
        : Math.min(500 * 2 ** (attempt - 1), MAX_RETRY_WAIT_MS);
      await sleep(waitMs);
      continue;
    }

    const bodyText = await response.text().catch(() => "");
    const err = new Error(`Groq request failed (${response.status}): ${bodyText}`);
    err.status = response.status;
    throw err;
  }
}

async function ocrImageViaGroq(fileBuffer, mimeType) {
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const data = await callGroqChat({
    model: GROQ_OCR_MODEL,
    // Without an explicit cap, Groq reserves more than the free tier's 1000 output-tokens-
    // per-minute limit by default (confirmed directly: even a trivial "hi" prompt got rejected
    // as "Request too large... Requested 1127" with no max_tokens set) — that's a hard,
    // non-retryable rejection of the request itself, not a transient rate limit, so no amount
    // of retrying fixes it. 900 stays under the limit while covering a full page transcription.
    max_tokens: 900,
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

function parseJsonResponse(content) {
  const cleaned = content
    .trim()
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/```\s*$/, "")
    .trim();
  return JSON.parse(cleaned);
}

export async function structureExtractedTextGroq(text, type) {
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

  // Groq's per-minute token budget is reserved against max_tokens at request time, not actual
  // output used (measured directly: a call with max_tokens:4096 alone burned ~5700 of the
  // 8000-token budget) — so this starts low to leave room for other pages' calls in the same
  // window, and only escalates for a page that genuinely needs more (a very item-dense page),
  // rather than reserving worst-case budget for every page up front.
  //
  // gpt-oss-120b is a reasoning model — it spends some of max_tokens on hidden reasoning before
  // ever writing the JSON (measured: 335 reasoning tokens on one test call, leaving well under
  // half the 1200 budget for actual output). reasoning_effort:"low" cut that to ~41 tokens with
  // no loss in output quality for this straightforward extraction task — not a task that
  // benefits from deep reasoning anyway. temperature:0 is set for the same "no creativity
  // needed" reason, and fixed a genuine bug found in testing: at default temperature, the exact
  // same page occasionally came back as a valid-but-empty {"items":[]} with no error at all
  // (confirmed reproducible) — 5/5 identical runs were consistent once temperature was 0.
  async function attemptOnce(maxTokens) {
    const data = await callGroqChat({
      model: GROQ_STRUCTURE_MODEL,
      max_tokens: maxTokens,
      temperature: 0,
      reasoning_effort: "low",
      messages: [{ role: "user", content: prompt }],
      response_format: { type: "json_object" },
    });

    // A budget that's too small doesn't always throw — the model can return syntactically
    // valid JSON with items silently missing once it runs low on room (confirmed directly: 17
    // of 25 items, HTTP 200, no error). finish_reason:"length" is the only reliable signal.
    if (data.choices?.[0]?.finish_reason === "length") {
      const err = new Error("max completion tokens reached before generating a valid document");
      err.status = 400;
      throw err;
    }

    const content = data.choices?.[0]?.message?.content || "";
    const parsed = parseJsonResponse(content);
    if (!Array.isArray(parsed.items)) throw new Error('response has no "items" array');
    return parsed;
  }

  const TOKEN_BUDGETS = [1200, 3500];
  let parsed;
  let lastErr;
  for (const maxTokens of TOKEN_BUDGETS) {
    try {
      parsed = await attemptOnce(maxTokens);
      lastErr = null;
      break;
    } catch (err) {
      // "max completion tokens reached..." (thrown above, or the hard-failure version of the
      // same thing from Groq itself) — retry with more room instead of failing the page.
      if (err?.status === 400 && /max completion tokens|json_validate_failed/i.test(err.message)) {
        lastErr = err;
        continue;
      }
      throw new Error("Failed to parse extraction result: " + err.message);
    }
  }
  if (lastErr) {
    const err = new Error(
      "This page had too many items to structure even with the largest token budget — try splitting it into a smaller upload."
    );
    err.status = 500;
    throw err;
  }

  // Safety net for the empty-result flakiness above — measured directly: even at temperature:0,
  // one heavily garbled test page returned {"items":[]} on 2 of 3 identical attempts before
  // succeeding on the 3rd, so this isn't purely random noise a single retry reliably beats. A
  // real page always has some text; only worth retrying when there was clearly something to
  // extract, and each retry is cheap relative to failing (or silently dropping) the whole page.
  const MAX_EMPTY_RETRIES = 3;
  let emptyRetries = 0;
  while (parsed.items.length === 0 && text.trim().length > 40 && emptyRetries < MAX_EMPTY_RETRIES) {
    emptyRetries += 1;
    parsed = await attemptOnce(TOKEN_BUDGETS[0]);
  }

  parsed.items = parsed.items.map((item) => ({
    ...item,
    description: !item.description || String(item.description).toLowerCase() === "null" ? "" : item.description,
  }));
  return parsed;
}

export async function extractItemsFromFileGroq(fileBuffer, mimeType, type) {
  if (!GROQ_API_KEY) {
    const err = new Error(
      "Groq extraction is not configured — set GROQ_API_KEY (a free key from https://console.groq.com/keys)."
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
    // PDFs read via local PaddleOCR, not Groq's vision model — the free-tier vision model caps
    // at 1000 output tokens/minute, and a single page transcription alone uses ~800-900 of
    // that, so it can sustain barely one page per minute. A real multi-page hotel menu (15-20+
    // pages) would take 15-20+ minutes and still likely fail retries along the way (this is
    // exactly what happened — confirmed via Groq's own rate-limit response). PaddleOCR has no
    // such ceiling and is meaningfully more accurate than Tesseract on prices/digits (see
    // paddleOcr.js) — only the (unconstrained) structuring step still goes through Groq.
    const pageTexts = await ocrPagesWithPaddle(pageImages);
    const perPageItems = await mapWithConcurrency(pageTexts, PAGE_CONCURRENCY, async (pageText) => {
      if (!pageText || !pageText.trim()) return [];
      const structured = await structureExtractedTextGroq(pageText, type);
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
      `Groq OCR only accepts image files (png/jpeg/webp) or PDFs — got "${mimeType}". Upload this file with ` +
        "EXTRACTION_PROVIDER=gemini instead."
    );
    err.status = 400;
    throw err;
  }

  const text = await ocrImageViaGroq(fileBuffer, mimeType);
  if (!text || !text.trim()) {
    const err = new Error("OCR could not read any text from this file — try a clearer photo/scan.");
    err.status = 422;
    throw err;
  }

  return structureExtractedTextGroq(text, type);
}

export function describeGroqExtractError(err) {
  if (err?.status === 400 && /max completion tokens|json_validate_failed/i.test(err.message || "")) {
    return {
      httpStatus: 500,
      message: "One page of this document had too many items to structure in one pass — try splitting it into smaller uploads.",
    };
  }
  if (err?.status === 400 || err?.status === 422 || err?.status === 500) {
    return { httpStatus: err.status, message: err.message };
  }
  // Distinct from a transient rate limit — retrying won't help, so don't tell the admin to.
  if (err?.status === 429 && /request too large/i.test(err.message || "")) {
    return {
      httpStatus: 500,
      message: "Extraction request was too large for the current free-tier limit — this needs a config fix, not a retry.",
    };
  }
  if (err?.status === 429 || err?.status === 503) {
    return {
      httpStatus: 429,
      message: "Extraction is getting a lot of requests right now — please try again in about a minute.",
    };
  }
  return { httpStatus: 500, message: "Sorry, something went wrong during extraction." };
}
