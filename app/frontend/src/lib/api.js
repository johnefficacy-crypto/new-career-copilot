// Thin API client for Career Copilot backend (Phase 1).
// Stores JWT in localStorage and attaches Authorization: Bearer.

const API_URL = process.env.REACT_APP_BACKEND_URL || "http://localhost:8001";
const TOKEN_KEY = "cc.access_token";

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token) {
  if (token) localStorage.setItem(TOKEN_KEY, token);
  else localStorage.removeItem(TOKEN_KEY);
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
  const token = getToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
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

// Auth endpoints
export const auth = {
  register: (body) => api.post("/api/auth/register", body),
  login: (body) => api.post("/api/auth/login", body),
  logout: () => api.post("/api/auth/logout", {}),
  me: () => api.get("/api/auth/me"),
  refresh: () => api.post("/api/auth/refresh", {}),
  forgot: (email) => api.post("/api/auth/forgot-password", { email }),
  reset: (token, password) => api.post("/api/auth/reset-password", { token, password }),
};
