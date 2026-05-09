import { useEffect, useState } from "react";
import { api } from "../../../lib/api";

export default function useDashboardData() {
  const [state, setState] = useState({
    recommendations: { items: [], counts: {} }, recommendationsAvailable: false,
    recruitments: { items: [], counts: {} }, plan: { tasks: [], plan: null, date: "" },
    focus: { total_hours_7d: 0, week: [] }, review: { hours_studied: 0, hours_planned: 0, adherence: 0, mocks_taken: 0, highlights: [], corrections: [] },
    apps: [], profileCompletion: null,
    loading: true,
    errors: {},
  });

  async function load() {
    setState((s) => ({ ...s, loading: true, errors: {} }));
    const errors = {};

    const recP = api.get("/api/recommendations/me").then((d) => ({ ok: true, d })).catch((e) => ({ ok: false, e }));
    const rqP = api.get("/api/recruitments").then((d) => d).catch((e) => { errors.recruitments = e; return { items: [], counts: {} }; });
    const spP = api.get("/api/study/plan").then((d) => ({ date: d?.date || "", plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] })).catch((e) => { errors.plan = e; return { tasks: [], plan: null, date: "" }; });
    const fsP = api.get("/api/study/focus/summary").then((d) => ({ total_hours_7d: d?.total_hours_7d || 0, week: Array.isArray(d?.week) ? d.week : [] })).catch((e) => { errors.focus = e; return { total_hours_7d: 0, week: [] }; });
    const wrP = api.get("/api/study/weekly-review").then((d) => d || {}).catch((e) => { errors.review = e; return { hours_studied: 0, hours_planned: 0, adherence: 0, mocks_taken: 0, highlights: [], corrections: [] }; });
    const apP = api.get("/api/applications/me").then((d) => Array.isArray(d?.items) ? d.items : []).catch((e) => { errors.apps = e; return []; });
    const pcP = api.get("/api/profile/completion").then((d) => d || null).catch((e) => { errors.profileCompletion = e; return null; });

    const [recRes, recruitments, plan, focus, review, apps, profileCompletion] = await Promise.all([recP, rqP, spP, fsP, wrP, apP, pcP]);

    setState({
      recommendations: recRes.ok ? (recRes.d || { items: [], counts: {} }) : { items: [], counts: {} },
      recommendationsAvailable: recRes.ok,
      recruitments, plan, focus, review, apps, profileCompletion,
      loading: false, errors: recRes.ok ? errors : { ...errors, recommendations: recRes.e },
    });
  }

  useEffect(() => { load(); }, []);
  return { ...state, reload: load };
}
