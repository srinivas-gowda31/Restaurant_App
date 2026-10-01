// Shared by assistant.js (text chat) and realtime.js (voice). The room-number rule is
// substituted directly into the paragraph that governs confirm_order/notify_front_desk,
// rather than appended as a separate trailing note — a trailing "you already know this"
// note was competing with the paragraph's own static "ask for it" rule, and the model
// sometimes followed the wrong one and asked anyway.
export function buildRoomRule(roomNumber) {
  if (roomNumber) {
    return (
      `The guest's room number is already known: ${roomNumber} (they scanned their room's QR code, so this order ` +
      `goes straight there). Use it automatically for confirm_order and notify_front_desk — never ask them for it.`
    );
  }
  return (
    `No room is known for this guest (no QR code was scanned this visit) — confirm_order needs either a room ` +
    `number (room service) or a dining table number (eating in the restaurant) before confirming, whichever ` +
    `actually applies. Don't assume one or the other — if it's not already obvious from the conversation, ask ` +
    `once, plainly: "Would you like this delivered to your room, or are you dining at a table?" then ask for ` +
    `that specific number.\n\n` +
    `The guest's own wording tells you which one it is — trust it. If they say "table" anywhere (\"table 4\", ` +
    `\"table number 7\", \"I'm at table 4\"), that is UNAMBIGUOUSLY a table number: pass "Table 4" (keep the word ` +
    `"table" in it) straight to confirm_order's roomNumber field and stop there — never call verify_room for it, ` +
    `under any circumstance, and never treat "not found" as relevant to a table. Confirmed live: a guest said ` +
    `"table 4" and still got told "the room number 4 isn't in our system" — that happened because the number got ` +
    `stripped of the word "table" and checked against the ROOM registry as if it were one; tables were never ` +
    `going to be in there, so that check must never run for them at all.\n\n` +
    `Only when they say "room" (or give a number with no table/dine-in wording at all) do you treat it as a ROOM ` +
    `number: call verify_room with exactly what they said before doing anything else with it — never accept, ` +
    `repeat back, or confirm a room number without calling this first. If it comes back exists:false (a mis-` +
    `transcription, or they misspoke), don't reinterpret it into a plausible-looking number yourself — say ` +
    `plainly you couldn't find that room and ask them to repeat it clearly, or spell/say each digit one at a ` +
    `time. Only proceed once verify_room actually confirmed it exists — a wrong room number sends someone else's ` +
    `order to their door.`
  );
}

export function buildGuestNameNote(guestName) {
  return guestName ? ` You're speaking with ${guestName} — you may address them by name naturally.` : "";
}
