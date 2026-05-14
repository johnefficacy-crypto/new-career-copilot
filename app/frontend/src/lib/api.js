// Thin API client for Career Copilot backend.
// Auth tokens come from Supabase Auth (managed by lib/supabase.js).

import { BACKEND_URL } from "../shared/config/env";
import { supabase } from "./supabase";

if (!BACKEND_URL) {
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
  const value = error?.[key] ?? (detail && typeof detail === "object" ? detail[key] : undefined) ?? error?.data?.[key];
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
  return error?.existing_recruitment_id ?? (detail && typeof detail === "object" ? detail.existing_recruitment_id : undefined) ?? error?.data?.existing_recruitment_id;
}

export function getApiNextActions(error) {
  return getApiErrorFieldList(error, "next_actions");
}

function attachStructuredErrorFields(err, data, detail) {
  const detailObj = detail && typeof detail === "object" ? detail : {};
  const dataObj = data && typeof data === "object" ? data : {};
  err.data = data;
  err.detail = detail;
  err.blocking_issues = detailObj.blocking_issues || dataObj.blocking_issues || [];
  err.unverified_fields = detailObj.unverified_fields || dataObj.unverified_fields || [];
  err.warnings = detailObj.warnings || dataObj.warnings || [];
  err.code = detailObj.code || dataObj.code;
  err.existing_recruitment_id = detailObj.existing_recruitment_id || dataObj.existing_recruitment_id;
  err.next_actions = detailObj.next_actions || dataObj.next_actions || [];
  return err;
}

export async function apiFetch(path, options = {}) {
  if (!BACKEND_URL) {
    throw new Error("Missing REACT_APP_BACKEND_URL. Set it in frontend .env before running the app.");
  }
  const token = await getAccessToken();
  const headers = {
    "Content-Type": "application/json",
    ...(options.headers || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${BACKEND_URL}${path}`, {
    ...options,
    headers,
  });
  const ct = res.headers.get("content-type") || "";
  const data = ct.includes("application/json") ? await res.json() : await res.text();
  if (!res.ok) {
    const detail = typeof data === "object" ? data?.detail || data?.message : data;
    const err = new Error(formatApiErrorDetail(detail) || `API ${res.status}`);
    err.status = res.status;
    err.message = getApiErrorMessage({ data, detail }) || err.message;
    attachStructuredErrorFields(err, data, detail);
    throw err;
  }
  return data;
}

export const api = {
  get: (p) => apiFetch(p),
  post: (p, body) => apiFetch(p, { method: "POST", body: JSON.stringify(body || {}) }),
  put: (p, body) => apiFetch(p, { method: "PUT", body: JSON.stringify(body || {}) }),
  patch: (p, body) => apiFetch(p, { method: "PATCH", body: JSON.stringify(body || {}) }),
  delete: (p) => apiFetch(p, { method: "DELETE" }),
  del: (p) => apiFetch(p, { method: "DELETE" }),
};

// Backend exposes Supabase-validated /api/auth/me.
export const auth = {
  me: () => api.get("/api/auth/me"),
};
