import { MENU_CATEGORIES } from "./menuCategories.js";
import { EXTRACTION_INSTRUCTIONS } from "./extractionInstructions.js";

const AZURE_ENDPOINT = process.env.AZURE_OPENAI_ENDPOINT;
const AZURE_API_KEY = process.env.AZURE_OPENAI_API_KEY;
const AZURE_API_VERSION = process.env.AZURE_OPENAI_API_VERSION || "2024-10-21";
const AZURE_EXTRACT_DEPLOYMENT = process.env.AZURE_OPENAI_EXTRACT_DEPLOYMENT;

// GPT-4o vision (chat completions) only takes rasterized images, unlike Gemini which
// accepts PDFs natively — scanned menus/price sheets uploaded as PDF need converting
// to an image first, or should go through the Gemini extraction path instead.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/gif", "image/webp"]);

// Structured Outputs strict mode requires every property listed in `required` (optional
// fields become nullable unions instead of being omitted) and `additionalProperties: false`
// on every object — different shape than Gemini's schema, so it isn't shared between the two.
function buildAzureExtractionSchema(type) {
  const categorySchema = type === "menu" ? { type: "string", enum: MENU_CATEGORIES } : { type: "string" };

  return {
    type: "object",
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          properties: {
            name: { type: "string" },
            category: categorySchema,
            vegetarian: { type: ["boolean", "null"] },
            price: { type: "number" },
            description: { type: ["string", "null"] },
            durationMin: { type: ["number", "null"] },
            author: { type: ["string", "null"] },
          },
          required: ["name", "category", "vegetarian", "price", "description", "durationMin", "author"],
          additionalProperties: false,
        },
      },
    },
    required: ["items"],
    additionalProperties: false,
  };
}

export async function extractItemsFromFileAzure(fileBuffer, mimeType, type) {
  if (!AZURE_ENDPOINT || !AZURE_API_KEY || !AZURE_EXTRACT_DEPLOYMENT) {
    throw new Error(
      "Azure OpenAI extraction is not configured — set AZURE_OPENAI_ENDPOINT, AZURE_OPENAI_API_KEY, and " +
        "AZURE_OPENAI_EXTRACT_DEPLOYMENT (a standard, non-realtime GPT-4o deployment with vision)."
    );
  }
  if (!SUPPORTED_IMAGE_MIME_TYPES.has(mimeType)) {
    const err = new Error(
      `Azure OpenAI extraction only accepts image files (png/jpeg/gif/webp) — got "${mimeType}". ` +
        "Convert PDFs to images first, or upload this file with EXTRACTION_PROVIDER=gemini."
    );
    err.status = 400;
    throw err;
  }

  const instructions = EXTRACTION_INSTRUCTIONS[type] || EXTRACTION_INSTRUCTIONS.menu;
  const dataUrl = `data:${mimeType};base64,${fileBuffer.toString("base64")}`;

  const url = `${AZURE_ENDPOINT.replace(/\/$/, "")}/openai/deployments/${AZURE_EXTRACT_DEPLOYMENT}/chat/completions?api-version=${AZURE_API_VERSION}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", "api-key": AZURE_API_KEY },
    body: JSON.stringify({
      messages: [
        {
          role: "user",
          content: [
            { type: "text", text: instructions },
            { type: "image_url", image_url: { url: dataUrl } },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: { name: "extraction", strict: true, schema: buildAzureExtractionSchema(type) },
      },
    }),
  });

  if (!response.ok) {
    const body = await response.text().catch(() => "");
    const err = new Error(`Azure OpenAI extraction failed (${response.status}): ${body}`);
    err.status = response.status;
    throw err;
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  try {
    return JSON.parse(content);
  } catch (err) {
    throw new Error("Failed to parse Azure extraction result: " + err.message);
  }
}

export function describeAzureExtractError(err) {
  if (err?.status === 400) {
    return { httpStatus: 400, message: err.message };
  }
  if (err?.status === 429) {
    return {
      httpStatus: 429,
      message: "Extraction is getting a lot of requests right now — please try again in about a minute.",
    };
  }
  if (err?.status === 503) {
    return { httpStatus: 503, message: "Extraction is temporarily unavailable — please try again in a few seconds." };
  }
  return { httpStatus: 500, message: "Sorry, something went wrong during extraction." };
}
