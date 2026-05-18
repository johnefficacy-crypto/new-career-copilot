import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { api } from "../lib/api";
import PersonaQuestionCard from "../features/persona-questions/PersonaQuestionCard";
import StudyMetricCard from "../features/study/components/StudyMetricCard";
import StudyTaskCard from "../features/study/components/StudyTaskCard";
import TruthPanelCard from "../features/study/components/TruthPanelCard";
import EngineTrace from "../features/study/components/EngineTrace";
import NextBestActionCard from "../features/study/components/NextBestActionCard";
import MissionControlSkeleton from "../features/study/components/MissionControlSkeleton";
import StudyPolicyPreview from "../features/study/components/StudyPolicyPreview";
import IntelligenceLayersPanel from "../features/study/components/IntelligenceLayersPanel";
import UpdateIntelligencePanel from "../features/study/components/UpdateIntelligencePanel";
import SafeExplanationCard from "../features/study/components/SafeExplanationCard";
import PlanReasoningCard from "../features/study/components/PlanReasoningCard";
import ExamContextCard from "../features/study/components/ExamContextCard";
import CompetitionContextCard from "../features/study/components/CompetitionContextCard";
import PlanPreferencesCard from "../features/study/components/PlanPreferencesCard";
import TodaysActions, { buildTodayActions } from "../features/dashboard/components/TodaysActions";
import ReadinessCards from "../features/dashboard/components/ReadinessCards";
import useDashboardData from "../features/dashboard/hooks/useDashboardData";
import { rankRecruitments } from "../lib/recruitmentRanking";
import { useAuth } from "../lib/authContext";
import { Eyebrow, Pill, StatusDot, StudyCard, TrustStamp } from "../shared/ui/studyos";
import { mergeMissionControl } from "./today/mergeMissionControl";
import useApiAction from "../lib/hooks/useApiAction";
import EligibleExamsCard from "../features/exam-eligibility/EligibleExamsCard";

const EMPTY_MC = {
  user_context: { dimensions: {}, scores: {}, safe_user_explanation: [] },
  study_policy: {},
  plan: null,
  exam_context: null,
  competition_context: null,
  policy_update_context: null,
  update_context: null,
  today_tasks: [],
  plan_reasoning: [],
  metrics: {
    tasks_total: 0,
    tasks_completed: 0,
    task_completion_rate: 0,
    hours_studied_7d: 0,
    hours_planned_week: 0,
    adherence: null,
    backlog_count: 0,
    mocks_taken: 0,
  },
  next_best_action: null,
  truth_panel: { summary: "", warnings: [], corrections: [] },
  progressive_question: null,
  eligibility_summary: null,
  engine_trace: [],
  meta: {},
};


function formatPercent(v) {
  if (v === null || v === undefined) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

function Drawer({ title, defaultOpen = false, testId, children }) {
  return (
    <details
      className="soft-card rounded-2xl px-5 py-3"
      data-testid={testId}
      open={defaultOpen || undefined}
    >
      <summary className="cursor-pointer select-none text-[12px] uppercase tracking-[0.18em] text-clay-700 font-semibold">
        {title}
      </summary>
      <div className="pt-4">{children}</div>
    </details>
  );
}

export default function Today() {
  const auth = useAuth();
  const dash = useDashboardData();
  const [mc, setMc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Bumped when the plan is regenerated (e.g. from the preferences card) so
  // mission control is refetched.
  const [reloadKey, setReloadKey] = useState(0);
  const { run: runToggle } = useApiAction();

  // Today's top actions — ranking inputs that come from mission-control
  // (backlog + 7d hours) and the trimmed dashboard hook (apps,
  // recruitments). Recommendations are no longer re-fetched: the ranked
  // list is derived locally from the recruitments + the user's profile.
  const dashApps = useMemo(() => dash.apps || [], [dash.apps]);
  const appByRecruitmentId = useMemo(
    () => Object.fromEntries(dashApps.map((a) => [a.recruitment_id, a])),
    [dashApps],
  );
  const mcMetrics = mc?.metrics || {};
  const dashBacklogHigh = (mcMetrics.backlog_count || 0) > 3;
  const mcStudyHoursWeek = mcMetrics.hours_studied_7d || 0;
  const dashTopMatches = useMemo(
    () =>
      rankRecruitments(dash.recruitments?.items || [], auth.user, {
        appByRecruitmentId,
        backlogHigh: dashBacklogHigh,
        studyHoursWeek: mcStudyHoursWeek,
      }).slice(0, 6),
    [dash.recruitments, auth.user, appByRecruitmentId, dashBacklogHigh, mcStudyHoursWeek],
  );
  const dashInProgressForms = dashApps.filter((a) => a.status === "in_progress").length;
  const dashPendingDocs = dashApps.reduce(
    (n, a) => n + (Array.isArray(a.documents_pending) ? a.documents_pending.length : 0),
    0,
  );

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // Mission-control's route handler already returns a degraded
        // payload on internal failure, so we don't need to fall back
        // to /api/study/plan here. Plan summary + tasks come straight
        // from mission-control's response.
        const data = await api.get("/api/study/mission-control");
        if (!cancelled) {
          setMc(mergeMissionControl(EMPTY_MC, data));
          setError("");
        }
      } catch (e) {
        if (!cancelled) setError("Could not load today's plan.");
        if (process.env.NODE_ENV !== "production") console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  async function toggleTask(t) {
    if (!t || !t.id) return;
    // Capture prior task state so we can roll back on POST failure.
    const wasDone = !!t.done;
    const wasStatus = t.status || (wasDone ? "completed" : "planned");
    const nextDone = !wasDone;
    const nextStatus = nextDone ? "completed" : "planned";
    const patchTasks = (tasks, done, status) =>
      tasks.map((x) => (x.id === t.id ? { ...x, done, status } : x));

    await runToggle({
      optimistic: () => {
        setMc((prev) =>
          prev
            ? { ...prev, today_tasks: patchTasks(prev.today_tasks, nextDone, nextStatus) }
            : prev,
        );
      },
      action: () => api.post("/api/study/plan/toggle", { task_id: t.id }),
      rollback: () => {
        setMc((prev) =>
          prev
            ? { ...prev, today_tasks: patchTasks(prev.today_tasks, wasDone, wasStatus) }
            : prev,
        );
      },
      errorMessage: "Couldn't save task — try again.",
    });
  }

  if (loading) {
    return <MissionControlSkeleton />;
  }

  // ── Today (full) path ──────────────────────────────────────────────────
  if (!mc) {
    return (
      <div className="space-y-6" data-testid="today-page">
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">
          {error || "Could not load today's plan."}
        </div>
      </div>
    );
  }

  const tasks = mc.today_tasks || [];
  const metrics = mc.metrics || {};
  const policy = mc.study_policy || {};
  const plan = mc.plan;
  const truth = mc.truth_panel;
  const engine = mc.engine_trace || [];
  const nextBest = mc.next_best_action;
  const safeExplanation = mc.user_context?.safe_user_explanation || [];
  const planReasoning = mc.plan_reasoning || [];
  const examContext = mc.exam_context;
  const competitionContext = mc.competition_context;
  const updateContext = mc.update_context || {};
  const meta = mc.meta || {};

  const done = tasks.filter((t) => t.done || t.status === "completed").length;
  const pct = tasks.length ? Math.round((done / tasks.length) * 100) : 0;

  const todayActions = buildTodayActions({
    topMatches: dashTopMatches,
    pendingDocs: dashPendingDocs,
    inProgressForms: dashInProgressForms,
    backlogHigh: dashBacklogHigh,
    profileCompletion: dash.profileCompletion,
  });
  const heroAction = todayActions[0];

  return (
    <div className="space-y-6" data-testid="today-page">
      {error ? (
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">
          {error}
        </div>
      ) : null}

      {/* ── Above the fold ─────────────────────────────────────────────── */}
      {/* 1. Hero next action (single primary CTA) */}
      {heroAction ? (
        <StudyCard data-testid="hero-next-action">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <Eyebrow>Next action{meta.generated_at ? ` · ${meta.generated_at}` : ""}</Eyebrow>
              <h1 className="font-heading text-[28px] leading-[1.1] mt-2">
                {heroAction.label}
              </h1>
              <p className="text-[13px] text-clay-700 mt-1.5">
                Tap to start. The rest of today's actions are below.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={heroAction.to}
                className="btn btn-primary"
                data-testid="hero-next-action-cta"
              >
                Start now
              </Link>
              <Link
                to="/app/tracker"
                className="text-[12px] font-semibold link-under text-clay-700"
                data-testid="hero-view-all-actions"
              >
                View all today's actions →
              </Link>
            </div>
          </div>
        </StudyCard>
      ) : null}

      {/* 2. Today's top 3 actions */}
      <TodaysActions
        topMatches={dashTopMatches}
        pendingDocs={dashPendingDocs}
        inProgressForms={dashInProgressForms}
        backlogHigh={dashBacklogHigh}
        profileCompletion={dash.profileCompletion}
        take={3}
      />

      {/* Profile readiness — per-feature unlock cards. */}
      <ReadinessCards />

      {/* 3. Exam eligibility — baseline rules per exam against the saved profile */}
      <EligibleExamsCard variant="card" initialData={mc.eligibility_summary || null} />

      {/* 3. Progress summary (metrics row) */}
      <section
        className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3"
        data-testid="metrics-row"
      >
        <StudyMetricCard
          label="Today"
          value={`${metrics.tasks_completed || 0}/${metrics.tasks_total || 0}`}
          delta={`${formatPercent(metrics.task_completion_rate)} complete`}
          state="live"
        />
        <StudyMetricCard
          label="Adherence"
          value={
            metrics.adherence === null || metrics.adherence === undefined
              ? "—"
              : formatPercent(metrics.adherence)
          }
          delta="7-day"
          tone="sage"
          state={metrics.adherence == null ? "preview" : "live"}
        />
        <StudyMetricCard
          label="Hours · 7d"
          value={`${metrics.hours_studied_7d || 0}h`}
          delta={`of ${metrics.hours_planned_week || 0}h planned`}
          state="live"
        />
        <StudyMetricCard
          label="Backlog"
          value={metrics.backlog_count ?? 0}
          delta="Tasks to catch up"
          tone={metrics.backlog_count && metrics.backlog_count >= 5 ? "amber" : "clay"}
          state="live"
        />
        <StudyMetricCard
          label="Mocks · week"
          value={metrics.mocks_taken ?? 0}
          delta="Logged this week"
          state="live"
        />
        <StudyMetricCard
          label="Plan progress"
          value={`${pct}%`}
          delta={`${done}/${tasks.length} done`}
          tone="sage"
          state="live"
        />
      </section>

      {/* ── Below the fold (all collapsed by default) ──────────────────── */}

      <Drawer title="Today's tasks" testId="drawer-todays-tasks">
        {nextBest ? <div className="mb-4"><NextBestActionCard action={nextBest} /></div> : null}
        <StudyCard padded={false}>
          <div className="px-7 pt-6 pb-4 flex items-end justify-between gap-4">
            <div>
              <h2 className="font-heading text-[22px] leading-tight">
                Each task carries its reasoning.
              </h2>
              <p className="text-[12.5px] text-clay-700 mt-1">
                Tap "Why this task" to open the reasoning drawer.
              </p>
            </div>
            <div className="text-right shrink-0">
              <div className="num-mono text-[11.5px] text-clay-700">
                {done}/{tasks.length} done · {pct}%
              </div>
              <div className="mt-1.5 w-[160px] h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
                <div className="h-full bg-sage-500" style={{ width: `${pct}%` }} />
              </div>
            </div>
          </div>
          <div className="hairline mx-7" />
          <div className="px-7 pb-6 pt-2">
            {tasks.length ? (
              <ul>
                {tasks.map((t) => (
                  <StudyTaskCard key={t.id} task={t} onToggle={toggleTask} />
                ))}
              </ul>
            ) : (
              <p className="py-6 text-sm text-clay-700">
                No tasks scheduled for today. The next-best action above will get you moving.
              </p>
            )}
          </div>
        </StudyCard>
        <div className="mt-4">
          <PersonaQuestionCard initialQuestion={mc.progressive_question || null} />
        </div>
      </Drawer>

      <Drawer title="Why this recommendation?" testId="drawer-why">
        <SafeExplanationCard explanations={safeExplanation} />
        <div className="mt-4">
          <EngineTrace steps={engine} />
        </div>
        <div className="mt-4 flex items-center justify-between flex-wrap gap-3 num-mono text-[10.5px] text-clay-700">
          <div>
            Career Copilot · Study OS{meta.plan_version ? ` · ${meta.plan_version}` : ""}
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span>Source lanes:</span>
            <TrustStamp kind="official" label="Auto-apply after review" />
            <TrustStamp kind="aggregator" label="Discovery only" />
            <TrustStamp kind="research" label="Hint only" />
            <TrustStamp kind="opportunity" label="Adjacent" />
          </div>
        </div>
      </Drawer>

      <Drawer title="Progress vs Plan" testId="drawer-progress-vs-plan">
        <TruthPanelCard panel={truth} />
      </Drawer>

      <Drawer title="Exam context" testId="drawer-exam-context">
        {plan ? (
          <StudyCard data-testid="active-plan">
            <div className="flex items-start justify-between gap-6 flex-wrap">
              <div>
                <Eyebrow>Active plan</Eyebrow>
                <h2 className="font-heading text-[22px] mt-1">{plan.theme || "Your study plan"}</h2>
                {plan.target ? (
                  <p className="text-[13px] text-clay-700 mt-1.5 max-w-[60ch]">{plan.target}</p>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2 items-center">
                  {examContext?.exam ? <Pill tone="ink">{examContext.exam}</Pill> : null}
                  {examContext?.phase ? <Pill tone="sage">{examContext.phase}</Pill> : null}
                  {examContext?.days_remaining != null ? (
                    <Pill tone="clay">{examContext.days_remaining}d to D-day</Pill>
                  ) : null}
                </div>
              </div>
              <div className="text-right shrink-0">
                {meta.plan_version ? (
                  <div className="num-mono text-[10.5px] text-clay-700">{meta.plan_version}</div>
                ) : null}
                <div className="mt-3 flex justify-end">
                  <StatusDot state="live" label="" />
                </div>
              </div>
            </div>
          </StudyCard>
        ) : (
          <StudyCard data-testid="active-plan-empty">
            <Eyebrow>Active plan</Eyebrow>
            <p className="text-sm text-clay-700 mt-2">
              No active study plan yet. You can set one up from{" "}
              <a className="text-clay-800 underline underline-offset-2" href="/app/study-plan">
                Study Plan
              </a>
              .
            </p>
          </StudyCard>
        )}
        <div className="mt-4">
          <ExamContextCard examContext={examContext} />
        </div>
      </Drawer>

      <Drawer title="Competition context" testId="drawer-competition-context">
        <CompetitionContextCard competitionContext={competitionContext} />
      </Drawer>

      <Drawer title="Intelligence layers" testId="drawer-intelligence-layers">
        <IntelligenceLayersPanel />
      </Drawer>

      <Drawer title="Update intelligence" testId="drawer-update-intelligence">
        <UpdateIntelligencePanel
          official={updateContext.official_updates}
          unverified={updateContext.needs_verification}
          isPreview={false}
        />
      </Drawer>

      <Drawer title="Study policy / Plan reasoning" testId="drawer-study-policy">
        <StudyPolicyPreview policy={policy} />
        <div className="mt-4">
          <PlanReasoningCard reasoning={planReasoning} />
        </div>
        <div className="mt-4">
          <PlanPreferencesCard onRegenerated={() => setReloadKey((k) => k + 1)} />
        </div>
      </Drawer>
    </div>
  );
}
