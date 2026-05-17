// Resolves the post-auth destination for sign-in / sign-up.
//
// Priority:
//   1. router state.from.pathname (+ search) — set by ProtectedRoute
//   2. ?next= query param — must be a same-origin internal path
//   3. defaultPath supplied by the caller
//
// The ?next= guard rejects absolute URLs and protocol-relative paths
// ("//evil.com") to prevent open-redirects: only values starting with
// a single "/" are accepted as internal.

export function isSafeInternalPath(value) {
  if (typeof value !== "string" || value.length === 0) return false;
  if (!value.startsWith("/")) return false;
  if (value.startsWith("//")) return false;
  // Catch encoded scheme-relative forms (e.g. "/%2Fevil.com").
  if (value.startsWith("/\\")) return false;
  return true;
}

export function resolvePostAuthRedirect(location, searchParams, defaultPath) {
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
