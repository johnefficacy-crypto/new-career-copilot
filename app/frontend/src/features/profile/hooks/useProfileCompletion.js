import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";

// Shared accessor for /api/profile/completion. Used by UserMenu (status dot)
// and the Today profile banner so both call sites see the same value and
// react-query's cache dedupes the request — even though the page-level
// useDashboardData hook also calls the same endpoint, the request collapses
// into a single GET per stale window.
export const PROFILE_COMPLETION_QUERY_KEY = ["profile-completion"];

// The completion payload from the API is keyed by bucket
// (identity / education / etc.), each carrying `completion_pct`. Overall
// completion in Profile.jsx is the unweighted average of bucket pcts.
function pickOverallPct(payload) {
  if (!payload || typeof payload !== "object") return 0;
  const pcts = Object.values(payload)
    .map((b) => (b && typeof b === "object" ? b.completion_pct : null))
    .filter((v) => typeof v === "number");
  if (!pcts.length) return 0;
  return Math.round(pcts.reduce((s, v) => s + v, 0) / pcts.length);
}

// PR5 thresholds: green >= 80, amber 50-79, red < 50.
export function classifyCompletion(pct) {
  if (pct >= 80) return "green";
  if (pct >= 50) return "amber";
  return "red";
}

export default function useProfileCompletion() {
  const q = useQuery({
    queryKey: PROFILE_COMPLETION_QUERY_KEY,
    queryFn: () => api.get("/api/profile/completion"),
    // 30s is enough to absorb cross-component reads on the same screen
    // without staleness becoming visible after the user edits their profile.
    staleTime: 30_000,
  });
  const pct = pickOverallPct(q.data);
  return {
    raw: q.data || null,
    pct,
    status: classifyCompletion(pct),
    loading: q.isLoading,
    error: q.error || null,
    refetch: q.refetch,
  };
}
