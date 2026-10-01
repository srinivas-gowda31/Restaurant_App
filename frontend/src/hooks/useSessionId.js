// Used to persist in localStorage, which survives indefinitely across browser reloads/tab
// closures on the same device — meaning a guest (or a demo tester) who closed the tab and
// came back later, even much later, silently resumed the SAME old session: same cart, same
// conversation history seeded back into the model, same "welcome back" resume logic. That's
// exactly how unrelated conversations bled into each other (a manager's earlier test order
// showing up in a later, unrelated demo run). A plain module-level variable instead: every
// fresh page load gets a brand new id, no exceptions — while still staying THE SAME id for
// every component on THIS page load (GuestPage, useRealtimeVoice, every cart/confirm call),
// since they all call this same function within one JS execution context. That's what keeps
// the legitimate case working: a dropped call reconnecting via the SAME still-open tab still
// correctly resumes mid-conversation (see realtime.js's greeting resume logic) — only a
// genuinely new page load starts a genuinely new conversation.
let cachedSessionId = null;

export function getSessionId() {
  if (!cachedSessionId) {
    cachedSessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
  }
  return cachedSessionId;
}

// Drops the current session id so the next getSessionId() call mints a fresh one — used
// when a QR scan identifies a (possibly different) guest, so their chat/order/session
// history doesn't inherit whatever the previous guest on this device was doing. Redundant
// with the page reload that always follows a scan (which already gets a fresh id on its
// own now), but kept explicit since it costs nothing and documents the intent at the call site.
export function resetSessionId() {
  cachedSessionId = null;
}
