import { Router } from "express";
import multer from "multer";
import { prisma, getHotelByAdminKey } from "../db.js";
import { extractItemsFromFile, describeGeminiError } from "../gemini.js";
import { extractItemsFromFileAzure, describeAzureExtractError } from "../azureExtract.js";
import { extractItemsFromFileLocalOcr, describeLocalOcrError } from "../ocrExtract.js";
import { extractItemsFromFileHF, describeHFExtractError } from "../hfExtract.js";
import { extractItemsFromFileGroq, describeGroqExtractError } from "../groqExtract.js";
import { parseSpreadsheet } from "../excelImport.js";
import { normalizeMenuCategory } from "../menuCategories.js";
import { normalizeCuisine } from "../cuisines.js";
import { isBreakfastItem } from "../mealTime.js";
import { isSnackItem } from "../snacks.js";
import { classifyCuisines } from "../cuisineClassifier.js";
import { mapWithConcurrency } from "../concurrency.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

const CATALOG_TYPES = ["menu", "spa", "housekeeping", "library"];

// "gemini" (default), "azure" (needs a deployed standard GPT-4o resource), "local-ocr"
// (PaddleOCR in-process), "huggingface" (free serverless Inference Providers — but capped
// at $0.10/month account-wide, not enough for real usage), or "groq" (no dollar credits, just
// rate limits — ~1000 req/day free, the current recommended option). local-ocr/huggingface use
// Gemini's CHAT_MODEL to structure OCR'd text; groq structures with its own model instead.
const EXTRACTION_PROVIDER = process.env.EXTRACTION_PROVIDER || "gemini";

const EXTRACTORS = {
  gemini: { extract: extractItemsFromFile, describeError: describeGeminiError },
  azure: { extract: extractItemsFromFileAzure, describeError: describeAzureExtractError },
  "local-ocr": { extract: extractItemsFromFileLocalOcr, describeError: describeLocalOcrError },
  huggingface: { extract: extractItemsFromFileHF, describeError: describeHFExtractError },
  groq: { extract: extractItemsFromFileGroq, describeError: describeGroqExtractError },
};

// Every route below is staff-only (menu/room management, orders, guest names, usage stats) —
// fail closed (never open) if the key isn't configured or doesn't match. The key now identifies
// WHICH hotel is logging in (looked up via a unique-indexed DB column), not just whether the
// request is authorized at all — this is the whole point of multi-hotel support: one hotel's
// staff can never see or touch another hotel's data, because every route below reads req.hotelId
// from THIS lookup, never a hardcoded single-hotel constant.
router.use(async (req, res, next) => {
  const provided = req.get("X-Admin-Key");
  const hotel = await getHotelByAdminKey(provided);
  if (!hotel) {
    return res.status(401).json({ error: "Missing or invalid admin key." });
  }
  req.hotelId = hotel.id;
  req.hotelName = hotel.name;
  req.hotelSlug = hotel.slug;
  next();
});

router.get("/hotel", (req, res) => {
  res.json({ hotel: { id: req.hotelId, name: req.hotelName, slug: req.hotelSlug } });
});

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { type } = req.body;
    if (!req.file || !type || !CATALOG_TYPES.includes(type)) {
      return res.status(400).json({ error: `A file and a type (${CATALOG_TYPES.join(", ")}) are required.` });
    }

    const extractor = EXTRACTORS[EXTRACTION_PROVIDER] || EXTRACTORS.gemini;
    const extraction = await extractor.extract(req.file.buffer, req.file.mimetype, type);

    const uploadRecord = await prisma.upload.create({
      data: {
        hotelId: req.hotelId,
        type,
        fileName: req.file.originalname,
        status: "pending_review",
        rawExtractionJson: JSON.stringify(extraction),
      },
    });

    res.json({ upload: uploadRecord, extraction });
  } catch (err) {
    console.error("Upload error:", err);
    const extractor = EXTRACTORS[EXTRACTION_PROVIDER] || EXTRACTORS.gemini;
    const { httpStatus, message } = extractor.describeError(err);
    res.status(httpStatus).json({ error: message });
  }
});

router.post("/upload-excel", upload.single("file"), async (req, res) => {
  try {
    const { type } = req.body;
    if (!req.file || !type || !CATALOG_TYPES.includes(type)) {
      return res.status(400).json({ error: `A spreadsheet file and a type (${CATALOG_TYPES.join(", ")}) are required.` });
    }

    const items = await parseSpreadsheet(req.file.buffer, type);
    if (items.length === 0) {
      return res.status(400).json({
        error: "No valid rows found. Make sure the sheet has a header row with 'name' and 'price' columns.",
      });
    }

    const uploadRecord = await prisma.upload.create({
      data: {
        hotelId: req.hotelId,
        type,
        fileName: req.file.originalname,
        status: "pending_review",
        rawExtractionJson: JSON.stringify({ items }),
      },
    });

    res.json({ upload: uploadRecord, extraction: { items } });
  } catch (err) {
    console.error("Excel upload error:", err);
    res.status(500).json({ error: "Failed to read the spreadsheet. Make sure it's a valid .xlsx file." });
  }
});

router.get("/uploads", async (req, res) => {
  const uploads = await prisma.upload.findMany({
    where: { hotelId: req.hotelId },
    orderBy: { createdAt: "desc" },
  });
  res.json({ uploads });
});

function buildCatalogData(type, item, hotelId) {
  const base = {
    hotelId,
    name: item.name,
    category: type === "menu" ? normalizeMenuCategory(item.category) : item.category || "Other",
    price: Number(item.price) || 0,
    description: item.description || "",
  };
  if (type === "menu") {
    return {
      ...base,
      vegetarian: !!item.vegetarian,
      cuisine: normalizeCuisine(item.cuisine),
      breakfast: isBreakfastItem(item.name),
      snack: isSnackItem(base.category, item.name),
    };
  }
  if (type === "spa") return { ...base, durationMin: item.durationMin ? Number(item.durationMin) : null };
  if (type === "library") return { ...base, author: item.author || null };
  return base; // housekeeping
}

const CATALOG_MODEL = {
  menu: (p) => p.menuItem,
  spa: (p) => p.spaService,
  housekeeping: (p) => p.housekeepingItem,
  library: (p) => p.libraryItem,
};

// Looks up an existing catalog item by name (case-insensitive) within the hotel and
// replaces it in place if found, instead of creating a second row — so re-uploading
// the same menu (or a guest's manual edit) never leaves duplicates like "Tea" / "TEA".
async function upsertCatalogItem(model, hotelId, data) {
  const existing = await model.findFirst({
    where: { hotelId, name: { equals: data.name, mode: "insensitive" } },
  });
  if (existing) {
    return model.update({ where: { id: existing.id }, data: { ...data, isActive: true } });
  }
  return model.create({ data });
}

// A PATCH/DELETE by bare :id has no natural way to scope its WHERE clause to a hotel (there's
// no compound id+hotelId key) — without this, one hotel's admin key could edit or delete
// another hotel's row just by guessing/knowing its id. Fetch-then-check-then-mutate closes
// that: 404 if the row doesn't belong to the requesting hotel, same as if it didn't exist at all.
async function assertOwnedByHotel(model, id, hotelId) {
  const row = await model.findUnique({ where: { id } });
  return row && row.hotelId === hotelId ? row : null;
}

router.post("/uploads/:id/approve", async (req, res) => {
  try {
    const uploadRecord = await assertOwnedByHotel(prisma.upload, req.params.id, req.hotelId);
    if (!uploadRecord) return res.status(404).json({ error: "Upload not found." });
    if (uploadRecord.status === "approved") {
      return res.status(400).json({ error: "Upload already approved." });
    }

    const items = req.body.items || JSON.parse(uploadRecord.rawExtractionJson || "{}").items || [];
    const model = CATALOG_MODEL[uploadRecord.type]?.(prisma);
    if (!model) return res.status(400).json({ error: `Unknown upload type: ${uploadRecord.type}` });

    // Dedupe by case-insensitive name in memory (later row wins) instead of relying on
    // sequential DB writes to resolve it — a real multi-page hotel menu can run 150-200+
    // items, and this used to do 2 sequential round trips per item (a lookup, then a
    // create/update). One findMany up front resolves which names already exist.
    const dedupedByName = new Map();
    for (const i of items) {
      if (i?.name) dedupedByName.set(String(i.name).trim().toLowerCase(), i);
    }
    const dedupedItems = [...dedupedByName.values()];

    // Menu extraction/Excel import may already tag cuisine (see extractionInstructions.js /
    // excelImport.js) — only the leftovers (e.g. an older raw extraction saved before this
    // field existed, or an Excel sheet with no cuisine column) need a classification call,
    // batched into as few Groq requests as possible rather than one per item.
    if (uploadRecord.type === "menu") {
      const unclassified = dedupedItems.filter((i) => !i.cuisine);
      if (unclassified.length > 0) {
        const cuisines = await classifyCuisines(unclassified);
        unclassified.forEach((item, i) => {
          item.cuisine = cuisines[i];
        });
      }
    }

    const existing = await model.findMany({ where: { hotelId: req.hotelId } });
    const existingByName = new Map(existing.map((e) => [e.name.toLowerCase(), e]));

    // A fresh upload is almost always all-new rows — split into a single createMany (one round
    // trip, no matter how many items) and updates for the few names that already exist, rather
    // than N individual create() calls each paying their own network round trip.
    const toCreate = [];
    const toUpdate = [];
    for (const i of dedupedItems) {
      const data = { ...buildCatalogData(uploadRecord.type, i, req.hotelId), isActive: true };
      const match = existingByName.get(String(i.name).trim().toLowerCase());
      if (match) toUpdate.push({ id: match.id, data });
      else toCreate.push(data);
    }

    if (toCreate.length > 0) await model.createMany({ data: toCreate });
    await mapWithConcurrency(toUpdate, 10, ({ id, data }) => model.update({ where: { id }, data }));

    const updated = await prisma.upload.update({
      where: { id: uploadRecord.id },
      data: { status: "approved", reviewedAt: new Date() },
    });

    res.json({ upload: updated });
  } catch (err) {
    console.error("Approve error:", err);
    res.status(500).json({ error: "Failed to approve upload." });
  }
});

router.post("/uploads/:id/reject", async (req, res) => {
  const owned = await assertOwnedByHotel(prisma.upload, req.params.id, req.hotelId);
  if (!owned) return res.status(404).json({ error: "Upload not found." });
  const uploadRecord = await prisma.upload.update({
    where: { id: req.params.id },
    data: { status: "rejected", reviewedAt: new Date() },
  });
  res.json({ upload: uploadRecord });
});

router.get("/orders", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { hotelId: req.hotelId },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ orders });
});

router.get("/menu-items", async (req, res) => {
  const items = await prisma.menuItem.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.post("/menu-items", async (req, res) => {
  const { name, category, cuisine, breakfast, snack, vegetarian, price, description } = req.body;
  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price are required." });
  }
  // A staff-picked cuisine is normalized as-is; with none given, one Groq call classifies
  // this single item rather than leaving it stuck defaulting to Continental.
  const resolvedCuisine = cuisine ? normalizeCuisine(cuisine) : (await classifyCuisines([{ name, description }]))[0];
  const resolvedCategory = normalizeMenuCategory(category);
  const item = await upsertCatalogItem(prisma.menuItem, req.hotelId, {
    hotelId: req.hotelId,
    name,
    category: resolvedCategory,
    cuisine: resolvedCuisine,
    breakfast: breakfast !== undefined ? !!breakfast : isBreakfastItem(name),
    snack: snack !== undefined ? !!snack : isSnackItem(resolvedCategory, name),
    vegetarian: !!vegetarian,
    price: Number(price) || 0,
    description: description || "",
  });
  res.json({ item });
});

router.patch("/menu-items/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.menuItem, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Menu item not found." });
  }
  const { name, category, cuisine, breakfast, snack, vegetarian, price, description, isActive } = req.body;
  const item = await prisma.menuItem.update({
    where: { id: req.params.id },
    data: {
      name,
      cuisine: cuisine !== undefined ? normalizeCuisine(cuisine) : undefined,
      category: category !== undefined ? normalizeMenuCategory(category) : undefined,
      breakfast,
      snack,
      vegetarian,
      price,
      description,
      isActive,
    },
  });
  res.json({ item });
});

router.get("/spa-services", async (req, res) => {
  const services = await prisma.spaService.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ services });
});

router.post("/spa-services", async (req, res) => {
  const { name, category, durationMin, price, description } = req.body;
  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price are required." });
  }
  const service = await upsertCatalogItem(prisma.spaService, req.hotelId, {
    hotelId: req.hotelId,
    name,
    category: category || "Other",
    durationMin: durationMin ? Number(durationMin) : null,
    price: Number(price) || 0,
    description: description || "",
  });
  res.json({ service });
});

router.patch("/spa-services/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.spaService, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Spa service not found." });
  }
  const { name, category, durationMin, price, description, isActive } = req.body;
  const service = await prisma.spaService.update({
    where: { id: req.params.id },
    data: { name, category, durationMin, price, description, isActive },
  });
  res.json({ service });
});

router.get("/housekeeping-items", async (req, res) => {
  const items = await prisma.housekeepingItem.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.post("/housekeeping-items", async (req, res) => {
  const { name, category, price, description } = req.body;
  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price are required." });
  }
  const item = await upsertCatalogItem(prisma.housekeepingItem, req.hotelId, {
    hotelId: req.hotelId,
    name,
    category: category || "Other",
    price: Number(price) || 0,
    description: description || "",
  });
  res.json({ item });
});

router.patch("/housekeeping-items/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.housekeepingItem, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Housekeeping item not found." });
  }
  const { name, category, price, description, isActive } = req.body;
  const item = await prisma.housekeepingItem.update({
    where: { id: req.params.id },
    data: { name, category, price, description, isActive },
  });
  res.json({ item });
});

router.get("/library-items", async (req, res) => {
  const items = await prisma.libraryItem.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.post("/library-items", async (req, res) => {
  const { name, category, author, price, description } = req.body;
  if (!name) {
    return res.status(400).json({ error: "Name is required." });
  }
  const item = await upsertCatalogItem(prisma.libraryItem, req.hotelId, {
    hotelId: req.hotelId,
    name,
    category: category || "Other",
    author: author || null,
    price: Number(price) || 0,
    description: description || "",
  });
  res.json({ item });
});

router.patch("/library-items/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.libraryItem, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Library item not found." });
  }
  const { name, category, author, price, description, isActive } = req.body;
  const item = await prisma.libraryItem.update({
    where: { id: req.params.id },
    data: { name, category, author, price, description, isActive },
  });
  res.json({ item });
});

const FULFILLMENT_MODEL = {
  kitchen: (p) => p.kitchenTicket,
  housekeeping: (p) => p.housekeepingRequest,
  spa: (p) => p.spaBooking,
  library: (p) => p.libraryRequest,
};

// Kitchen/housekeeping/spa/library tickets have no hotelId column of their own — only orderId,
// and Order has no Prisma relation object defined on these tables (just a bare string field), so
// a relational `where: { order: { hotelId } }` filter isn't available directly. Scoping through
// a first pass over this hotel's own Order ids is what actually closes it. Confirmed as a real
// gap while wiring up multi-hotel support: without this, /fulfillment returned EVERY hotel's
// tickets to any admin, not just a guessable-id edge case — genuine cross-tenant data exposure.
async function hotelOrderIds(hotelId) {
  const orders = await prisma.order.findMany({ where: { hotelId }, select: { id: true } });
  return orders.map((o) => o.id);
}

router.get("/fulfillment/:department", async (req, res) => {
  const model = FULFILLMENT_MODEL[req.params.department]?.(prisma);
  if (!model) return res.status(404).json({ error: `Unknown department: ${req.params.department}` });

  const orderIds = await hotelOrderIds(req.hotelId);
  const tickets = await model.findMany({ where: { orderId: { in: orderIds } }, orderBy: { createdAt: "desc" } });
  res.json({ tickets });
});

const AGENT_PRIORITIES = new Set(["low", "normal", "high", "urgent"]);

router.patch("/fulfillment/:department/:id", async (req, res) => {
  const model = FULFILLMENT_MODEL[req.params.department]?.(prisma);
  if (!model) return res.status(404).json({ error: `Unknown department: ${req.params.department}` });

  const ticket = await model.findUnique({ where: { id: req.params.id } });
  const order = ticket && (await prisma.order.findUnique({ where: { id: ticket.orderId }, select: { hotelId: true } }));
  if (!ticket || !order || order.hotelId !== req.hotelId) {
    return res.status(404).json({ error: "Ticket not found." });
  }

  // priority/agentNote are written by the CrewAI ops-agent layer (agents/), not staff — status
  // stays the only field FulfillmentBoard.jsx itself sends. Prisma skips undefined keys, so
  // omitting priority/agentNote from a request (the staff UI's case) leaves them untouched.
  const { status, priority, agentNote } = req.body;
  if (priority !== undefined && priority !== null && !AGENT_PRIORITIES.has(priority)) {
    return res.status(400).json({ error: `priority must be one of: ${[...AGENT_PRIORITIES].join(", ")}` });
  }

  const updated = await model.update({
    where: { id: req.params.id },
    data: { status, priority, agentNote },
  });
  res.json({ ticket: updated });
});

router.get("/front-desk-alerts", async (req, res) => {
  const alerts = await prisma.frontDeskAlert.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  res.json({ alerts });
});

router.patch("/front-desk-alerts/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.frontDeskAlert, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Alert not found." });
  }
  // agentNote/urgency-upgrade are written by the CrewAI ops-agent layer (agents/); status stays
  // the only field FrontDeskAlerts.jsx itself sends.
  const { status, urgency, agentNote } = req.body;
  if (urgency !== undefined && urgency !== null && !["normal", "urgent"].includes(urgency)) {
    return res.status(400).json({ error: 'urgency must be "normal" or "urgent"' });
  }

  const alert = await prisma.frontDeskAlert.update({
    where: { id: req.params.id },
    data: { status, urgency, agentNote },
  });
  res.json({ alert });
});

router.get("/concierge-requests", async (req, res) => {
  const requests = await prisma.conciergeRequest.findMany({
    where: { hotelId: req.hotelId },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
  res.json({ requests });
});

router.patch("/concierge-requests/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.conciergeRequest, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Concierge request not found." });
  }
  const { status, urgency, agentNote } = req.body;
  if (urgency !== undefined && urgency !== null && !["normal", "urgent"].includes(urgency)) {
    return res.status(400).json({ error: 'urgency must be "normal" or "urgent"' });
  }
  const request = await prisma.conciergeRequest.update({
    where: { id: req.params.id },
    data: { status, urgency, agentNote },
  });
  res.json({ request });
});

router.get("/rooms", async (req, res) => {
  const rooms = await prisma.room.findMany({
    where: { hotelId: req.hotelId },
    orderBy: { number: "asc" },
  });
  res.json({ rooms });
});

router.post("/rooms", async (req, res) => {
  const { number, guestName } = req.body;
  if (!number || !number.trim()) {
    return res.status(400).json({ error: "Room number is required." });
  }
  const room = await prisma.room.upsert({
    where: { hotelId_number: { hotelId: req.hotelId, number: number.trim() } },
    update: { guestName: guestName?.trim() || null },
    create: { hotelId: req.hotelId, number: number.trim(), guestName: guestName?.trim() || null },
  });
  res.json({ room });
});

router.patch("/rooms/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.room, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Room not found." });
  }
  const { number, guestName } = req.body;
  const room = await prisma.room.update({
    where: { id: req.params.id },
    data: {
      number: number !== undefined ? number.trim() : undefined,
      guestName: guestName !== undefined ? guestName?.trim() || null : undefined,
    },
  });
  res.json({ room });
});

router.delete("/rooms/:id", async (req, res) => {
  if (!(await assertOwnedByHotel(prisma.room, req.params.id, req.hotelId))) {
    return res.status(404).json({ error: "Room not found." });
  }
  await prisma.room.delete({ where: { id: req.params.id } });
  res.json({ success: true });
});

router.get("/token-usage", async (req, res) => {
  try {
    const hotelId = req.hotelId;

    const totals = await prisma.tokenUsage.aggregate({
      where: { hotelId },
      _sum: { promptTokens: true, completionTokens: true, totalTokens: true },
      _count: { _all: true },
    });

    // A "conversation" is COALESCE(callId, sessionId): for voice, callId is a fresh id
    // per WebSocket connection (one call), so two separate calls from the same guest
    // count as two conversations, not one. For chat, callId is null and sessionId (the
    // guest's whole visit) is the right grouping since there's no separate call boundary.
    // Also carries each conversation's token rate: tokens / its active span in minutes,
    // floored at 1 minute so a single-turn conversation doesn't produce an inflated rate.
    const conversationStats = await prisma.$queryRaw`
      SELECT
        COALESCE("callId", "sessionId") AS conv_key,
        source,
        SUM("totalTokens")::int AS tokens,
        COUNT(*)::int AS calls,
        GREATEST(EXTRACT(EPOCH FROM (MAX("createdAt") - MIN("createdAt"))) / 60.0, 1) AS minutes
      FROM "TokenUsage"
      WHERE "hotelId" = ${hotelId}
      GROUP BY conv_key, source
    `;

    const avgTokensPerMinute = (rows) => {
      if (rows.length === 0) return 0;
      const rates = rows.map((r) => r.tokens / Number(r.minutes));
      return Math.round(rates.reduce((a, b) => a + b, 0) / rates.length);
    };

    const totalConversations = conversationStats.length;

    const bySourceMap = new Map();
    for (const row of conversationStats) {
      if (!bySourceMap.has(row.source)) bySourceMap.set(row.source, []);
      bySourceMap.get(row.source).push(row);
    }
    const bySource = Array.from(bySourceMap.entries()).map(([source, rows]) => {
      const tokens = rows.reduce((sum, r) => sum + r.tokens, 0);
      const calls = rows.reduce((sum, r) => sum + r.calls, 0);
      const conversations = rows.length;
      return {
        source,
        calls,
        conversations,
        totalTokens: tokens,
        avgTokensPerConversation: conversations ? Math.round(tokens / conversations) : 0,
        avgTokensPerMinute: avgTokensPerMinute(rows),
      };
    });

    const daily = await prisma.$queryRaw`
      SELECT
        date_trunc('day', "createdAt") AS day,
        SUM("totalTokens")::int AS tokens,
        COUNT(DISTINCT COALESCE("callId", "sessionId"))::int AS conversations
      FROM "TokenUsage"
      WHERE "hotelId" = ${hotelId} AND "createdAt" >= NOW() - INTERVAL '14 days'
      GROUP BY day
      ORDER BY day ASC
    `;

    const totalTokens = totals._sum.totalTokens || 0;

    res.json({
      summary: {
        totalConversations,
        totalCalls: totals._count._all,
        totalTokens,
        totalPromptTokens: totals._sum.promptTokens || 0,
        totalCompletionTokens: totals._sum.completionTokens || 0,
        avgTokensPerConversation: totalConversations ? Math.round(totalTokens / totalConversations) : 0,
        avgTokensPerMinute: avgTokensPerMinute(conversationStats),
      },
      bySource,
      daily: daily.map((row) => ({
        day: row.day,
        tokens: row.tokens,
        conversations: row.conversations,
        avgTokensPerConversation: row.conversations ? Math.round(row.tokens / row.conversations) : 0,
      })),
    });
  } catch (err) {
    console.error("Token usage error:", err);
    res.status(500).json({ error: "Failed to load token usage stats." });
  }
});

export default router;
