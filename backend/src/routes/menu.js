import { Router } from "express";
import { prisma, DEFAULT_HOTEL_ID } from "../db.js";

const router = Router();

router.get("/menu", async (req, res) => {
  const items = await prisma.menuItem.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.get("/spa", async (req, res) => {
  const services = await prisma.spaService.findMany({
    where: { hotelId: DEFAULT_HOTEL_ID, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ services });
});

export default router;
