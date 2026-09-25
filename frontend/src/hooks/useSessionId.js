const STORAGE_KEY = "hotel_assistant_session_id";

export function getSessionId() {
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}

// Drops the current session id so the next getSessionId() call mints a fresh one — used
// when a QR scan identifies a (possibly different) guest, so their chat/order/session
// history doesn't inherit whatever the previous guest on this device was doing.
export function resetSessionId() {
  localStorage.removeItem(STORAGE_KEY);
}
