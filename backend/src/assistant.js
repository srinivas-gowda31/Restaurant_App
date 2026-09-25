import { generateWithTools, CHAT_MODEL } from "./gemini.js";
import { toolDeclarations, executeTool, buildItemsTable, trimResultForModel } from "./tools.js";
import { getRecentMessages, logMessage, logTokenUsage, getSession } from "./db.js";
import { buildRoomRule, buildGuestNameNote } from "./guestContext.js";

function buildSystemInstruction({ guestName, roomNumber }) {
  return `Warm, calm, professional concierge for The Baikal Sphere Hotel. One question at a time, wait for the
answer. Never invent items/prices — only state what search_menu/search_spa/search_housekeeping/search_library
returned; search first if unsure.${buildGuestNameNote(guestName)}

Browse/order food, spa, housekeeping, library via search_menu/search_spa/search_housekeeping/search_library and
add_to_order/remove_from_order. Department routing is automatic, don't mention it. Search results show as a table
automatically — just give a brief one-sentence intro, not a recitation of items/prices.

Cart is tracked server-side — add_to_order/remove_from_order/get_cart each return the current cart+total. Quote
that total verbatim; never compute or recall it yourself (call get_cart if unsure).

On "confirm"/"that's everything"/"place the order": read back the cart (items, qty, prices, latest total) and ask
"Shall I go ahead and place this?" — call confirm_order only after they affirm. Empty cart: ask what they'd like.
${buildRoomRule(roomNumber)}

After adding a food item: call search_menu to look for a suitable pairing (bread/rice/side/drink) before saying
anything — only ever name an item that's actually in those results, using its exact listed name, never one from
general knowledge. If the item just ordered is vegetarian, the pairing must be vegetarian too — never suggest
non-veg alongside a veg order. If nothing suitable turns up, skip the suggestion entirely rather than naming
something not on the menu. ONE brief suggestion, light one-time nudge, never repeated.

Anything outside a catalog order (complaint, facility issue, manager request, safety concern): call
notify_front_desk with a clear summary instead of forcing it through search/order tools; reassure without promising a response time.

Match the guest's language (English or Hindi/Hinglish), switching if they switch. Short, voice-friendly replies
(no markdown/bullets). Prices in ₹ (INR).`;
}

const MAX_TOOL_ROUNDS = 5;

function historyToContents(history) {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

function addUsage(totals, response) {
  const usage = response.usageMetadata;
  if (!usage) return;
  totals.promptTokens += usage.promptTokenCount || 0;
  totals.completionTokens += usage.candidatesTokenCount || 0;
  totals.totalTokens += usage.totalTokenCount || 0;
}

const DEBUG_TIMING = process.env.DEBUG_TIMING === "true";
function mark(label, t0) {
  if (DEBUG_TIMING) console.log(`[timing] ${label}: ${Date.now() - t0}ms`);
  return Date.now();
}

export async function runAssistantTurn({ sessionId, userMessage, source = "chat" }) {
  const turnStart = Date.now();
  let t = turnStart;

  const [history, session] = await Promise.all([getRecentMessages(sessionId, 30), getSession(sessionId)]);
  t = mark("getRecentMessages", t);
  const contents = historyToContents(history);
  contents.push({ role: "user", parts: [{ text: userMessage }] });

  const systemInstruction = buildSystemInstruction({
    guestName: session?.guestName,
    roomNumber: session?.roomNumber,
  });

  // Persist the user's message in the background — the model already has it
  // in `contents`, so there's no need to block the round-trip on this write.
  const pendingWrites = [logMessage(sessionId, "user", userMessage)];

  const uiHints = { cartActions: [], orderId: null, itemsTable: null, escalation: null };
  const usageTotals = { promptTokens: 0, completionTokens: 0, totalTokens: 0 };
  let rounds = 0;
  let response = await generateWithTools({
    systemInstruction,
    contents,
    tools: toolDeclarations,
  });
  t = mark("gemini call #1", t);
  addUsage(usageTotals, response);

  while (rounds < MAX_TOOL_ROUNDS) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (functionCalls.length === 0) break;

    contents.push({ role: "model", parts });

    // Function calls within a single round are independent of each other, so run them
    // concurrently instead of one at a time.
    const results = await Promise.all(
      functionCalls.map((call) => executeTool(call.name, call.args || {}, { sessionId }))
    );
    t = mark(`tool execution round ${rounds + 1} (${functionCalls.map((c) => c.name).join(", ")})`, t);

    const functionResponseParts = functionCalls.map((call, i) => {
      const result = results[i];
      if (result.cartAction) uiHints.cartActions.push(result.cartAction);
      if (result.orderId) uiHints.orderId = result.orderId;
      if (result.escalation) uiHints.escalation = result.escalation;
      const table = buildItemsTable(call.name, result);
      if (table) uiHints.itemsTable = table;
      return { functionResponse: { name: call.name, response: trimResultForModel(call.name, result) } };
    });

    contents.push({ role: "user", parts: functionResponseParts });

    response = await generateWithTools({
      systemInstruction,
      contents,
      tools: toolDeclarations,
    });
    t = mark(`gemini call #${rounds + 2}`, t);
    addUsage(usageTotals, response);
    rounds += 1;
  }

  const reply = (response.text || "").trim() || "I'm sorry, could you repeat that?";
  if (DEBUG_TIMING) console.log(`[timing] TOTAL: ${Date.now() - turnStart}ms`);

  pendingWrites.push(logMessage(sessionId, "assistant", reply));
  pendingWrites.push(logTokenUsage({ sessionId, source, model: CHAT_MODEL, ...usageTotals }));
  // Don't make the guest wait on bookkeeping writes — let them finish in the background.
  Promise.all(pendingWrites).catch((err) => console.error("Failed to persist chat turn:", err));

  return { reply, uiHints };
}
