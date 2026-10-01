import { Router } from "express";
import { prisma, getHotelBySlug } from "../db.js";

const router = Router();

router.get("/menu", async (req, res) => {
  const hotel = await getHotelBySlug(req.query.hotel);
  const items = await prisma.menuItem.findMany({
    where: { hotelId: hotel?.id, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ items });
});

router.get("/spa", async (req, res) => {
  const hotel = await getHotelBySlug(req.query.hotel);
  const services = await prisma.spaService.findMany({
    where: { hotelId: hotel?.id, isActive: true },
    orderBy: [{ category: "asc" }, { name: "asc" }],
  });
  res.json({ services });
});

// Public lookup so a scanned room QR code can confirm the current guest name even if the code
// was printed a while ago and the room has since been reassigned. hotel (a slug, from the same
// QR code's ?hotel= param) matters here specifically — room numbers are only unique WITHIN a
// hotel, not globally, so without it "Room 204" at one hotel could return another hotel's
// "Room 204" guest name instead.
router.get("/rooms/:number", async (req, res) => {
  const hotel = await getHotelBySlug(req.query.hotel);
  if (!hotel) return res.status(404).json({ error: "Hotel not found." });
  const room = await prisma.room.findFirst({
    where: { hotelId: hotel.id, number: req.params.number },
  });
  if (!room) return res.status(404).json({ error: "Room not found." });
  res.json({ room: { number: room.number, guestName: room.guestName } });
});

export default router;
