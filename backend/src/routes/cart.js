import { Router } from "express";
import { executeTool, setCartQuantity } from "../tools.js";
import { getOrCreateSession } from "../db.js";

// Backs the order panel's direct controls (the "Add" button on a search result, the +/-
// steppers, the remove ✕) — these used to only update the frontend's own local cart state
// with no server call at all, meaning an item added this way never actually reached the
// server-side cart confirm_order uses. A guest clicking "Add" instead of asking the chatbot
// would see it in their cart panel but it would silently never be ordered. Routes through the
// exact same tools.js logic the chatbot's add_to_order/remove_from_order already use.
const router = Router();

router.post("/add", async (req, res) => {
  const { sessionId, name, quantity } = req.body;
  if (!sessionId || !name) return res.status(400).json({ error: "sessionId and name are required." });
  // hotelId matters here specifically — without it, resolveItem (inside add_to_order) fell back
  // to the single default hotel's catalog regardless of which hotel this guest's session
  // actually belongs to, a real cross-tenant bug once more than one hotel shares this database.
  const session = await getOrCreateSession(sessionId);
  const result = await executeTool("add_to_order", { name, quantity }, { sessionId, hotelId: session.hotelId });
  res.json(result);
});

router.post("/remove", async (req, res) => {
  const { sessionId, name } = req.body;
  if (!sessionId || !name) return res.status(400).json({ error: "sessionId and name are required." });
  const result = await executeTool("remove_from_order", { name }, { sessionId });
  res.json(result);
});

router.post("/quantity", async (req, res) => {
  const { sessionId, name, quantity } = req.body;
  if (!sessionId || !name || quantity === undefined) {
    return res.status(400).json({ error: "sessionId, name, and quantity are required." });
  }
  const result = await setCartQuantity({ name, quantity: Number(quantity) }, sessionId);
  res.json(result);
});

// Backs the order panel's "Confirm Order" button. This USED to work by sending a free-text chat
// message describing the cart ("Please confirm my order: 1x Dal Makhani, ...") built from the
// frontend's own local cart state and letting the LLM interpret it — confirmed live: after a
// voice call had already confirmed an order and ended, a UI sync gap left the panel showing the
// already-ordered items, the guest clicked Confirm again thinking it hadn't worked, and the LLM
// read that free-text item list as a NEW order request and placed a real duplicate. Confirming
// directly against the server's actual cart (never re-described from possibly-stale local state,
// never passed through an LLM that could reinterpret it) makes that whole failure mode
// impossible — confirm_order's own "cart is already empty" check is what actually protects a
// guest who clicks this after their order already went through some other way.
router.post("/confirm", async (req, res) => {
  const { sessionId, guestName, roomNumber } = req.body;
  if (!sessionId) return res.status(400).json({ error: "sessionId is required." });
  const result = await executeTool("confirm_order", { guestName, roomNumber }, { sessionId });
  res.json(result);
});

export default router;
