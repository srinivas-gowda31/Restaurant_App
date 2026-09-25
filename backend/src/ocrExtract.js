import { ocrPagesWithPaddle } from "./paddleOcr.js";
import { structureExtractedTextGroq } from "./groqExtract.js";
import { convertPdfToImages } from "./pdfToImages.js";
import { mapWithConcurrency } from "./concurrency.js";

// Only handles rasterized images directly; PDFs are rasterized page-by-page first (see
// pdfToImages.js) since PaddleOCR reads images, not PDF structure.
const SUPPORTED_IMAGE_MIME_TYPES = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/bmp"]);

// Structuring goes through Groq even though OCR runs locally — serialized (not just capped),
// since concurrent calls race each other for the same shared per-minute token budget and can
// cause persistent 429s even with retry-after handling (confirmed directly in groqExtract.js).
const PAGE_CONCURRENCY = 1;

export async function extractItemsFromFileLocalOcr(fileBuffer, mimeType, type) {
  if (mimeType === "application/pdf") {
    const pageImages = await convertPdfToImages(fileBuffer);
    if (pageImages.length === 0) {
      const err = new Error("Could not read any pages from this PDF — it may be empty or corrupted.");
      err.status = 422;
      throw err;
    }
    // OCR runs locally via PaddleOCR (cheap, no rate limit), but each page is structured on
    // its own via Groq rather than combined into one giant prompt — same reliability reasoning
    // as groqExtract.js's PDF path.
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
      `Local OCR only accepts image files (png/jpeg/webp/bmp) or PDFs — got "${mimeType}". Upload this file ` +
        "with EXTRACTION_PROVIDER=gemini instead."
    );
    err.status = 400;
    throw err;
  }

  const [text] = await ocrPagesWithPaddle([fileBuffer]);
  if (!text || !text.trim()) {
    const err = new Error("OCR could not read any text from this file — try a clearer photo/scan.");
    err.status = 422;
    throw err;
  }

  return structureExtractedTextGroq(text, type);
}

export function describeLocalOcrError(err) {
  if (err?.status === 400 || err?.status === 422) {
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
