import React, { useEffect, useState } from "react";
import { Target } from "lucide-react";
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
  engine_trace: [],
  meta: {},
};

function formatPercent(v) {
  if (v === null || v === undefined) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

export default function Today() {
  const [mc, setMc] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Fallback shape if mission-control fails entirely — keeps the legacy
  // /api/study/plan path working so the page never goes blank.
  const [fallbackPlan, setFallbackPlan] = useState(null);
  // Bumped when the plan is regenerated (e.g. from the preferences card) so
  // mission control is refetched.
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const data = await api.get("/api/study/mission-control");
        if (!cancelled) {
          setMc({ ...EMPTY_MC, ...(data || {}) });
          setError("");
        }
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.warn("mission-control failed, falling back", e);
        try {
          const legacy = await api.get("/api/study/plan");
          if (!cancelled) {
            setFallbackPlan({
              date: legacy?.date || "",
              plan: legacy?.plan || null,
              tasks: Array.isArray(legacy?.tasks) ? legacy.tasks : [],
            });
            setError("Showing a simplified plan view — mission control is unavailable right now.");
          }
        } catch (e2) {
          if (!cancelled) setError("Could not load today's plan.");
          if (process.env.NODE_ENV !== "production") console.error(e2);
        }
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
    // Optimistic flip + reuse existing PUT /api/study/tasks/:id contract.
    const nextDone = !t.done;
    const nextStatus = nextDone ? "completed" : "planned";
    setMc((prev) =>
      prev
        ? {
            ...prev,
            today_tasks: prev.today_tasks.map((x) =>
              x.id === t.id ? { ...x, done: nextDone, status: nextStatus } : x,
            ),
          }
        : prev,
    );
    setFallbackPlan((prev) =>
      prev
        ? {
            ...prev,
            tasks: prev.tasks.map((x) =>
              x.id === t.id ? { ...x, done: nextDone } : x,
            ),
          }
        : prev,
    );
    try {
      await api.post("/api/study/plan/toggle", { task_id: t.id });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  if (loading) {
    return <MissionControlSkeleton />;
  }

  // ── Fallback path (mission-control unavailable) ────────────────────────
  if (!mc && fallbackPlan) {
    const tasks = fallbackPlan.tasks || [];
    const done = tasks.filter((t) => t.done).length;
    return (
      <div className="space-y-6" data-testid="today-page">
        {error ? (
          <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">
            {error}
          </div>
        ) : null}
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Today · {fallbackPlan.date}
          </div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">
            Today's plan
          </h1>
          <p className="text-muted-foreground mt-1">
            {done} of {tasks.length} tasks complete
          </p>
        </div>
        <div className="soft-card rounded-2xl p-6">
          <div className="flex items-center gap-3 text-sm">
            <Target className="h-4 w-4 text-clay-600" />
            <span className="font-semibold">{fallbackPlan.plan?.theme}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">
              {fallbackPlan.plan?.target}
            </span>
          </div>
          <ul className="mt-5 space-y-2">
            {tasks.map((t) => (
              <StudyTaskCard key={t.id} task={t} onToggle={toggleTask} />
            ))}
          </ul>
        </div>
        <PersonaQuestionCard />
      </div>
    );
  }

  // ── Mission Control path ───────────────────────────────────────────────
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
  // Render the question card unless it would duplicate the existing
  // PersonaQuestionCard. We always use PersonaQuestionCard so the skip
  // and save behaviour stays single-sourced in PR2.

  return (
    <div className="space-y-6" data-testid="today-page">
      {error ? (
        <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">
          {error}
        </div>
      ) : null}

      <header>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Today · Study OS Mission Control
        </div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">
          Your plan, adapted
        </h1>
        <p className="text-muted-foreground mt-1">
          Your plan adapts from your study signals and recent progress.
        </p>
      </header>

      {plan ? (
        <section className="soft-card rounded-2xl p-6" data-testid="active-plan">
          <div className="flex items-center gap-3 text-sm">
            <Target className="h-4 w-4 text-clay-600" />
            <span className="font-semibold">{plan.theme}</span>
            <span className="text-muted-foreground">·</span>
            <span className="text-muted-foreground">{plan.target}</span>
          </div>
        </section>
      ) : (
        <section className="soft-card rounded-2xl p-6" data-testid="active-plan-empty">
          <div className="text-sm text-muted-foreground">
            No active study plan yet. You can still set one up from{" "}
            <a className="text-clay-700 underline" href="/app/study-plan">
              Study Plan
            </a>
            .
          </div>
        </section>
      )}

      <SafeExplanationCard explanations={safeExplanation} />

      <section
        className="grid grid-cols-2 md:grid-cols-4 gap-3"
        data-testid="metrics-row"
      >
        <StudyMetricCard
          label="Today"
          value={`${metrics.tasks_completed || 0}/${metrics.tasks_total || 0}`}
          hint={`${formatPercent(metrics.task_completion_rate)} complete`}
        />
        <StudyMetricCard
          label="Adherence"
          value={
            metrics.adherence === null || metrics.adherence === undefined
              ? "—"
              : formatPercent(metrics.adherence)
          }
          hint={`${metrics.hours_studied_7d || 0}h studied this week`}
          accent="sage"
        />
        <StudyMetricCard
          label="Backlog"
          value={metrics.backlog_count ?? 0}
          hint="Tasks to catch up"
          accent={metrics.backlog_count && metrics.backlog_count >= 5 ? "dusk" : "clay"}
        />
        <StudyMetricCard
          label="Mocks · week"
          value={metrics.mocks_taken ?? 0}
          hint="Logged this week"
        />
      </section>

      {nextBest ? <NextBestActionCard action={nextBest} /> : null}

      <section className="soft-card rounded-2xl p-6" data-testid="today-tasks">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Today's tasks
        </div>
        {tasks.length ? (
          <ul className="mt-3 space-y-2">
            {tasks.map((t) => (
              <StudyTaskCard key={t.id} task={t} onToggle={toggleTask} />
            ))}
          </ul>
        ) : (
          <p className="mt-3 text-sm text-muted-foreground">
            No tasks scheduled for today. The next-best action above will get
            you moving.
          </p>
        )}
      </section>

      <PlanReasoningCard reasoning={planReasoning} />

      <PlanPreferencesCard onRegenerated={() => setReloadKey((k) => k + 1)} />

      <StudyPolicyPreview policy={policy} />

      <TruthPanelCard panel={truth} />

      <ExamContextCard examContext={examContext} />

      <CompetitionContextCard competitionContext={competitionContext} />

      <EngineTrace steps={engine} />

      <IntelligenceLayersPanel />

      <UpdateIntelligencePanel
        official={updateContext.official_updates}
        unverified={updateContext.needs_verification}
        isPreview={false}
      />

      <PersonaQuestionCard />
    </div>
  );
}
