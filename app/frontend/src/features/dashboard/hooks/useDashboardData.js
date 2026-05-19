import { useCallback, useEffect, useState } from "react";
import { api } from "../../../lib/api";

// Two-phase dashboard bootstrap.
//
// Phase 1 (render gate): /api/recruitments + /api/applications/me. These
// two power the "Today's top actions" + applications widgets above the
// fold. Promise.all so they fan out in parallel and the page can paint
// as soon as both land. Notifications unread-count is owned by
// DashShell (mounted higher in the tree); it does not flow through this
// hook.
//
// Phase 2 (deferred, non-blocking): /api/profile/completion. Used by
// hero next-action priority + below-the-fold cards; not needed for
// first paint. We schedule it via setTimeout(0) so the renderer can
// commit phase 1 before this fires.
export default function useDashboardData() {
  const [state, setState] = useState({
    recruitments: { items: [], counts: {} },
    apps: [],
    profileCompletion: null,
    loading: true, // Tied to phase 1 only — the render gate.
    profileCompletionLoading: true,
    errors: {},
  });

  const loadPhase1 = useCallback(async () => {
    setState((s) => ({ ...s, loading: true, errors: {} }));
    const errors = {};
    const rqP = api.get("/api/recruitments").then(
      (d) => d,
      (e) => {
        errors.recruitments = e;
        return { items: [], counts: {} };
      },
    );
    const apP = api.get("/api/applications/me").then(
      (d) => (Array.isArray(d?.items) ? d.items : []),
      (e) => {
        errors.apps = e;
        return [];
      },
    );
    const [recruitments, apps] = await Promise.all([rqP, apP]);
    setState((s) => ({
      ...s,
      recruitments,
      apps,
      loading: false,
      errors: { ...s.errors, ...errors },
    }));
  }, []);

  const loadPhase2 = useCallback(async () => {
    setState((s) => ({ ...s, profileCompletionLoading: true }));
    try {
      const d = await api.get("/api/profile/completion");
      setState((s) => ({
        ...s,
        profileCompletion: d || null,
        profileCompletionLoading: false,
      }));
    } catch (e) {
      setState((s) => ({
        ...s,
        profileCompletion: null,
        profileCompletionLoading: false,
        errors: { ...s.errors, profileCompletion: e },
      }));
    }
  }, []);

  const load = useCallback(async () => {
    await loadPhase1();
    // setTimeout(0) yields back to the event loop so phase 1 commits
    // and paints before the heavier profile/completion call fires.
    setTimeout(loadPhase2, 0);
  }, [loadPhase1, loadPhase2]);

  useEffect(() => {
    load();
  }, [load]);

  return { ...state, reload: load };
}
