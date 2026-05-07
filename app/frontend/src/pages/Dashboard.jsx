import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AreaChart, Area, ResponsiveContainer, XAxis, Tooltip } from "recharts";
import { Clock, Flame, Target, AlertTriangle, ChevronRight, Play, CheckCircle2 } from "lucide-react";
import { api } from "../lib/api";
import { useAuth } from "../lib/authContext";

const ELIGIBILITY_CRITICAL_FIELDS = ["date_of_birth", "category", "graduation_year"];
const STAGE_ORDER = [
  "apply_now",
  "continue_application",
  "submit_form",
  "prepare_after_submission",
  "monitor_result",
  "complete_profile",
  "check_eligibility",
  "low_priority",
  "closed",
];

function toDays(value) {
  if (!value) return null;
  return Math.ceil((new Date(value).getTime() - Date.now()) / (24 * 60 * 60 * 1000));
}

function normalizeState(state) {
  return state ? String(state).trim().toLowerCase() : "";
}

function hasGoalMatch(recruitment, goalExams = []) {
  const goals = new Set((goalExams || []).map((x) => String(x).toLowerCase()));
  const keys = [recruitment?.slug, recruitment?.exam_code, recruitment?.exam_family].filter(Boolean).map((x) => String(x).toLowerCase());
  return keys.some((k) => goals.has(k));
}

function getProfileGaps(user) {
  const profile = user?.profile || {};
  return ELIGIBILITY_CRITICAL_FIELDS.filter((field) => !profile?.[field]);
}

function scoreRecruitment(recruitment, user, context = {}) {
  const profile = user?.profile || {};
  const app = context?.appByRecruitmentId?.[recruitment.id] || null;
  const missingCritical = getProfileGaps(user);
  const backlogHigh = !!context.backlogHigh;

  const deadlineDays = toDays(recruitment?.apply_end_date);
  const startDays = toDays(recruitment?.apply_start_date);
  const windowClosed = deadlineDays !== null && deadlineDays < 0;
  const windowNotStarted = startDays !== null && startDays > 0;
  const deadlineNear = deadlineDays !== null && deadlineDays >= 0 && deadlineDays <= 3;

  const weeklyGoal = Number(profile?.weekly_hours_goal || profile?.weekly_study_capacity || 0);
  const weeklyStudied = Number(context?.studyHoursWeek || 0);
  const lowCapacity = weeklyGoal > 0 && weeklyStudied < weeklyGoal * 0.4;

  const hasEligibility = recruitment?.eligibility?.verdict === "eligible" || recruitment?.eligibility?.eligible === true;
  const isConditional = recruitment?.eligibility?.verdict === "conditional" || recruitment?.eligibility?.conditional === true;

  let score = 0;
  const reasons = [];
  const risks = [];

  if (hasEligibility) {
    score += 30;
    reasons.push("Deterministic eligibility confirmed");
  } else if (isConditional) {
    score += 10;
    reasons.push("Eligibility has conditional checks");
    risks.push("Eligibility is conditional");
  } else {
    risks.push("Eligibility not confirmed yet");
  }

  if (missingCritical.length > 0) {
    score -= 20;
    risks.push(`Missing profile fields: ${missingCritical.slice(0, 2).join(", ")}`);
  }

  if (hasGoalMatch(recruitment, user?.goal_exams)) {
    score += 12;
    reasons.push("Matches your target exams");
  }

  if (normalizeState(profile?.domicile_state) && normalizeState(recruitment?.state) === normalizeState(profile?.domicile_state)) {
    score += 8;
    reasons.push("Matches domicile state");
  }

  if (Array.isArray(profile?.preferred_states) && profile.preferred_states.map(normalizeState).includes(normalizeState(recruitment?.state))) {
    score += 6;
    reasons.push("Matches preferred state");
  }

  if (Array.isArray(profile?.preferred_sectors) && recruitment?.sector) {
    const recruitmentSector = String(recruitment.sector).toLowerCase();
    const inPreferredSector = profile.preferred_sectors
      .map((x) => String(x).toLowerCase())
      .some((sector) => recruitmentSector.includes(sector));
    if (inPreferredSector) {
      score += 6;
      reasons.push("Matches preferred sector");
    }
  }

  if ((recruitment?.vacancies || 0) > 500) {
    score += 4;
    reasons.push("Higher vacancy volume");
  }

  if (recruitment?.saved || app) {
    score += 6;
    reasons.push("Already saved/tracked");
  }

  if (!app?.submitted_at && deadlineNear) {
    score += 10;
    reasons.push("Deadline approaching");
    risks.push("Deadline is near");
  }

  if (windowClosed && !app?.submitted_at) {
    score -= 40;
    risks.push("Application window closed");
  }

  if (app?.clicked_apply_at && !app?.submitted_at) {
    score += 8;
    reasons.push("Application started");
  }

  if (app?.submitted_at) {
    score += 12;
    reasons.push("Application submitted");
  }

  if (backlogHigh) {
    score -= 8;
    risks.push("High study backlog risk");
  }

  if (lowCapacity) {
    score -= 5;
    risks.push("Low weekly study capacity vs goal");
  }

  const appStatus = app?.status || "not_started";
  const submitted = !!app?.submitted_at;

  let recommendation_stage = "check_eligibility";
  let next_action = "Verify deterministic eligibility status before applying.";

  if (windowClosed && !submitted) {
    recommendation_stage = "closed";
    next_action = "Application window closed. Track future cycles.";
  } else if (missingCritical.length > 0) {
    recommendation_stage = "complete_profile";
    next_action = `Complete profile fields: ${missingCritical.join(", ")}.`;
  } else if (!hasEligibility) {
    recommendation_stage = "check_eligibility";
    next_action = "Verify deterministic eligibility status before applying.";
  } else if (submitted) {
    if (windowClosed) {
      recommendation_stage = "monitor_result";
      next_action = backlogHigh ? "Recover backlog while monitoring result notifications." : "Monitor result updates and keep revision steady.";
    } else {
      recommendation_stage = "prepare_after_submission";
      next_action = backlogHigh ? "Recover backlog first, then continue exam preparation." : "Shift from application to preparation strategy.";
    }
  } else if (app?.clicked_apply_at) {
    recommendation_stage = "continue_application";
    next_action = "Complete or update your application status.";
  } else if (appStatus === "in_progress") {
    recommendation_stage = "submit_form";
    next_action = deadlineNear ? "Submit form now — deadline is near." : "Complete and submit your form early.";
  } else if (windowNotStarted) {
    recommendation_stage = "low_priority";
    next_action = "Application window not open yet. Set a reminder for start date.";
  } else {
    recommendation_stage = "apply_now";
    next_action = deadlineNear ? "Apply now — deadline is near." : "Proceed to application and submit early.";
  }

  return {
    ...recruitment,
    match_score: Math.max(0, Math.min(100, score)),
    match_reasons: reasons,
    risk_flags: risks,
    next_action,
    recommendation_stage,
  };
}

function MatchSection({ title, items }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{title}</div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">No recommendations in this stage yet.</div>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((m) => (
            <li key={`${title}-${m.id || m.slug}`} className="text-sm">
              <Link to={`/app/exams/${m.slug}`} className="font-medium link-under">
                {m.name}
              </Link>
              <div className="text-xs text-muted-foreground">Score {m.match_score} · Next: {m.next_action}</div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
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

  const appByRecruitmentId = useMemo(() => Object.fromEntries((apps || []).map((a) => [a.recruitment_id, a])), [apps]);
  const backlogHigh = (review.backlog_count || 0) > 3 || (review.missed_tasks || 0) > 3;

  const rankedMatches = useMemo(
    () => (Array.isArray(recruitments.items) ? recruitments.items : [])
      .map((r) => scoreRecruitment(r, auth.user, { appByRecruitmentId, backlogHigh, studyHoursWeek: focus.total_hours_7d }))
      .sort((a, b) => (b.match_score - a.match_score) || (STAGE_ORDER.indexOf(a.recommendation_stage) - STAGE_ORDER.indexOf(b.recommendation_stage))),
    [recruitments.items, auth.user, appByRecruitmentId, backlogHigh, focus.total_hours_7d],
  );

  const topMatches = rankedMatches.slice(0, 6);
  const stageSections = useMemo(() => ({
    apply_now: topMatches.filter((m) => m.recommendation_stage === "apply_now").slice(0, 3),
    continue_application: topMatches.filter((m) => m.recommendation_stage === "continue_application").slice(0, 3),
    prepare_after_submission: topMatches.filter((m) => m.recommendation_stage === "prepare_after_submission").slice(0, 3),
    complete_profile: topMatches.filter((m) => m.recommendation_stage === "complete_profile").slice(0, 3),
  }), [topMatches]);

  const inProgressForms = apps.filter((a) => a.status === "in_progress").length;
  const submittedForms = apps.filter((a) => a.status === "submitted").length;
  const pendingDocs = apps.reduce((n, a) => n + (Array.isArray(a.documents_pending) ? a.documents_pending.length : 0), 0);
  const firstName = (auth.user?.name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "long" });
  const studyData = (focus.week || []).map((x) => ({ d: (x?.date || "").slice(5), h: Number(((x?.minutes || 0) / 60).toFixed(1)) }));

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{today}</div>
          <h1 className="mt-1 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Good day, <span className="italic text-clay-600">{firstName}.</span>
          </h1>
          <p className="text-muted-foreground mt-1">{plan?.plan ? `Plan active for ${plan.date || "today"}.` : "No active plan yet — start with onboarding/profile."}</p>
        </div>
        <Link to="/app/study/focus" className="btn btn-primary" data-testid="start-focus-btn"><Play className="h-4 w-4" /> Start focus</Link>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Eligible posts", val: recruitments.counts?.eligible || 0, tone: "text-sage-600", icon: Target, delta: `${recruitments.counts?.conditional || 0} conditional` },
          { label: "In-progress forms", val: inProgressForms, tone: "text-clay-600", icon: AlertTriangle, delta: `${pendingDocs} documents pending` },
          { label: "Focus hrs · week", val: focus.total_hours_7d || 0, tone: "text-dusk-600", icon: Clock, delta: `${review.hours_planned || 0}h planned` },
          { label: "Submitted forms", val: submittedForms, tone: "text-clay-600", icon: Flame, delta: `${backlogHigh ? "Backlog high" : "Backlog manageable"}` },
        ].map((k) => (
          <div key={k.label} className="soft-card rounded-2xl p-5">
            <div className="flex items-center justify-between">
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{k.label}</div>
              <k.icon className={`h-4 w-4 ${k.tone}`} strokeWidth={1.8} />
            </div>
            <div className={`mt-3 font-heading text-4xl font-semibold tracking-tight ${k.tone}`}>{k.val}</div>
            <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
          </div>
        ))}
      </div>

      {profileCompletion && <div className="soft-card rounded-2xl p-4 text-sm text-muted-foreground">Profile gaps: eligibility {profileCompletion?.eligibility_profile?.completion_pct || 0}% · study {profileCompletion?.study_profile?.completion_pct || 0}% · application {profileCompletion?.application_profile?.completion_pct || 0}% complete.</div>}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments for you</div>
              <div className="font-heading text-xl font-semibold mt-0.5">{recruitments.counts?.all || 0} active</div>
            </div>
            <Link to="/app/exams" className="text-xs font-semibold link-under" data-testid="see-all-exams">See all →</Link>
          </div>

          <div className="mt-4 divide-y divide-border">
            {topMatches.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">No active recruitment recommendations yet.</div>
            ) : topMatches.map((m) => (
              <Link key={m.slug} to={`/app/exams/${m.slug}`} className="py-3.5 flex items-center gap-4 hover:bg-clay-50/60 -mx-3 px-3 rounded-lg transition">
                <div className="h-10 w-10 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">{m.organization_code || "ORG"}</div>
                <div className="flex-1 min-w-0">
                  <div className="font-semibold text-[15px]">
                    {m.name} <span className="text-[11px] uppercase tracking-wider text-clay-600">[{m.recommendation_stage}]</span>
                  </div>
                  <div className="text-xs text-muted-foreground">Score {m.match_score} · {(m.match_reasons || []).slice(0, 2).join(" · ") || "No strong signal yet"}</div>
                  <div className="text-xs text-muted-foreground">{m.risk_flags?.[0] ? `Risk: ${m.risk_flags[0]} · ` : ""}Next: {m.next_action}</div>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground" />
              </Link>
            ))}
          </div>
        </div>

        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Weekly Truth Panel</div>
          <div className="mt-2 text-sm text-muted-foreground">Planned vs done: <span className="font-semibold text-foreground">{review.hours_studied || 0}h / {review.hours_planned || 0}h</span></div>
          <div className="mt-1 text-sm text-muted-foreground">Adherence: <span className="font-semibold text-foreground">{Math.round((review.adherence || 0) * 100)}%</span> · Mocks: <span className="font-semibold text-foreground">{review.mocks_taken || 0}</span></div>
          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">Corrections</div>
          <ul className="mt-2 space-y-1 text-sm">{(review.corrections || []).slice(0, 3).map((c) => <li key={c} className="flex gap-2"><CheckCircle2 className="h-4 w-4 text-clay-600 mt-0.5" />{c}</li>)}</ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MatchSection title="Apply now" items={stageSections.apply_now} />
        <MatchSection title="Continue application" items={stageSections.continue_application} />
        <MatchSection title="Prepare after submission" items={stageSections.prepare_after_submission} />
        <MatchSection title="Complete profile first" items={stageSections.complete_profile} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-end justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Focus telemetry</div>
              <div className="font-heading text-xl font-semibold mt-0.5">7-day focus hours</div>
            </div>
          </div>
          <div className="h-48 mt-5">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={studyData}>
                <XAxis dataKey="d" stroke="rgba(0,0,0,0.45)" fontSize={12} tickLine={false} axisLine={false} />
                <Tooltip />
                <Area type="monotone" dataKey="h" stroke="#A68057" strokeWidth={2} fill="#E9D7C0" />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
