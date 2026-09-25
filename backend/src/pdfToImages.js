import { pdf } from "pdf-to-img";

// Vision/OCR models (local-ocr, huggingface) only accept raster images — a PDF has to be
// rasterized page-by-page first. A real hotel dining menu can easily run 15-20+ pages (cover,
// multiple outlets, desserts, bakery, legal footer) — 50 gives real menus headroom while still
// guarding against something absurd (someone accidentally uploading a 500-page document).
const MAX_PAGES = 50;

export async function convertPdfToImages(pdfBuffer) {
  // Higher than pdf-to-img's default — local Tesseract OCR (used for PDF pages, see
  // groqExtract.js/ocrExtract.js) is noticeably more accurate on small text/digits at higher
  // resolution; measured directly, this reduced digit misreads on rendered menu prices.
  const doc = await pdf(pdfBuffer, { scale: 3.0 });
  const pages = [];
  for await (const pageBuffer of doc) {
    pages.push(pageBuffer);
    if (pages.length >= MAX_PAGES) break;
  }
  return pages;
}
