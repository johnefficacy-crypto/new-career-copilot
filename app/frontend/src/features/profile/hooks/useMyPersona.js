import { useQuery } from "@tanstack/react-query";
import { api } from "../../../lib/api";

// Read-only accessor for the caller's persona snapshot.
// Surface used by Profile's "How we read you" section (PR5). The backend
// endpoint /api/persona/me returns { snapshot: { evidence, dimensions,
// scores, study_policy, computed_at, ... } }. We only expose the bits the
// UI is allowed to surface (per the persona module's "internal" rule) —
// the page renders evidence + dimension counts as one-line signals; it
// never shows a primary_persona label.
export const MY_PERSONA_QUERY_KEY = ["persona-me"];

export default function useMyPersona() {
  const q = useQuery({
    queryKey: MY_PERSONA_QUERY_KEY,
    queryFn: () => api.get("/api/persona/me"),
    staleTime: 60_000,
    retry: false,
  });
  const snapshot = q.data?.snapshot || null;
  return {
    snapshot,
    loading: q.isLoading,
    error: q.error || null,
  };
}
