import crypto from "crypto";
import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

// Deliberately separate from admin.js's per-hotel auth — creating a NEW hotel can't require an
// existing hotel's admin key (which hotel's key would even apply?). Gated by its own key instead,
// held by whoever operates this platform across all its hotels, not any single hotel's staff.
const SUPER_ADMIN_KEY = process.env.SUPER_ADMIN_KEY;
if (!SUPER_ADMIN_KEY) {
  console.warn(
    "SUPER_ADMIN_KEY is not set — every /api/super-admin request will be rejected until it's configured in .env."
  );
}

router.use((req, res, next) => {
  const provided = req.get("X-Super-Admin-Key");
  if (!SUPER_ADMIN_KEY || !provided || provided !== SUPER_ADMIN_KEY) {
    return res.status(401).json({ error: "Missing or invalid super-admin key." });
  }
  next();
});

function slugify(name) {
  return name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

// Onboards a brand-new hotel onto this same shared database, isolated from every other hotel
// by hotelId from this moment on (every table already has it — see the multi-hotel migration).
// Generates both the guest-facing slug (?hotel=<slug> in QR codes/session URLs) and a fresh,
// unique admin key for that hotel's own staff to log into their admin panel with — never
// reusing or deriving from any other hotel's key.
router.post("/hotels", async (req, res) => {
  const { name, slug } = req.body;
  if (!name || !name.trim()) {
    return res.status(400).json({ error: "Hotel name is required." });
  }

  const resolvedSlug = slug?.trim() ? slugify(slug) : slugify(name);
  if (!resolvedSlug) {
    return res.status(400).json({ error: "Could not derive a valid slug from that name — provide one explicitly." });
  }

  const existing = await prisma.hotel.findUnique({ where: { slug: resolvedSlug } });
  if (existing) {
    return res.status(409).json({ error: `Slug "${resolvedSlug}" is already taken by another hotel.` });
  }

  const adminApiKey = crypto.randomBytes(24).toString("base64url");

  const hotel = await prisma.hotel.create({
    data: { name: name.trim(), slug: resolvedSlug, adminApiKey },
  });

  res.status(201).json({
    hotel: { id: hotel.id, name: hotel.name, slug: hotel.slug },
    // Only ever returned here, once, at creation — same as any API key. Give this to the new
    // hotel's own staff for their admin panel login; the guest-facing slug above is what goes
    // into their QR codes/session URLs instead.
    adminApiKey,
  });
});

router.get("/hotels", async (req, res) => {
  const hotels = await prisma.hotel.findMany({
    select: { id: true, name: true, slug: true, createdAt: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({ hotels });
});

export default router;
