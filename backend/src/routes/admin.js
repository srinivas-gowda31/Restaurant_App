import { Router } from "express";
import multer from "multer";
import { prisma, DEFAULT_HOTEL_ID } from "../db.js";
import { extractItemsFromFile, describeGeminiError } from "../gemini.js";
import { parseSpreadsheet } from "../excelImport.js";

const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 20 * 1024 * 1024 } });
const router = Router();

router.post("/upload", upload.single("file"), async (req, res) => {
  try {
    const { type } = req.body;
    if (!req.file || !type || !["menu", "spa"].includes(type)) {
      return res.status(400).json({ error: "A file and a type ('menu' or 'spa') are required." });
    }

    const extraction = await extractItemsFromFile(req.file.buffer, req.file.mimetype, type);

    const uploadRecord = await prisma.upload.create({
      data: {
        hotelId: DEFAULT_HOTEL_ID,
        type,
        fileName: req.file.originalname,
        status: "pending_review",
        rawExtractionJson: JSON.stringify(extraction),
      },
    });

    res.json({ upload: uploadRecord, extraction });
  } catch (err) {
    console.error("Upload error:", err);
    const { httpStatus, message } = describeGeminiError(err);
    res.status(httpStatus).json({ error: message });
  }
});

router.post("/upload-excel", upload.single("file"), async (req, res) => {
  try {
    const { type } = req.body;
    if (!req.file || !type || !["menu", "spa"].includes(type)) {
      return res.status(400).json({ error: "A spreadsheet file and a type ('menu' or 'spa') are required." });
    }

    const items = await parseSpreadsheet(req.file.buffer, type);
    if (items.length === 0) {
      return res.status(400).json({
        error: "No valid rows found. Make sure the sheet has a header row with 'name' and 'price' columns.",
      });
    }

    const uploadRecord = await prisma.upload.create({
      data: {
        hotelId: DEFAULT_HOTEL_ID,
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
    where: { hotelId: DEFAULT_HOTEL_ID },
    orderBy: { createdAt: "desc" },
  });
  res.json({ uploads });
});

router.post("/uploads/:id/approve", async (req, res) => {
  try {
    const uploadRecord = await prisma.upload.findUnique({ where: { id: req.params.id } });
    if (!uploadRecord) return res.status(404).json({ error: "Upload not found." });
    if (uploadRecord.status === "approved") {
      return res.status(400).json({ error: "Upload already approved." });
    }

    const items = req.body.items || JSON.parse(uploadRecord.rawExtractionJson || "{}").items || [];

    if (uploadRecord.type === "menu") {
      await prisma.menuItem.createMany({
        data: items.map((i) => ({
          hotelId: DEFAULT_HOTEL_ID,
          name: i.name,
          category: i.category || "Other",
          vegetarian: !!i.vegetarian,
          price: Number(i.price) || 0,
          description: i.description || "",
        })),
      });
    } else {
      await prisma.spaService.createMany({
        data: items.map((i) => ({
          hotelId: DEFAULT_HOTEL_ID,
          name: i.name,
          category: i.category || "Other",
          durationMin: i.durationMin ? Number(i.durationMin) : null,
          price: Number(i.price) || 0,
          description: i.description || "",
        })),
      });
    }

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
  const uploadRecord = await prisma.upload.update({
    where: { id: req.params.id },
    data: { status: "rejected", reviewedAt: new Date() },
  });
  res.json({ upload: uploadRecord });
});

router.get("/orders", async (req, res) => {
  const orders = await prisma.order.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID },
    include: { items: true },
    orderBy: { createdAt: "desc" },
  });
  res.json({ orders });
});

router.get("/menu-items", async (req, res) => {
  const items = await prisma.menuItem.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.post("/menu-items", async (req, res) => {
  const { name, category, vegetarian, price, description } = req.body;
  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price are required." });
  }
  const item = await prisma.menuItem.create({
    data: {
      hotelId: DEFAULT_HOTEL_ID,
      name,
      category: category || "Other",
      vegetarian: !!vegetarian,
      price: Number(price) || 0,
      description: description || "",
    },
  });
  res.json({ item });
});

router.patch("/menu-items/:id", async (req, res) => {
  const { name, category, vegetarian, price, description, isActive } = req.body;
  const item = await prisma.menuItem.update({
    where: { id: req.params.id },
    data: { name, category, vegetarian, price, description, isActive },
  });
  res.json({ item });
});

router.get("/spa-services", async (req, res) => {
  const services = await prisma.spaService.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ services });
});

router.post("/spa-services", async (req, res) => {
  const { name, category, durationMin, price, description } = req.body;
  if (!name || price === undefined || price === null || price === "") {
    return res.status(400).json({ error: "Name and price are required." });
  }
  const service = await prisma.spaService.create({
    data: {
      hotelId: DEFAULT_HOTEL_ID,
      name,
      category: category || "Other",
      durationMin: durationMin ? Number(durationMin) : null,
      price: Number(price) || 0,
      description: description || "",
    },
  });
  res.json({ service });
});

router.patch("/spa-services/:id", async (req, res) => {
  const { name, category, durationMin, price, description, isActive } = req.body;
  const service = await prisma.spaService.update({
    where: { id: req.params.id },
    data: { name, category, durationMin, price, description, isActive },
  });
  res.json({ service });
});

export default router;
