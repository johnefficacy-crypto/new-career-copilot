// DEPRECATED: superseded by Today.jsx (PR-B). Do not delete — pending follow-up cleanup PR.
import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Clock,
  Flame,
  Target,
  AlertTriangle,
  ChevronRight,
  Play,
  CheckCircle2,
} from "lucide-react";
import { useAuth } from "../lib/authContext";
import { rankRecruitments } from "../lib/recruitmentRanking";
import useDashboardData from "../features/dashboard/hooks/useDashboardData";
import TodaysActions from "../features/dashboard/components/TodaysActions";
import { ChartCard, ErrorState, LoadingSkeleton } from "../shared/ui";

function MatchSection({ title, items }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {title}
      </div>
      {items.length === 0 ? (
        <div className="mt-2 text-sm text-muted-foreground">
          No recommendations in this stage yet.
        </div>
      ) : (
        <ul className="mt-2 space-y-2">
          {items.map((m) => (
            <li key={`${title}-${m.id || m.slug}`} className="text-sm">
              <Link to={`/app/eligibility/exams/${m.slug}`} className="font-medium link-under">
                {m.name}
              </Link>
              <div className="text-xs text-muted-foreground">
                Score {m.match_score} · Next: {m.next_action}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

function StatCard({ k }) {
  const Icon = k.icon;
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          {k.label}
        </div>
        <Icon className={`h-4 w-4 ${k.tone}`} strokeWidth={1.8} />
      </div>
      <div className={`mt-3 font-heading text-4xl font-semibold tracking-tight ${k.tone}`}>
        {k.val}
      </div>
      <div className="mt-1 text-xs text-muted-foreground">{k.delta}</div>
    </div>
  );
}

function RecruitmentRow({ m }) {
  return (
    <Link
      to={`/app/eligibility/exams/${m.slug}`}
      className="py-3.5 flex items-center gap-4 hover:bg-clay-50/60 -mx-3 px-3 rounded-lg transition"
    >
      <div className="h-10 w-10 rounded-xl bg-clay-100 grid place-items-center font-mono font-semibold text-xs text-clay-700">
        {m.organization_code || "ORG"}
      </div>
      <div className="flex-1 min-w-0">
        <div className="font-semibold text-[15px]">
          {m.name}{" "}
          <span className="text-[11px] uppercase tracking-wider text-clay-600">
            [{m.recommendation_stage}]
          </span>
        </div>
        <div className="text-xs text-muted-foreground">
          Score {m.match_score} ·{" "}
          {(m.match_reasons || []).slice(0, 2).join(" · ") || "No strong signal yet"}
        </div>
        <div className="text-xs text-muted-foreground">
          {m.risk_flags?.[0] ? `Risk: ${m.risk_flags[0]} · ` : ""}Next: {m.next_action}
        </div>
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground" />
    </Link>
  );
}

export default function Dashboard() {
  const auth = useAuth();
  const {
    recommendations,
    recommendationsAvailable,
    recruitments,
    plan,
    focus,
    review,
    apps,
    profileCompletion,
    loading,
    errors,
  } = useDashboardData();

  const appByRecruitmentId = useMemo(
    () => Object.fromEntries((apps || []).map((a) => [a.recruitment_id, a])),
    [apps],
  );
  const backlogHigh =
    (review.backlog_count || 0) > 3 || (review.missed_tasks || 0) > 3;

  const rankedFallbackMatches = useMemo(
    () =>
      rankRecruitments(recruitments.items, auth.user, {
        appByRecruitmentId,
        backlogHigh,
        studyHoursWeek: focus.total_hours_7d,
      }),
    [recruitments.items, auth.user, appByRecruitmentId, backlogHigh, focus.total_hours_7d],
  );
  const rankedMatches = recommendationsAvailable
    ? (recommendations.items || [])
    : rankedFallbackMatches;
  const topMatches = rankedMatches.slice(0, 6);
  const stageSections = useMemo(
    () => ({
      apply_now: topMatches.filter((m) => m.recommendation_stage === "apply_now").slice(0, 3),
      continue_application: topMatches.filter((m) => m.recommendation_stage === "continue_application").slice(0, 3),
      prepare_after_submission: topMatches.filter((m) => m.recommendation_stage === "prepare_after_submission").slice(0, 3),
      complete_profile: topMatches.filter((m) => m.recommendation_stage === "complete_profile").slice(0, 3),
    }),
    [topMatches],
  );

  const inProgressForms = apps.filter((a) => a.status === "in_progress").length;
  const submittedForms = apps.filter((a) => a.status === "submitted").length;
  const pendingDocs = apps.reduce(
    (n, a) => n + (Array.isArray(a.documents_pending) ? a.documents_pending.length : 0),
    0,
  );
  const firstName = (auth.user?.name || "there").split(" ")[0];
  const today = new Date().toLocaleDateString("en-IN", {
    weekday: "short",
    day: "numeric",
    month: "long",
  });
  const studyData = (focus.week || []).map((x) => ({
    d: (x?.date || "").slice(5),
    h: Number(((x?.minutes || 0) / 60).toFixed(1)),
  }));

  const adherencePct =
    review.adherence == null ? null : Math.round(review.adherence * 100);

  const statCards = [
    {
      label: "Eligible posts",
      val: recruitments.counts?.eligible || 0,
      tone: "text-sage-600",
      icon: Target,
      delta: `${recruitments.counts?.conditional || 0} conditional`,
    },
    {
      label: "In-progress forms",
      val: inProgressForms,
      tone: "text-clay-600",
      icon: AlertTriangle,
      delta: `${pendingDocs} documents pending`,
    },
    {
      label: "Focus hrs · week",
      val: focus.total_hours_7d || 0,
      tone: "text-dusk-600",
      icon: Clock,
      delta: `${review.hours_planned || 0}h planned`,
    },
    {
      label: "Submitted forms",
      val: submittedForms,
      tone: "text-clay-600",
      icon: Flame,
      delta: backlogHigh ? "Backlog high" : "Backlog manageable",
    },
  ];

  if (loading) return <LoadingSkeleton variant="card" className="max-w-5xl" />;

  const anyError =
    errors.recruitments ||
    errors.plan ||
    errors.focus ||
    errors.review ||
    errors.apps ||
    errors.profileCompletion;

  return (
    <div data-testid="dashboard-page" className="space-y-6">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            {today}
          </div>
          <h1 className="mt-1 font-heading text-4xl md:text-5xl font-semibold tracking-tight">
            Good day, <span className="italic text-clay-600">{firstName}.</span>
          </h1>
          <p className="text-muted-foreground mt-1">
            {plan?.plan
              ? `Plan active for ${plan.date || "today"}.`
              : "No active plan yet — start with onboarding/profile."}
          </p>
        </div>
        <Link to="/app/study/focus" className="btn btn-primary" data-testid="start-focus-btn">
          <Play className="h-4 w-4" /> Start focus
        </Link>
      </div>

      <TodaysActions
        topMatches={topMatches}
        pendingDocs={pendingDocs}
        inProgressForms={inProgressForms}
        backlogHigh={backlogHigh}
        profileCompletion={profileCompletion}
      />

      {anyError && (
        <ErrorState
          title="Some dashboard modules failed to load"
          message="You can still continue with available data. Refresh to retry."
        />
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {statCards.map((k) => (
          <StatCard key={k.label} k={k} />
        ))}
      </div>

      {profileCompletion && (
        <div className="soft-card rounded-2xl p-4 text-sm text-muted-foreground">
          Profile gaps: eligibility {profileCompletion?.eligibility_profile?.completion_pct || 0}% ·
          study {profileCompletion?.study_profile?.completion_pct || 0}% · application{" "}
          {profileCompletion?.application_profile?.completion_pct || 0}% complete.
        </div>
      )}

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
                Recruitments for you
              </div>
              <div className="font-heading text-xl font-semibold mt-0.5">
                {recruitments.counts?.all || 0} active
              </div>
            </div>
            <Link
              to="/app/eligibility/exams"
              className="text-xs font-semibold link-under"
              data-testid="see-all-exams"
            >
              See all →
            </Link>
          </div>
          <div className="mt-4 divide-y divide-border">
            {topMatches.length === 0 ? (
              <div className="py-4 text-sm text-muted-foreground">
                No active recruitment recommendations yet.
              </div>
            ) : (
              topMatches.map((m) => <RecruitmentRow key={m.slug} m={m} />)
            )}
          </div>
        </div>

        <div className="soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Weekly Progress vs Plan
          </div>
          <div className="mt-2 text-sm text-muted-foreground">
            Planned vs done:{" "}
            <span className="font-semibold text-foreground">
              {review.hours_studied || 0}h / {review.hours_planned || 0}h
            </span>
          </div>
          <div className="mt-1 text-sm text-muted-foreground">
            Adherence:{" "}
            <span className="font-semibold text-foreground">
              {adherencePct == null ? "—" : `${adherencePct}%`}
            </span>{" "}
            · Mocks:{" "}
            <span className="font-semibold text-foreground">{review.mocks_taken || 0}</span>
          </div>
          <div className="mt-4 text-xs uppercase tracking-wider text-muted-foreground">
            Corrections
          </div>
          <ul className="mt-2 space-y-1 text-sm">
            {(review.corrections || []).slice(0, 3).map((c) => (
              <li key={c} className="flex gap-2">
                <CheckCircle2 className="h-4 w-4 text-clay-600 mt-0.5" />
                {c}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-4">
        <MatchSection title="Apply now" items={stageSections.apply_now} />
        <MatchSection title="Continue application" items={stageSections.continue_application} />
        <MatchSection
          title="Prepare after submission"
          items={stageSections.prepare_after_submission}
        />
        <MatchSection title="Complete profile first" items={stageSections.complete_profile} />
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <ChartCard
          title="7-day focus hours"
          subtitle="Focus telemetry"
          data={studyData}
          emptyMessage="No focus data yet. Start a session to see your trend."
        />
      </div>
    </div>
  );
}
