// Thin API client for Career Copilot backend.
// Auth tokens come from Supabase Auth (managed by lib/supabase.js).

import { API_TIMEOUT_MS, BACKEND_URL } from "../shared/config/env";
import { supabase } from "./supabase";

if (!BACKEND_URL) {
  // eslint-disable-next-line no-console
  console.warn("Missing REACT_APP_BACKEND_URL — frontend cannot reach the API.");
}

if (!Number.isFinite(API_TIMEOUT_MS) || API_TIMEOUT_MS <= 0) {
  // eslint-disable-next-line no-console
  console.warn("Invalid REACT_APP_API_TIMEOUT_MS; default timeout fallback is active.");
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

export function getApiErrorDetail(error) {
  return error?.detail ?? error?.data?.detail ?? error?.data?.message ?? error?.message;
}

export function getApiErrorMessage(error) {
  const detail = getApiErrorDetail(error);
  if (detail && typeof detail === "object" && typeof detail.message === "string") return detail.message;
  return formatApiErrorDetail(detail);
}

export function getApiErrorFieldList(error, key) {
  const detail = getApiErrorDetail(error);
  const value =
    error?.[key] ??
    (detail && typeof detail === "object" ? detail[key] : undefined) ??
    error?.data?.[key];
  return Array.isArray(value) ? value : [];
}

export function getApiBlockingIssues(error) {
  return getApiErrorFieldList(error, "blocking_issues");
}

export function getApiUnverifiedFields(error) {
  return getApiErrorFieldList(error, "unverified_fields");
}

export function getApiExistingRecruitmentId(error) {
  const detail = getApiErrorDetail(error);
  return error?.existing_recruitment_id ??
    (detail && typeof detail === "object" ? detail.existing_recruitment_id : undefined) ??
    error?.data?.existing_recruitment_id;
}

export function getApiNextActions(error) {
  return getApiErrorFieldList(error, "next_actions");
}

function buildApiError({ status, data, detail, message }) {
  return {
    status,
    message,
    detail,
    data,
    blocking_issues: getApiErrorFieldList({ data, detail }, "blocking_issues"),
    unverified_fields: getApiErrorFieldList({ data, detail }, "unverified_fields"),
    warnings: getApiErrorFieldList({ data, detail }, "warnings"),
    code: (detail && typeof detail === "object" ? detail.code : undefined) || data?.code,
    existing_recruitment_id: getApiExistingRecruitmentId({ data, detail }),
    next_actions: getApiNextActions({ data, detail }),
  };
}

function resolveHeaders(options = {}) {
  const headers = { ...(options.headers || {}) };
  const hasContentType = Object.keys(headers).some((key) => key.toLowerCase() === "content-type");
  const body = options.body;
  const shouldSetJsonContentType =
    body != null && typeof body === "string" && !hasContentType;

  if (shouldSetJsonContentType) {
    headers["Content-Type"] = "application/json";
  }

  return headers;
}

export async function apiFetch(path, options = {}) {
  if (!BACKEND_URL) {
    throw new Error("Missing REACT_APP_BACKEND_URL. Set it in frontend .env before running the app.");
  }

  const token = await getAccessToken();
  const controller = new AbortController();
  const timeoutMs = Number.isFinite(API_TIMEOUT_MS) && API_TIMEOUT_MS > 0 ? API_TIMEOUT_MS : 15000;
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs);
  const signal = options.signal || controller.signal;
  const headers = resolveHeaders(options);
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${BACKEND_URL}${path}`, {
      ...options,
      signal,
      headers,
    });
  } catch (error) {
    clearTimeout(timeoutId);
    if (error?.name === "AbortError") {
      throw buildApiError({ status: 408, data: null, detail: "Request timed out", message: "Request timed out" });
    }
    throw buildApiError({ status: 0, data: null, detail: error?.message || "Network error", message: "Network error" });
  }

  clearTimeout(timeoutId);
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();

  if (!res.ok) {
    const detail = typeof data === "object" ? data?.detail || data?.message : data;
    const message = getApiErrorMessage({ data, detail }) || `API ${res.status}`;
    throw buildApiError({ status: res.status, data, detail, message });
  }

  return data;
}

export const api = {
  get: (p, options = {}) => apiFetch(p, options),
  post: (p, body, options = {}) => apiFetch(p, { ...options, method: "POST", body: JSON.stringify(body || {}) }),
  put: (p, body, options = {}) => apiFetch(p, { ...options, method: "PUT", body: JSON.stringify(body || {}) }),
  patch: (p, body, options = {}) => apiFetch(p, { ...options, method: "PATCH", body: JSON.stringify(body || {}) }),
  delete: (p, options = {}) => apiFetch(p, { ...options, method: "DELETE" }),
  del: (p, options = {}) => apiFetch(p, { ...options, method: "DELETE" }),
};

export const auth = {
  me: () => api.get("/api/auth/me"),
};
