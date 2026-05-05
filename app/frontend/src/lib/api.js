import { supabase } from "./supabase";

const API_URL =
  process.env.REACT_APP_BACKEND_URL || "http://127.0.0.1:8000";

async function getAccessToken() {
  const { data, error } = await supabase.auth.getSession();

  if (error) {
    throw error;
  }

  return data.session?.access_token || null;
}

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();

  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };

  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }

  const response = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = response.headers.get("content-type");
  const isJson = contentType && contentType.includes("application/json");

  const data = isJson ? await response.json() : await response.text();

  if (!response.ok) {
    const message =
      typeof data === "string"
        ? data
        : data?.detail || data?.message || `API error ${response.status}`;

    throw new Error(message);
  }

  return data;
}

export async function getHealth() {
  return apiFetch("/api/health");
}

export async function getDbHealth() {
  return apiFetch("/api/db-health");
}

export async function getMe() {
  return apiFetch("/api/auth/me");
}

export async function postJson(path, body) {
  return apiFetch(path, {
    method: "POST",
    body: JSON.stringify(body),
  });
}

export async function putJson(path, body) {
  return apiFetch(path, {
    method: "PUT",
    body: JSON.stringify(body),
  });
}

export async function deleteRequest(path) {
  return apiFetch(path, {
    method: "DELETE",
  });
}