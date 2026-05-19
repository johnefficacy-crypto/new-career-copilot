import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Flame, Play } from "lucide-react";
import { api } from "../../lib/api";
import ExamCycleTimeline from "../../features/study/components/ExamCycleTimeline";
import PlanChangeLogCard from "../../features/study/components/PlanChangeLogCard";

// PR10: real Study Home. Vertical stack of cards.
// No new endpoints. Each card owns its loading / error / empty state
// and never invents data — when the backend returns nothing, the card
// shows the explicit empty copy from the spec.

// Per spec, no section may be labelled "Today". The hero card uses
// "Next study action"; the focus card uses "Focus session"; etc.

const INCOMPLETE_TASK_STATUSES = new Set([
  "planned",
  "in_progress",
  "pending",
  "carried_forward",
  "missed",
]);

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

function dateOrNull(value) {
  if (!value) return null;
  const d = new Date(value);
  return Number.isNaN(d.valueOf()) ? null : d;
}

// Pick the next study action deterministically — overdue first (earliest
// past date), then earliest upcoming date, then stable by original index.
function pickNextAction(tasks) {
  if (!Array.isArray(tasks) || tasks.length === 0) return null;
  const today = startOfToday().getTime();
  const annotated = tasks
    .map((t, idx) => ({ t, idx }))
    .filter(({ t }) => {
      if (t?.done) return false;
      const status = (t?.status || "planned").toLowerCase();
      if (status === "completed" || status === "skipped" || status === "not_applicable") {
        return false;
      }
      return INCOMPLETE_TASK_STATUSES.has(status);
    })
    .map((row) => {
      const date = dateOrNull(row.t.due_date || row.t.scheduled_date);
      const ts = date ? date.getTime() : Number.POSITIVE_INFINITY;
      const overdue = date ? ts < today : false;
      return { ...row, ts, overdue };
    })
    .sort((a, b) => {
      if (a.overdue !== b.overdue) return a.overdue ? -1 : 1;
      if (a.ts !== b.ts) return a.ts - b.ts;
      return a.idx - b.idx;
    });
  return annotated[0] || null;
}

function formatDueRelative(dateLike) {
  const d = dateOrNull(dateLike);
  if (!d) return null;
  const today = startOfToday();
  const day = new Date(d);
  day.setHours(0, 0, 0, 0);
  const diffDays = Math.round((day.getTime() - today.getTime()) / (24 * 60 * 60 * 1000));
  if (diffDays === 0) return "Today";
  if (diffDays === 1) return "Tomorrow";
  if (diffDays === -1) return "Overdue 1d";
  if (diffDays < 0) return `Overdue ${Math.abs(diffDays)}d`;
  return `In ${diffDays}d`;
}

function CardShell({ title, eyebrow, right, children, testId }) {
  return (
    <section
      className="soft-card rounded-2xl p-5"
      data-testid={testId}
      aria-labelledby={testId ? `${testId}-heading` : undefined}
    >
      <div className="flex items-start justify-between gap-3 flex-wrap mb-3">
        <div>
          {eyebrow ? (
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              {eyebrow}
            </div>
          ) : null}
          <h2
            id={testId ? `${testId}-heading` : undefined}
            className="font-heading text-lg font-semibold mt-1"
          >
            {title}
          </h2>
        </div>
        {right ? <div className="shrink-0">{right}</div> : null}
      </div>
      {children}
    </section>
  );
}

function CardSkeleton() {
  return (
    <div role="status" aria-live="polite" className="space-y-2">
      <div className="h-4 w-2/3 bg-clay-100 animate-pulse rounded" />
      <div className="h-4 w-1/2 bg-clay-100 animate-pulse rounded" />
      <span className="sr-only">Loading</span>
    </div>
  );
}

function CardError({ message, onRetry }) {
  return (
    <div className="text-sm text-rose-700">
      <p>{message}</p>
      {onRetry ? (
        <button type="button" onClick={onRetry} className="btn btn-ghost mt-2">
          Retry
        </button>
      ) : null}
    </div>
  );
}

function ActivePlanCard({ plan, tasks, loading, error, onRetry }) {
  return (
    <CardShell
      testId="study-home-plan"
      eyebrow="Active plan"
      title={plan?.target || plan?.name || (plan ? "Your study plan" : "No active plan")}
      right={
        plan ? (
          <Link to="/app/study/plan" className="btn btn-ghost" data-testid="study-home-plan-cta">
            Open plan
          </Link>
        ) : null
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <CardError message="Couldn't load your plan." onRetry={onRetry} />
      ) : !plan ? (
        <div className="text-sm">
          <p className="text-muted-foreground">
            No active plan. Set a target and we'll build one.
          </p>
          <Link
            to="/app/study/plan"
            className="btn btn-primary mt-3 inline-flex"
            data-testid="study-home-plan-empty-cta"
          >
            Create plan
          </Link>
        </div>
      ) : (
        <div className="text-sm text-clay-800 space-y-1">
          {plan.target_exam ? (
            <div>
              <span className="text-muted-foreground">Target exam: </span>
              <span className="font-medium">{plan.target_exam}</span>
            </div>
          ) : null}
          {plan.week_number != null || plan.total_weeks != null ? (
            <div>
              <span className="text-muted-foreground">Week: </span>
              <span className="font-medium">
                {plan.week_number ?? "—"}
                {plan.total_weeks ? ` of ${plan.total_weeks}` : ""}
              </span>
            </div>
          ) : null}
          {plan.weekly_hours_target ? (
            <div>
              <span className="text-muted-foreground">Weekly target: </span>
              <span className="font-medium">{plan.weekly_hours_target}h</span>
            </div>
          ) : null}
          {Array.isArray(tasks) ? (
            <div className="text-muted-foreground">{tasks.length} tasks scheduled</div>
          ) : null}
        </div>
      )}
    </CardShell>
  );
}

function NextActionCard({ task, plan, loading, error, onRetry }) {
  const due = task ? formatDueRelative(task.due_date || task.scheduled_date) : null;
  return (
    <CardShell
      testId="study-home-next-action"
      eyebrow="Next study action"
      title={task ? task.title || task.topic || "Untitled task" : "Nothing queued"}
      right={
        task ? (
          <Link
            to="/app/study/plan"
            className="btn btn-primary"
            data-testid="study-home-next-action-cta"
          >
            <Play className="h-4 w-4" />
            Start
          </Link>
        ) : null
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <CardError message="Couldn't load your tasks." onRetry={onRetry} />
      ) : task ? (
        <div className="text-sm text-clay-800 flex flex-wrap items-center gap-2">
          {due ? (
            <span
              className={`pill ${
                due.startsWith("Overdue") ? "pill-rose" : "pill-sage"
              } inline-flex`}
              data-testid="study-home-next-action-due"
            >
              {due}
            </span>
          ) : null}
          {task.task_type ? (
            <span className="text-xs text-muted-foreground">{task.task_type}</span>
          ) : null}
        </div>
      ) : (
        <div className="text-sm">
          <p className="text-muted-foreground">
            {plan
              ? "All tasks on your plan are complete."
              : "Create or update your plan to see your next action."}
          </p>
          <Link
            to="/app/study/plan"
            className="btn btn-primary mt-3 inline-flex"
            data-testid="study-home-next-action-empty-cta"
          >
            {plan ? "Update plan" : "Create plan"}
          </Link>
        </div>
      )}
    </CardShell>
  );
}

function FocusCard({ focus, loading, error, onRetry }) {
  const today = focus?.week?.find?.((d) => d.isToday) || null;
  const todayMinutes =
    today?.minutes ?? (today?.hrs ? Math.round(today.hrs * 60) : null);
  const weekHours = focus?.total_hours_7d ?? null;
  return (
    <CardShell
      testId="study-home-focus"
      eyebrow="Focus session"
      title="Sit down for a focused block"
      right={
        <Link to="/app/study/focus" className="btn btn-primary" data-testid="study-home-focus-cta">
          <Flame className="h-4 w-4" />
          Start focus session
        </Link>
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <CardError message="Focus summary unavailable." onRetry={onRetry} />
      ) : (
        <div className="text-sm text-clay-800 grid grid-cols-2 gap-3">
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Today
            </div>
            <div className="num-mono text-xl font-semibold mt-0.5">
              {todayMinutes != null ? `${todayMinutes}m` : "0m"}
            </div>
          </div>
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground">
              Last 7 days
            </div>
            <div className="num-mono text-xl font-semibold mt-0.5">
              {weekHours != null ? `${weekHours}h` : "0h"}
            </div>
          </div>
        </div>
      )}
    </CardShell>
  );
}

function TruthPanelCompact({ current, previous, loading, error, onRetry }) {
  const adherence = current?.scores?.plan_adherence_score;
  const prevAdherence = previous?.scores?.plan_adherence_score;
  const hasCurrent = adherence != null && Number.isFinite(Number(adherence));
  const hasPrev = prevAdherence != null && Number.isFinite(Number(prevAdherence));
  const delta = hasCurrent && hasPrev ? Math.round((adherence - prevAdherence) * 100) : null;

  return (
    <CardShell
      testId="study-home-truth-panel"
      eyebrow="Truth panel"
      title="This week at a glance"
      right={
        <Link
          to="/app/study/review"
          className="btn btn-ghost"
          data-testid="study-home-truth-panel-cta"
        >
          View full report card
        </Link>
      }
    >
      {loading ? (
        <CardSkeleton />
      ) : error ? (
        <CardError message="Report card unavailable." onRetry={onRetry} />
      ) : hasCurrent ? (
        <div className="text-sm text-clay-800 flex items-center gap-3 flex-wrap">
          <span className="font-medium">
            Adherence: {Math.round(adherence * 100)}% this week
          </span>
          {delta != null ? (
            <span
              data-testid="study-home-truth-panel-delta"
              className={`pill inline-flex ${
                delta >= 0 ? "pill-sage" : "pill-rose"
              }`}
            >
              {delta >= 0 ? "+" : ""}
              {delta} pts vs last week
            </span>
          ) : null}
        </div>
      ) : (
        <p className="text-sm text-muted-foreground">No weekly report card yet</p>
      )}
    </CardShell>
  );
}

export default function StudyHome() {
  const [plan, setPlan] = useState({ data: null, loading: true, error: null });
  const [focus, setFocus] = useState({ data: null, loading: true, error: null });
  const [report, setReport] = useState({
    current: null,
    previous: null,
    loading: true,
    error: null,
  });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function loadPlan() {
      setPlan({ data: null, loading: true, error: null });
      try {
        const d = await api.get("/api/study/plan");
        if (!cancelled) {
          setPlan({
            data: {
              plan: d?.plan || null,
              tasks: Array.isArray(d?.tasks) ? d.tasks : [],
            },
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled) {
          setPlan({ data: null, loading: false, error: e });
        }
      }
    }

    async function loadFocus() {
      setFocus({ data: null, loading: true, error: null });
      try {
        const d = await api.get("/api/study/focus/summary");
        if (!cancelled) {
          setFocus({
            data: {
              total_hours_7d: d?.total_hours_7d ?? 0,
              week: Array.isArray(d?.week) ? d.week : [],
            },
            loading: false,
            error: null,
          });
        }
      } catch (e) {
        if (!cancelled) setFocus({ data: null, loading: false, error: e });
      }
    }

    async function loadReport() {
      setReport({ current: null, previous: null, loading: true, error: null });
      try {
        // history?limit=2 returns the two most recent rows. The current week
        // (mid-progress or just rolled) is usually items[0]; the previous
        // week (or older) is items[1] when present.
        const [current, history] = await Promise.all([
          api.get("/api/study/report-card?period=weekly").catch(() => null),
          api
            .get("/api/study/report-card/history?period=weekly&limit=2")
            .catch(() => ({ items: [] })),
        ]);
        if (cancelled) return;
        const items = Array.isArray(history?.items) ? history.items : [];
        const previous =
          items.find((row) =>
            current?.period_start && row.period_start
              ? row.period_start !== current.period_start
              : true,
          ) || items[1] || null;
        setReport({ current: current || null, previous, loading: false, error: null });
      } catch (e) {
        if (!cancelled) {
          setReport({ current: null, previous: null, loading: false, error: e });
        }
      }
    }

    loadPlan();
    loadFocus();
    loadReport();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  const nextTask = useMemo(() => pickNextAction(plan.data?.tasks), [plan.data]);

  return (
    <div className="space-y-5" data-testid="study-home-page">
      <ActivePlanCard
        plan={plan.data?.plan}
        tasks={plan.data?.tasks}
        loading={plan.loading}
        error={plan.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
      <NextActionCard
        task={nextTask?.t}
        plan={plan.data?.plan}
        loading={plan.loading}
        error={plan.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
      <FocusCard
        focus={focus.data}
        loading={focus.loading}
        error={focus.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
      <CardShell
        testId="study-home-cycle"
        eyebrow="Exam cycle"
        title="Where you are in the cycle"
      >
        <ExamCycleTimeline />
      </CardShell>
      <TruthPanelCompact
        current={report.current}
        previous={report.previous}
        loading={report.loading}
        error={report.error}
        onRetry={() => setReloadKey((k) => k + 1)}
      />
      <CardShell
        testId="study-home-changelog"
        eyebrow="Recent plan changes"
        title="What the engine changed lately"
      >
        <PlanChangeLogCard />
      </CardShell>
    </div>
  );
}

// Exports for unit-test reuse.
export { pickNextAction, formatDueRelative };
