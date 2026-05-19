import React from "react";
import { Navigate, useLocation, useParams } from "react-router-dom";

// Permanent-feeling redirect for legacy aspirant paths that have moved
// under /app/eligibility/* or /app/study/*. Built specifically for PR2 of
// the reorg: the redirect must preserve `?search` and `#hash` so deep
// links (bookmarks, emails, notifications) survive the move, and any
// :param segments in the target pattern are filled from the active route.
//
// Usage:
//   <Route path="/app/exams" element={<AliasRedirect to="/app/eligibility/exams" />} />
//   <Route path="/app/exams/:slug" element={<AliasRedirect to="/app/eligibility/exams/:slug" />} />
//
// PR7 deletes each alias once `grep -rn "<path>" app/frontend/src` (excluding
// *.test.* and *.md) returns 0 — i.e. nothing inside the app links to the
// legacy path any more.
export default function AliasRedirect({ to }) {
  const { search, hash } = useLocation();
  const params = useParams();
  const pathname = to.replace(/:([A-Za-z_][A-Za-z0-9_]*)/g, (_match, name) => {
    const value = params[name];
    return value == null ? "" : encodeURIComponent(value);
  });
  return <Navigate to={{ pathname, search, hash }} replace />;
}
