// Thin API client for Career Copilot backend.
// Auth tokens come from Supabase Auth (managed by lib/supabase.js).

import { supabase } from "./supabase";

const API_URL = process.env.REACT_APP_BACKEND_URL;

if (!API_URL) {
  // eslint-disable-next-line no-console
  console.warn("Missing REACT_APP_BACKEND_URL — frontend cannot reach the API.");
}

async function getAccessToken() {
  try {
    const { data } = await supabase.auth.getSession();
    return data?.session?.access_token || null;
  } catch {
    return null;
  }
}

function formatApiErrorDetail(detail) {
  if (detail == null) return "Something went wrong. Please try again.";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail))
    return detail
      .map((e) => (e && typeof e.msg === "string" ? e.msg : JSON.stringify(e)))
      .filter(Boolean)
      .join(" ");
  if (detail && typeof detail.msg === "string") return detail.msg;
  return String(detail);
}

export async function apiFetch(path, options = {}) {
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    ...options,
    headers,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = typeof data === "object" ? data?.detail || data?.message : data;
    const err = new Error(formatApiErrorDetail(detail) || `API ${res.status}`);
    err.status = res.status;
    err.data = data;
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => apiFetch(p),
  post: (p, body) => apiFetch(p, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (p, body) => apiFetch(p, { method: "PUT", body: JSON.stringify(body || {}) }),
  del: (p) => apiFetch(p, { method: "DELETE" }),
};

// Backend exposes Supabase-validated /api/auth/me.
export const auth = {
  me: () => api.get("/api/auth/me"),
};
