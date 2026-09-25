// sessionStorage (not localStorage) so the admin key doesn't linger indefinitely on a
// shared/staff device — it's cleared when the browser tab/window closes.
const ADMIN_KEY_STORAGE = "hotel_assistant_admin_key";

export function getAdminKey() {
  return sessionStorage.getItem(ADMIN_KEY_STORAGE) || "";
}

export function setAdminKey(key) {
  if (key) sessionStorage.setItem(ADMIN_KEY_STORAGE, key);
}

export function clearAdminKey() {
  sessionStorage.removeItem(ADMIN_KEY_STORAGE);
}
