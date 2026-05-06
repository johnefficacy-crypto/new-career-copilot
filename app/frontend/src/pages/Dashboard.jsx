import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { Clock, Flame, Target, AlertTriangle, ChevronRight, Play, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

function scoreRecruitment(r, user) {
  let score = 0;
  const reasons = [];
  const risks = [];
  const prefs = user?.profile || {};
  const goals = new Set(user?.goal_exams || []);
  if (r?.eligibility?.eligible || r?.status === "eligible") { score += 35; reasons.push("Eligibility confirmed"); }
  else if (r?.eligibility?.conditional) { score += 16; reasons.push("Eligibility conditional"); risks.push("Eligibility has conditions"); }
  else { risks.push("Eligibility pending"); }
  if (r?.status === "urgent") { score += 20; reasons.push("Deadline is near"); }
  if (r?.saved) { score += 8; reasons.push("Already tracked"); }
  if ((r?.vacancies || 0) > 500) { score += 8; reasons.push("Higher vacancy volume"); }
  if (goals.size && (goals.has(r?.slug) || goals.has(r?.exam_code) || goals.has(r?.exam_family))) { score += 10; reasons.push("Matches your target exams"); }
  if (prefs?.domicile_state && r?.state && String(r.state).toLowerCase() === String(prefs.domicile_state).toLowerCase()) { score += 6; reasons.push("Matches domicile preference"); }
  if (prefs?.target_type && r?.sector && String(r.sector).toLowerCase().includes(String(prefs.target_type).toLowerCase())) { score += 4; reasons.push("Matches preferred sector"); }
  if (!prefs?.date_of_birth || !prefs?.category || !prefs?.graduation_year) risks.push("Complete profile fields for stronger matching");
  const next_action = (r?.eligibility?.eligible || r?.status === "eligible") ? (r?.saved ? "Review and apply" : "Track and apply") : (!prefs?.date_of_birth ? "Complete profile" : "Run eligibility check");
  return { ...r, match_score: Math.max(0, Math.min(100, score)), match_reasons: reasons, risk_flags: risks, next_action };
}

export default function Dashboard() {
  const auth = useAuth();
  const [recruitments, setRecruitments] = useState({ items: [], counts: {} });
  const [plan, setPlan] = useState({ tasks: [], plan: null, date: "" });
  const [focus, setFocus] = useState({ total_hours_7d: 0, week: [] });
  const [review, setReview] = useState({ hours_studied: 0, hours_planned: 0, adherence: 0, mocks_taken: 0, highlights: [], corrections: [] });
  const [apps, setApps] = useState([]);
  const [profileCompletion, setProfileCompletion] = useState(null);

  useEffect(() => {
    api.get("/api/recruitments").then((d) => setRecruitments(d || { items: [], counts: {} })).catch(() => setRecruitments({ items: [], counts: {} }));
    api.get("/api/study/plan").then((d) => setPlan({ date: d?.date || "", plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] })).catch(() => setPlan({ tasks: [], plan: null, date: "" }));
    api.get("/api/study/focus/summary").then((d) => setFocus({ total_hours_7d: d?.total_hours_7d || 0, week: Array.isArray(d?.week) ? d.week : [] })).catch(() => setFocus({ total_hours_7d: 0, week: [] }));
    api.get("/api/study/weekly-review").then((d) => setReview(d || {})).catch(() => setReview({ hours_studied: 0, hours_planned: 0, adherence: 0, mocks_taken: 0, highlights: [], corrections: [] }));
    api.get("/api/applications/me").then((d) => setApps(Array.isArray(d?.items) ? d.items : [])).catch(() => setApps([]));
    api.get("/api/profile/completion").then((d) => setProfileCompletion(d || null)).catch(() => setProfileCompletion(null));
  }, []);

  const topMatches = useMemo(() => (Array.isArray(recruitments.items) ? recruitments.items : []).map((r) => scoreRecruitment(r, auth.user)).sort((a, b) => b.match_score - a.match_score).slice(0, 4), [recruitments.items, auth.user]);
  const streak = useMemo(() => {
    const week = Array.isArray(focus.week) ? focus.week : [];
    let s = 0;
    for (let i = week.length - 1; i >= 0; i -= 1) { if ((week[i]?.minutes || 0) > 0) s += 1; else break; }
    return s;
  }, [focus.week]);
  const todayMins = (Array.isArray(focus.week) ? focus.week[focus.week.length - 1]?.minutes : 0) || 0;
  const studyData = (focus.week || []).map((x) => ({ d: (x?.date || "").slice(5), h: Number(((x?.minutes || 0) / 60).toFixed(1)) }));
  const inProgressForms = apps.filter((a) => a.status === "in_progress").length;
  const submittedForms = apps.filter((a) => a.status === "submitted").length;
  const pendingDocs = apps.reduce((n, a) => n + (Array.isArray(a.documents_pending) ? a.documents_pending.length : 0), 0);
  const clickedNotSubmitted = apps.filter((a) => a.clicked_apply_at && !a.submitted_at);
  const urgentForms = apps.filter((a) => a.recruitment?.apply_end_date).sort((a, b) => new Date(a.recruitment.apply_end_date) - new Date(b.recruitment.apply_end_date)).slice(0, 3);

  const firstName = (auth.user?.name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" });

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{today}</div>
          <h1 className="mt-1 font-heading text-4xl md:text-5xl font-semibold tracking-tight">Good day, <span className="italic text-clay-600">{firstName}.</span></h1>
          <p className="text-muted-foreground mt-1">{plan?.plan ? `Plan active for ${plan.date || "today"}.` : "No active plan yet — start with onboarding/profile."}</p>
        </div>
        <Link to="/app/study/focus" className="btn btn-primary" data-testid="start-focus-btn"><Play className="h-4 w-4" /> Start focus</Link>
      </div>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[{ label: "Eligible posts", val: recruitments.counts?.eligible || 0, tone: "text-sage-600", icon: Target, delta: `${recruitments.counts?.conditional || 0} conditional` }, { label: "In-progress forms", val: inProgressForms, tone: "text-clay-600", icon: AlertTriangle, delta: `${pendingDocs} documents pending` }, { label: "Focus hrs · week", val: focus.total_hours_7d || 0, tone: "text-dusk-600", icon: Clock, delta: `${review.hours_planned || 0}h planned` }, { label: "Submitted forms", val: submittedForms, tone: "text-clay-600", icon: Flame, delta: `${todayMins} min today` }].map((k) => <div key={k.label} className="soft-card rounded-2xl p-5"><div className="flex items-center justify-between"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{k.label}</div><k.icon className={`h-4 w-4 ${k.tone}`} strokeWidth={1.8} /></div><div className={`mt-3 font-heading text-4xl font-semibold tracking-tight ${k.tone}`}>{k.val}</div><div className="mt-1 text-xs text-muted-foreground">{k.delta}</div></div>)}
      </div>
      {profileCompletion && <div className="soft-card rounded-2xl p-4 text-sm text-muted-foreground">Profile gaps: eligibility {profileCompletion?.eligibility_profile?.completion_pct || 0}% · study {profileCompletion?.study_profile?.completion_pct || 0}% · application {profileCompletion?.application_profile?.completion_pct || 0}% complete.</div>}
      <div className="soft-card rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Next actions · forms</div>
        {apps.length === 0 ? <div className="mt-2 text-sm text-muted-foreground">No applications tracked yet. Open a recruitment and click Apply to start tracking.</div> : <ul className="mt-3 text-sm space-y-1">
          <li>In-progress forms: {inProgressForms}</li>
          <li>Submitted forms: {submittedForms}</li>
          <li>Missing documents: {pendingDocs}</li>
          <li>Clicked but not submitted: {clickedNotSubmitted.length}</li>
          {urgentForms.map((a) => <li key={a.id}>Urgent: {(a.recruitment?.name || a.recruitment_id)} closes {new Date(a.recruitment.apply_end_date).toLocaleDateString()}</li>)}
        </ul>}
      </div>
      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between"><div><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments for you</div><div className="font-heading text-xl font-semibold mt-0.5">{recruitments.counts?.all || 0} active</div></div><Link to="/app/exams" className="text-xs font-semibold link-under" data-testid="see-all-exams">See all →</Link></div>
          <div className="mt-4 divide-y divide-border">{topMatches.map((m) => <Link key={m.slug} to={`/app/exams/${m.slug}`} className="py-3.5 flex items-center gap-4 hover:bg-clay-50/60 -mx-3 px-3 rounded-lg transition"><div className="h-10 w-10 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">{m.organization_code || "ORG"}</div><div className="flex-1 min-w-0"><div className="font-semibold text-[15px]">{m.name}</div><div className="text-xs text-muted-foreground">Score {m.match_score} · {m.match_reasons.join(" · ") || "No strong signal yet"}</div></div><ChevronRight className="h-4 w-4 text-muted-foreground" /></Link>)}</div>
        </div>
        <div className="soft-card rounded-2xl p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Weekly Truth Panel</div><div className="mt-2 text-sm text-muted-foreground">Planned vs done: <span className="font-semibold text-foreground">{review.hours_studied || 0}h / {review.hours_planned || 0}h</span></div><div className="mt-1 text-sm text-muted-foreground">Adherence: <span className="font-semibold text-foreground">{Math.round((review.adherence || 0) * 100)}%</span> · Mocks: <span className="font-semibold text-foreground">{review.mocks_taken || 0}</span></div><div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Corrections</div><ul className="mt-2 space-y-1 text-sm">{(review.corrections || []).slice(0, 3).map((c) => <li key={c} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-clay-600 mt-0.5" />{c}</li>)}</ul></div>
      </div>
      <div className="grid lg:grid-cols-3 gap-4"><div className="lg:col-span-2 soft-card rounded-2xl p-5"><div className="flex items-end justify-between"><div><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Focus telemetry</div><div className="font-heading text-xl font-semibold mt-0.5">7-day focus hours</div></div></div><div className="h-48 mt-5"><ResponsiveContainer width="100%" height="100%"><AreaChart data={studyData}><XAxis dataKey="d" stroke="rgba(0,0,0,0.45)" fontSize={12} tickLine={false} axisLine={false} /><Tooltip /><Area type="monotone" dataKey="h" stroke="#A68057" strokeWidth={2} fill="#E9D7C0" /></AreaChart></ResponsiveContainer></div></div><div className="soft-card rounded-2xl p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Today's plan</div><div className="font-heading text-xl font-semibold mt-0.5">{plan?.tasks?.length || 0} blocks</div><ul className="mt-4 space-y-2.5">{(plan?.tasks || []).slice(0, 5).map((t) => <li key={t.id} className="flex items-start gap-2.5"><div className={`h-5 w-5 mt-0.5 rounded-md grid place-items-center ${t.done ? "bg-sage-500 text-white" : "border border-border bg-white"}`}>{t.done && <CheckCircle2 className="h-3 w-3" />}</div><div className="flex-1"><div className={`text-sm ${t.done ? "line-through text-muted-foreground" : "font-medium"}`}>{t.title}</div><div className="text-[11px] text-muted-foreground font-mono">{t.time}</div></div></li>)}</ul></div></div>
    </div>
  );
}
