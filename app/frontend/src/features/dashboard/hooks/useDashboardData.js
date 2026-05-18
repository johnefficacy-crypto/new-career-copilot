import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

// Today.jsx fetches mission-control on its own (study plan, focus, weekly
// review, exam intelligence, persona snapshot all live there). This hook
// is now the thin shim around the *non*-mission-control endpoints the
// page still needs: recruitments + the user's applications + profile
// completion. Recommendations and the study-plan/focus/review fanout
// have moved into mission-control and are no longer re-fetched here.
export default function useDashboardData() {
  const [state, setState] = useState({
    recruitments: { items: [], counts: {} },
    apps: [],
    profileCompletion: null,
    loading: true,
    errors: {},
  });

  async function load() {
    setState((s) => ({ ...s, loading: true, errors: {} }));
    const errors = {};

    const rqP = api.get("/api/recruitments").then((d) => d).catch((e) => { errors.recruitments = e; return { items: [], counts: {} }; });
    const apP = api.get("/api/applications/me").then((d) => Array.isArray(d?.items) ? d.items : []).catch((e) => { errors.apps = e; return []; });
    const pcP = api.get("/api/profile/completion").then((d) => d || null).catch((e) => { errors.profileCompletion = e; return null; });

    const [recruitments, apps, profileCompletion] = await Promise.all([rqP, apP, pcP]);

    setState({
      recruitments,
      apps,
      profileCompletion,
      loading: false,
      errors,
    });
  }

  useEffect(() => { load(); }, []);
  return { ...state, reload: load };
}
