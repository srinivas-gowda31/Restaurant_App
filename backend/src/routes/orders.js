import { Router } from "express";
import { prisma } from "../db.js";

const router = Router();

router.get("/:id", async (req, res) => {
  const order = await prisma.order.findUnique({
    where: { id: req.params.id },
    include: { items: true },
  });
  if (!order) return res.status(404).json({ error: "Order not found." });
  res.json({ order });
});

export default router;
