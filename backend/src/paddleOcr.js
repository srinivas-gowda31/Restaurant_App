import { PaddleOcrService, V6_SMALL_MODEL } from "ppu-paddle-ocr";

// Runs entirely in this process via ONNX Runtime — no external account, no API call, no rate
// limit. Auto-downloads and caches the ~30MB "small" model on first use (~/.cache/ppu-paddle-ocr).
//
// Chosen over Tesseract after directly comparing both on the same test document: Tesseract
// corrupted several prices outright (e.g. 450 -> 4350, 1295 -> 293 — wrong numbers, not
// recoverable). The small PaddleOCR model got 20/21 test prices exactly right, the one miss
// being a single O/0 character mix-up rather than a wrong number. The default "tiny" model was
// faster but showed a consistent 1/I confusion on multi-digit prices (1025 -> I025); the
// "medium" model fixed that too but was ~8x slower per page for no accuracy gain over small in
// this comparison. Used for PDF pages (see groqExtract.js/ocrExtract.js); single-image uploads
// still go through Groq's vision model directly — one API call comfortably fits its rate limit,
// and it's more accurate than any local OCR for that case.
let servicePromise = null;
function getService() {
  if (!servicePromise) {
    const service = new PaddleOcrService({ model: V6_SMALL_MODEL });
    // Kept alive for the life of the process instead of re-initializing (and re-loading the
    // ONNX session) on every request — initialize() alone took ~12s in testing.
    servicePromise = service.initialize().then(() => service);
  }
  return servicePromise;
}

function toArrayBuffer(buffer) {
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
}

export async function ocrPagesWithPaddle(pageBuffers) {
  const service = await getService();
  const texts = [];
  for (const buffer of pageBuffers) {
    const result = await service.recognize(toArrayBuffer(buffer));
    texts.push(result.text || "");
  }
  return texts;
}
