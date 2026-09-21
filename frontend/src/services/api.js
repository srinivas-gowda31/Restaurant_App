const BASE_URL = "/api";

async function handleResponse(res) {
  if (!res.ok) {
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

export async function sendChatMessage(sessionId, message) {
  const res = await fetch(`${BASE_URL}/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, message }),
  });
  return handleResponse(res);
}

export async function sendVoiceMessage(sessionId, audioBlob) {
  const formData = new FormData();
  formData.append("sessionId", sessionId);
  formData.append("audio", audioBlob, "recording.wav");

  const res = await fetch(`${BASE_URL}/voice`, {
    method: "POST",
    body: formData,
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

export async function uploadMenuFile(file, type) {
  const formData = new FormData();
  formData.append("file", file);
  formData.append("type", type);

  const res = await fetch(`${BASE_URL}/admin/upload`, {
    method: "POST",
    body: formData,
  });
  return handleResponse(res);
}

export async function fetchUploads() {
  const res = await fetch(`${BASE_URL}/admin/uploads`);
  return handleResponse(res);
}

export async function approveUpload(uploadId, items) {
  const res = await fetch(`${BASE_URL}/admin/uploads/${uploadId}/approve`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ items }),
  });
  return handleResponse(res);
}

export async function rejectUpload(uploadId) {
  const res = await fetch(`${BASE_URL}/admin/uploads/${uploadId}/reject`, {
    method: "POST",
  });
  return handleResponse(res);
}

export async function fetchAdminOrders() {
  const res = await fetch(`${BASE_URL}/admin/orders`);
  return handleResponse(res);
}

export async function fetchAdminMenuItems() {
  const res = await fetch(`${BASE_URL}/admin/menu-items`);
  return handleResponse(res);
}

export async function updateMenuItem(id, data) {
  const res = await fetch(`${BASE_URL}/admin/menu-items/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}

export async function fetchAdminSpaServices() {
  const res = await fetch(`${BASE_URL}/admin/spa-services`);
  return handleResponse(res);
}

export async function updateSpaService(id, data) {
  const res = await fetch(`${BASE_URL}/admin/spa-services/${id}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
  return handleResponse(res);
}
