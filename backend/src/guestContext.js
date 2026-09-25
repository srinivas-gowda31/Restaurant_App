// Shared by assistant.js (text chat) and realtime.js (voice). The room-number rule is
// substituted directly into the paragraph that governs confirm_order/notify_front_desk,
// rather than appended as a separate trailing note — a trailing "you already know this"
// note was competing with the paragraph's own static "ask for it" rule, and the model
// sometimes followed the wrong one and asked anyway.
export function buildRoomRule(roomNumber) {
  if (roomNumber) {
    return (
      `The guest's room number is already known: ${roomNumber}. Use it automatically for confirm_order and ` +
      `notify_front_desk — never ask them for it.`
    );
  }
  return (
    `confirm_order requires a room number — if you don't already have it from earlier in the conversation, ask ` +
    `for it before confirming (staff need it to deliver/route the order).`
  );
}

export function buildGuestNameNote(guestName) {
  return guestName ? ` You're speaking with ${guestName} — you may address them by name naturally.` : "";
}
