import { generateWithTools } from "./gemini.js";
import { toolDeclarations, executeTool } from "./tools.js";
import { getRecentMessages, logMessage } from "./db.js";

const SYSTEM_INSTRUCTION = `You are a warm, professional hotel concierge assistant for The Baikal Sphere Hotel.
You help guests browse the food/beverage menu and spa services, build an order, and confirm it.
Use the provided tools to search the menu/spa catalog and to add/remove items from the order.
When a guest asks to see options (e.g. "show me non-veg", "what desserts do you have", "list your spa services"),
call search_menu or search_spa. The full results are automatically shown to the guest as a table alongside your
reply, so you do NOT need to recite every item and price in your text — just give a brief, friendly one- or
two-sentence intro (e.g. "Here are all our non-vegetarian options — take a look and let me know what you'd like.").
Only call confirm_order when the guest has clearly and explicitly confirmed they want to place the order.
Keep responses short, friendly, and voice-friendly (avoid markdown or bullet symbols when speaking aloud).
Always mention prices in Indian Rupees (INR) using the symbol ₹ when you do reference a specific price.`;

const MAX_TOOL_ROUNDS = 5;

function historyToContents(history) {
  return history.map((m) => ({
    role: m.role === "assistant" ? "model" : "user",
    parts: [{ text: m.content }],
  }));
}

export async function runAssistantTurn({ sessionId, userMessage }) {
  await logMessage(sessionId, "user", userMessage);

  const history = await getRecentMessages(sessionId, 20);
  const contents = historyToContents(history);

  const uiHints = { cartActions: [], orderId: null, itemsTable: null };
  let rounds = 0;
  let response = await generateWithTools({
    systemInstruction: SYSTEM_INSTRUCTION,
    contents,
    tools: toolDeclarations,
  });

  while (rounds < MAX_TOOL_ROUNDS) {
    const parts = response.candidates?.[0]?.content?.parts || [];
    const functionCalls = parts.filter((p) => p.functionCall).map((p) => p.functionCall);

    if (functionCalls.length === 0) break;

    contents.push({ role: "model", parts });

    const functionResponseParts = [];
    for (const call of functionCalls) {
      const result = await executeTool(call.name, call.args || {}, { sessionId });
      if (result.cartAction) uiHints.cartActions.push(result.cartAction);
      if (result.orderId) uiHints.orderId = result.orderId;
      if (call.name === "search_menu" && result.items) {
        uiHints.itemsTable = { type: "menu", items: result.items };
      }
      if (call.name === "search_spa" && result.services) {
        uiHints.itemsTable = { type: "spa", items: result.services };
      }
      functionResponseParts.push({
        functionResponse: { name: call.name, response: result },
      });
    }

    contents.push({ role: "user", parts: functionResponseParts });

    response = await generateWithTools({
      systemInstruction: SYSTEM_INSTRUCTION,
      contents,
      tools: toolDeclarations,
    });
    rounds += 1;
  }

  const reply = (response.text || "").trim() || "I'm sorry, could you repeat that?";
  await logMessage(sessionId, "assistant", reply);

  return { reply, uiHints };
}
