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

export async function fetchRoomByNumber(number) {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}/rooms/${encodeURIComponent(number)}`);
    return handleResponse(res);
  });
}

export async function registerGuestSession(sessionId, roomNumber, guestName) {
  return withRetry(async () => {
    const res = await fetch(`${BASE_URL}/session/guest-info`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sessionId, roomNumber, guestName }),
    });
    return handleResponse(res);
  });
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
