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

// Public lookup so a scanned room QR code can confirm the current guest name even if
// the code was printed a while ago and the room has since been reassigned.
router.get("/rooms/:number", async (req, res) => {
  const room = await prisma.room.findFirst({
    where: { hotelId: DEFAULT_HOTEL_ID, number: req.params.number },
  });
  if (!room) return res.status(404).json({ error: "Room not found." });
  res.json({ room: { number: room.number, guestName: room.guestName } });
});

export default router;
