// Anonymous-id persistence for the unified onboarding engine.
//
// A stable per-browser id lets a guest answer 2-3 questions before login;
// it is passed to the backend on every resolve/answer/skip call so the
// session resumes across refreshes. After social/email login the
// frontend calls /stitch-anonymous, which attaches the anonymous rows to
// the authenticated user — only then is it safe to clear the id.

const STORAGE_KEY = "cc_onboarding_anonymous_id";

function generateId() {
  try {
    if (typeof crypto !== "undefined" && crypto.randomUUID) {
      return `anon_${crypto.randomUUID()}`;
    }
  } catch {
    /* fall through to the Math.random fallback */
  }
  return `anon_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 12)}`;
}

// Returns the persisted anonymous id, creating + storing one on first use.
// Falls back to an in-memory id if localStorage is unavailable.
export function getAnonymousId() {
  try {
    let id = window.localStorage.getItem(STORAGE_KEY);
    if (!id) {
      id = generateId();
      window.localStorage.setItem(STORAGE_KEY, id);
    }
    return id;
  } catch {
    return generateId();
  }
}

export function peekAnonymousId() {
  try {
    return window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

export function clearAnonymousId() {
  try {
    window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* nothing to clear */
  }
}
