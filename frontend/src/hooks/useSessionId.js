const STORAGE_KEY = "hotel_assistant_session_id";

export function getSessionId() {
  let sessionId = localStorage.getItem(STORAGE_KEY);
  if (!sessionId) {
    sessionId = `session_${Date.now()}_${Math.random().toString(36).slice(2, 10)}`;
    localStorage.setItem(STORAGE_KEY, sessionId);
  }
  return sessionId;
}
