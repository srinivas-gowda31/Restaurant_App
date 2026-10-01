import { getAdminKey, clearAdminKey } from "./adminAuth.js";

const BASE_URL = "/api";

async function handleResponse(res) {
  if (!res.ok) {
    // A stale/wrong key: drop it so the admin UI re-prompts instead of retrying forever.
    if (res.status === 401) clearAdminKey();
    let message = `Request failed with status ${res.status}`;
    try {
      const body = await res.json();
      if (body.error) message = body.error;
    } catch {
      // ignore parse errors
    }
    throw new Error(message);
  }
  return res.json();
}

// Every /api/admin/* route requires this header (checked server-side) — centralized here
// so no admin call can accidentally be sent without it.
function adminFetch(path, options = {}) {
  const headers = { ...(options.headers || {}), "X-Admin-Key": getAdminKey() };
  return fetch(`${BASE_URL}${path}`, { ...options, headers }).then(handleResponse);
}

function adminJson(path, method, data) {
  return adminFetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export async function sendChatMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  return handleResponse(res);
}

// Backs the order panel's direct controls (Add button, +/- steppers, remove) — these go
// through the same server-side cart tools.js the chatbot uses, instead of only touching local
// display state (which used to mean an item added this way never actually got ordered).
function cartFetch(path, data) {
  return fetch(`${BASE_URL}/cart${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  }).then(handleResponse);
}

export function addToCart(sessionId, name, quantity) {
  return cartFetch("/add", { sessionId, name, quantity });
}

export function removeFromCart(sessionId, name) {
  return cartFetch("/remove", { sessionId, name });
}

export function setCartItemQuantity(sessionId, name, quantity) {
  return cartFetch("/quantity", { sessionId, name, quantity });
}

// Confirms the order directly against the server's actual cart — deliberately NOT a chat message
// describing the cart in free text (see GuestPage.jsx's handleConfirmOrder for the duplicate-order
// bug that caused).
export function confirmOrder(sessionId, guestName, roomNumber) {
  return cartFetch("/confirm", { sessionId, guestName, roomNumber });
}

export async function fetchMenu() {
  const res = await fetch(`${BASE_URL}/menu`);
  return handleResponse(res);
}

export async function fetchSpa() {
  const res = await fetch(`${BASE_URL}/spa`);
  return handleResponse(res);
}

export async function fetchOrder(orderId) {
  const res = await fetch(`${BASE_URL}/orders/${orderId}`);
  return handleResponse(res);
}

// These two calls set up the guest's identity for the whole visit, so a transient failure
// (in dev: a --watch restart mid-request — several edits in quick succession can cycle the
// backend through multiple restarts back to back; in prod: a network blip) shouldn't
// silently leave the guest un-greeted for the rest of the session. 3 retries with backoff
// gives real headroom for a multi-restart burst, not just a single one.
async function withRetry(fn, { retries = 3, delayMs = 800 } = {}) {
  try {
    return await fn();
  } catch (err) {
    if (retries <= 0) throw err;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
    return withRetry(fn, { retries: retries - 1, delayMs: delayMs * 1.5 });
  }
}

// hotel (a slug) matters here specifically — room numbers are only unique WITHIN a hotel, not
// globally, so without it "Room 204" could resolve to a different hotel's room entirely.
export async function fetchRoomByNumber(number, hotel) {
  return withRetry(async () => {
    const params = hotel ? `?hotel=${encodeURIComponent(hotel)}` : "";
    const res = await fetch(`${BASE_URL}/rooms/${encodeURIComponent(number)}${params}`);
    return handleResponse(res);
  });
}

export async function registerGuestSession(sessionId, roomNumber, guestName, hotel) {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}/session/guest-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, roomNumber, guestName, hotel }),
    });
    return handleResponse(res);
  });
}

// Public, read-only — lets the guest page show the right hotel's own name/branding instead of a
// hardcoded one, for a multi-hotel deployment.
export async function fetchHotelInfo(hotel) {
  const params = hotel ? `?hotel=${encodeURIComponent(hotel)}` : "";
  const res = await fetch(`${BASE_URL}/session/hotel-info${params}`);
  return handleResponse(res);
}

// Re-hydrates the on-screen transcript from what's already durably logged server-side, so a
// page reload/remount doesn't leave the guest staring at a blank chat after a real conversation
// already happened — the messages themselves were already being saved, this just reads them back.
export async function getSessionMessages(sessionId) {
  const res = await fetch(`${BASE_URL}/session/${encodeURIComponent(sessionId)}/messages`);
  return handleResponse(res);
}

// Checks a candidate admin key against the server without needing any other endpoint to
// already be loaded — used by the admin login gate.
export async function verifyAdminKey(key) {
  const res = await fetch(`${BASE_URL}/admin/orders`, { headers: { "X-Admin-Key": key } });
  return res.ok;
}

export async function uploadMenuFile(file, type) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  return adminFetch("/admin/upload", { method: "POST", body: formData });
}

export async function uploadExcelFile(file, type) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);
  return adminFetch("/admin/upload-excel", { method: "POST", body: formData });
}

export async function fetchUploads() {
  return adminFetch("/admin/uploads");
}

export async function approveUpload(uploadId, items) {
  return adminJson(`/admin/uploads/${uploadId}/approve`, "POST", { items });
}

export async function rejectUpload(uploadId) {
  return adminFetch(`/admin/uploads/${uploadId}/reject`, { method: "POST" });
}

export async function fetchAdminOrders() {
  return adminFetch("/admin/orders");
}

export async function fetchAdminMenuItems() {
  return adminFetch("/admin/menu-items");
}

export async function createMenuItem(data) {
  return adminJson("/admin/menu-items", "POST", data);
}

export async function updateMenuItem(id, data) {
  return adminJson(`/admin/menu-items/${id}`, "PATCH", data);
}

export async function fetchAdminSpaServices() {
  return adminFetch("/admin/spa-services");
}

export async function createSpaService(data) {
  return adminJson("/admin/spa-services", "POST", data);
}

export async function updateSpaService(id, data) {
  return adminJson(`/admin/spa-services/${id}`, "PATCH", data);
}

export async function fetchAdminHousekeepingItems() {
  return adminFetch("/admin/housekeeping-items");
}

export async function createHousekeepingItem(data) {
  return adminJson("/admin/housekeeping-items", "POST", data);
}

export async function updateHousekeepingItem(id, data) {
  return adminJson(`/admin/housekeeping-items/${id}`, "PATCH", data);
}

export async function fetchAdminLibraryItems() {
  return adminFetch("/admin/library-items");
}

export async function createLibraryItem(data) {
  return adminJson("/admin/library-items", "POST", data);
}

export async function updateLibraryItem(id, data) {
  return adminJson(`/admin/library-items/${id}`, "PATCH", data);
}

export async function fetchFulfillment(department) {
  return adminFetch(`/admin/fulfillment/${department}`);
}

export async function updateFulfillmentStatus(department, id, status) {
  return adminJson(`/admin/fulfillment/${department}/${id}`, "PATCH", { status });
}

export async function fetchFrontDeskAlerts() {
  return adminFetch("/admin/front-desk-alerts");
}

export async function updateFrontDeskAlertStatus(id, status) {
  return adminJson(`/admin/front-desk-alerts/${id}`, "PATCH", { status });
}

export async function fetchConciergeRequests() {
  return adminFetch("/admin/concierge-requests");
}

export async function updateConciergeRequestStatus(id, status) {
  return adminJson(`/admin/concierge-requests/${id}`, "PATCH", { status });
}

// Identifies which hotel this admin key belongs to — used to embed the right ?hotel= slug into
// this hotel's own room QR codes, so a multi-hotel deployment never mixes one hotel's QR codes
// up with another's.
export async function fetchAdminHotel() {
  return adminFetch("/admin/hotel");
}

export async function fetchTokenUsage() {
  return adminFetch("/admin/token-usage");
}

export async function fetchAdminRooms() {
  return adminFetch("/admin/rooms");
}

export async function createRoom(data) {
  return adminJson("/admin/rooms", "POST", data);
}

export async function updateRoom(id, data) {
  return adminJson(`/admin/rooms/${id}`, "PATCH", data);
}

export async function deleteRoom(id) {
  return adminFetch(`/admin/rooms/${id}`, { method: "DELETE" });
}
