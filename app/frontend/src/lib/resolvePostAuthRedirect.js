// Resolves the post-auth destination for sign-in / sign-up.
//
// Two call shapes are supported:
//
//   resolvePostAuthRedirect(location, searchParams, defaultPath)
//     – legacy positional form used by Login/Signup. Priority:
//         1. router state.from.pathname (+ search) — set by ProtectedRoute
//         2. ?next= query param — same-origin internal path only
//         3. defaultPath
//
//   resolvePostAuthRedirect({ next, from, fallback })
//     – object form used by AuthCallback after OAuth round-trip. Priority:
//         1. next (string) — same-origin internal path
//         2. from (string) — same-origin internal path
//         3. fallback (defaults to "/app")
//
// The ?next= / next guard rejects absolute URLs, protocol-relative paths
// ("//evil.com"), backslash tricks ("/\evil.com") and percent-encoded
// scheme-relative tricks ("/%2Fevil.com", "/%5Cevil.com") to prevent
// open-redirects: only single-slash internal paths are accepted.

export function isSafeInternalPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  if (value.startsWith("/\\")) return false;
  const lower = value.toLowerCase();
  // Catch percent-encoded protocol-relative tricks like /%2Fevil.com or
  // /%5Cevil.com which browsers normalise back to // or /\ after decode.
  if (lower.startsWith("/%2f")) return false;
  if (lower.startsWith("/%5c")) return false;
  return true;
}

function isPlainObject(value) {
  return (
    value !== null &&
    typeof value === "object" &&
    !Array.isArray(value) &&
    !(value instanceof URLSearchParams)
  );
}

function looksLikeOptionsObject(value) {
  // The object-style signature passes a plain object with optional next/from/fallback
  // keys. The legacy `location` arg is also an object, but its hallmark is `state.from`
  // or other react-router fields — never a top-level `next`/`fallback`.
  if (!isPlainObject(value)) return false;
  if ("next" in value || "fallback" in value) return true;
  if ("from" in value && typeof value.from === "string") return true;
  return false;
}

export function resolvePostAuthRedirect(arg1, arg2, arg3) {
  if (looksLikeOptionsObject(arg1)) {
    const { next, from, fallback = "/app" } = arg1;
    if (isSafeInternalPath(next)) return next;
    if (isSafeInternalPath(from)) return from;
    return fallback;
  }

  const location = arg1;
  const searchParams = arg2;
  const defaultPath = arg3;

  const fromState = location?.state?.from;
  if (fromState && typeof fromState.pathname === "string" && fromState.pathname) {
    const search = typeof fromState.search === "string" ? fromState.search : "";
    const candidate = `${fromState.pathname}${search}`;
    if (isSafeInternalPath(candidate)) return candidate;
  }
  let nextParam = null;
  if (searchParams && typeof searchParams.get === "function") {
    nextParam = searchParams.get("next");
  } else if (typeof searchParams === "string") {
    try {
      nextParam = new URLSearchParams(searchParams).get("next");
    } catch (_err) {
      nextParam = null;
    }
  }
  if (nextParam && isSafeInternalPath(nextParam)) {
    return nextParam;
  }
  return defaultPath;
}
