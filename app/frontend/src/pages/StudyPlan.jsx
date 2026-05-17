import React, { useEffect, useState } from "react";
import { Sparkles, ArrowRight } from "lucide-react";
import { api } from "../lib/api";
import { Card, Drawer, Eyebrow, PageHeader, Pill, SectionHeader, StatusDot } from "../shared/ui/studyos";
import PlanChangeLogCard from "../features/study/components/PlanChangeLogCard";
import PlanByTopic from "../features/study/components/PlanByTopic";
import ExamCycleTimeline from "../features/study/components/ExamCycleTimeline";
import useApiAction from "../lib/hooks/useApiAction";

const STATUS_TONE = {
  completed: "sage",
  in_progress: "ink",
  skipped: "dusk",
  missed: "rose",
  planned: "outline",
};

// `target` is the daily-hour ceiling used to scale the per-day bar. Defaults
// to 7 when no plan target is known, but the label calls out the reference
// so users in 4h/day or 10h/day plans don't read 75% as their adherence.
function DayCell({ d, target = 7 }) {
  const denom = target > 0 ? target : 7;
  const pct = Math.max(0, Math.min(100, Math.round((d.hrs / denom) * 100)));
  return (
    <div
      className={`rounded-xl border p-3 relative ${
        d.isToday ? "border-[#2E2218] bg-[#FBF6EF]" : "border-[#E7DECB] bg-white/60"
      }`}
    >
      {d.isToday && (
        <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[9px] uppercase tracking-[0.18em] font-semibold">
          Today
        </div>
      )}
      <div className="num-mono text-[10.5px] text-clay-700">{d.label}</div>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-clay-700">
        <span className="num-mono">{d.hrs}h focus</span>
      </div>
      <div className="mt-2.5">
        <div className="h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
          <div className="h-full bg-sage-500" style={{ width: `${pct}%` }} />
        </div>
        <div className="text-[10.5px] text-clay-700 mt-1 num-mono">
          {pct}% of {denom}h
        </div>
      </div>
    </div>
  );
}

export default function StudyPlan() {
  const [plan, setPlan] = useState({ tasks: [], plan: null });
  const [focus, setFocus] = useState({ total_hours_7d: 0, week: [] });
  const [review, setReview] = useState(null);
  const [err, setErr] = useState("");
  const [draft, setDraft] = useState(null);
  const [draftLoading, setDraftLoading] = useState(false);
  const [draftOpen, setDraftOpen] = useState(false);
  const [applying, setApplying] = useState(false);
  const [examItems, setExamItems] = useState([]);
  const [selectedExamId, setSelectedExamId] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const { run: runTaskAction } = useApiAction();
  const { run: runApply } = useApiAction();

  async function refetchPlan() {
    try {
      const d = await api.get("/api/study/plan");
      setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  useEffect(() => {
    api
      .get("/api/study/plan")
      .then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] }))
      .catch((e) => {
        setErr("Study plan is temporarily unavailable.");
        if (process.env.NODE_ENV !== "production") console.error(e);
      });
    api
      .get("/api/study/focus/summary")
      .then((d) => setFocus({ total_hours_7d: d?.total_hours_7d || 0, week: Array.isArray(d?.week) ? d.week : [] }))
      .catch(() => setFocus({ total_hours_7d: 0, week: [] }));
    api
      .get("/api/study/weekly-review")
      .then((d) => setReview(d || null))
      .catch(() => setReview(null));
    api
      .get("/api/study/exams")
      .then((d) => setExamItems(Array.isArray(d?.items) ? d.items : []))
      .catch(() => setExamItems([]));
  }, [reloadKey]);

  async function chooseExam(examId, confirm = false) {
    const suffix = confirm ? "?confirm_archive=true" : "";
    try {
      await api.put(`/api/study/target-exam${suffix}`, { exam_id: examId });
      setSelectedExamId(examId);
    } catch (e) {
      if (e?.status === 409 && !confirm) {
        const ok = window.confirm("Replace current plan for the selected exam?");
        if (ok) return chooseExam(examId, true);
      }
      throw e;
    }
  }

  async function previewRegenerate() {
    if (!selectedExamId) return;
    setDraftLoading(true);
    setDraftOpen(true);
    try {
      const d = await api.get("/api/study/plan/draft");
      setDraft(d || null);
    } catch (e) {
      setDraft({ generated: false, reason: "error", error: e?.message });
    } finally {
      setDraftLoading(false);
    }
  }

  async function applyDraft() {
    if (!selectedExamId) return;
    setApplying(true);
    const result = await runApply({
      action: () => api.post("/api/study/plan/apply", {}),
      successMessage: "Plan applied.",
      errorMessage: "Couldn't apply plan — try again.",
    });
    if (result.ok) {
      setDraftOpen(false);
      setDraft(null);
      setReloadKey((k) => k + 1);
    }
    setApplying(false);
  }

  async function toggle(t) {
    const wasStatus = t.status || (t.done ? "completed" : "planned");
    const nextStatus = wasStatus === "completed" ? "planned" : "completed";
    const patchTo = (status, serverRow) => (p) => ({
      ...p,
      tasks: p.tasks.map((x) =>
        x.id === t.id
          ? {
              // Accept the server-returned row as state-of-record if present.
              // The server may canonicalise the status to something other than
              // "completed"/"planned" (e.g. "carried_forward" / "rescheduled");
              // forcing the local state to "completed" would mis-reconcile.
              ...(serverRow || x),
              done: (serverRow?.status || status) === "completed",
              status: serverRow?.status || status,
            }
          : x,
      ),
    });
    await runTaskAction({
      optimistic: () => setPlan(patchTo(nextStatus)),
      action: () => api.put(`/api/study/tasks/${t.id}`, { status: nextStatus }),
      onSuccess: (resp) => {
        if (resp && typeof resp === "object" && resp.id) {
          setPlan(patchTo(nextStatus, resp));
        }
      },
      rollback: () => setPlan(patchTo(wasStatus)),
      errorMessage: "Couldn't save task — try again.",
    });
  }

  async function updateStatus(t, status) {
    const wasStatus = t.status || (t.done ? "completed" : "planned");
    const patchTo = (s) => (p) => ({
      ...p,
      tasks: p.tasks.map((x) =>
        x.id === t.id ? { ...x, done: s === "completed", status: s } : x,
      ),
    });
    const result = await runTaskAction({
      optimistic: () => setPlan(patchTo(status)),
      action: () => api.put(`/api/study/tasks/${t.id}`, { status }),
      rollback: () => setPlan(patchTo(wasStatus)),
      errorMessage: "Couldn't update task — try again.",
    });
    if (result.ok) refetchPlan();
  }

  async function carryForward() {
    const result = await runTaskAction({
      action: () => api.post("/api/study/tasks/carry-forward", {}),
      successMessage: "Backlog carried forward.",
      errorMessage: "Couldn't carry forward backlog — try again.",
    });
    if (result.ok) refetchPlan();
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  // Compare on `YYYY-MM-DD` derived from each side's local timezone, not on
  // weekday-short. Parsing the backend's `YYYY-MM-DD` string with `new Date`
  // treats it as UTC midnight; asking for the local weekday near midnight
  // in IST/PST etc. shifted "Today" to the wrong tile.
  const todayLocalIso = (() => {
    const d = new Date();
    const tz = d.getTimezoneOffset() * 60000;
    return new Date(d.getTime() - tz).toISOString().slice(0, 10);
  })();
  const week = (focus.week || []).map((d) => {
    const isoDate = typeof d.date === "string" ? d.date.slice(0, 10) : "";
    // For the label, parse the date-only string as local (append T00:00:00
    // to anchor it) — otherwise UTC midnight is one day earlier in negative
    // offsets.
    const labelDate = isoDate ? new Date(`${isoDate}T00:00:00`) : new Date(d.date);
    const label = labelDate.toLocaleDateString("en-US", { weekday: "short" });
    return {
      label,
      hrs: Number(((d.minutes || 0) / 60).toFixed(1)),
      isToday: isoDate === todayLocalIso,
    };
  });
  const hasWeek = week.some((x) => x.hrs > 0);
  // Resolve a daily-hour target from whichever signal the backend provides.
  // Falls back to the weekly planned hours / 7, then to 7h as the visual
  // baseline. Per-day bars are scaled against this so a user on a 4h/day
  // plan no longer reads "75% of 7h" as their adherence.
  const dailyTargetHours = (() => {
    const explicit = Number(plan.plan?.daily_target_hours);
    if (Number.isFinite(explicit) && explicit > 0) return explicit;
    const weekly = Number(review?.hours_planned);
    if (Number.isFinite(weekly) && weekly > 0) return Math.round((weekly / 7) * 10) / 10;
    return 7;
  })();
  const hasReview =
    review &&
    ((review.hours_studied || 0) > 0 ||
      (review.planned_tasks || 0) > 0 ||
      (review.mocks_taken || 0) > 0 ||
      (review.corrections || []).length > 0);
  const done = tasks.filter((t) => t.done || t.status === "completed").length;
  const selectedExam = examItems.find((e) => e.id === selectedExamId);

  return (
    <div className="space-y-6" data-testid="study-plan-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}
      <Card>
        <SectionHeader eyebrow="Study OS setup" title="Choose your exam" />
        <div className="mt-3 flex flex-wrap gap-2">
          {examItems.map((e) => (
            <button key={e.id} type="button" onClick={() => chooseExam(e.id)} className={`btn ${selectedExamId === e.id ? "btn-primary" : "btn-secondary"}`}>
              {e.name} {e.planner_ready ? "• ready" : "• not ready"}
            </button>
          ))}
        </div>
        {!selectedExamId && <p className="text-sm text-clay-700 mt-2">Choose the exam you are preparing for.</p>}
        {selectedExam && !selectedExam.planner_ready && (
          <p className="text-sm text-amber-700 mt-2">Planner not ready — no locked topic coverage.</p>
        )}
      </Card>

      <PageHeader
        eyebrow="Study Plan · timeline &amp; adaptation"
        title={
          plan.plan
            ? `Day ${plan.plan?.day} · ${plan.plan?.theme || "Active plan"}`
            : "Your week, with every change traced."
        }
        sub={
          plan.plan
            ? "Plan telemetry is synced from your latest saved schedule. The plan only mutates after you preview and approve."
            : "Create or regenerate a study plan to start tracking progress."
        }
        right={
          <div className="text-right">
            <div className="mb-2 flex justify-end">
              <StatusDot state="live" label="" />
            </div>
            <button
              type="button"
              className="btn btn-primary"
              onClick={previewRegenerate}
              disabled={!selectedExamId}
              data-testid="preview-regenerate-btn"
            >
              <Sparkles className="h-3.5 w-3.5" /> Preview regenerated plan
            </button>
          </div>
        }
      />

      {/* Exam cycle timeline — full-cycle planned vs actual */}
      <ExamCycleTimeline />

      {/* Week timeline */}
      <Card padded={false}>
        <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4 flex-wrap">
          <div>
            <Eyebrow>This week · focus hours</Eyebrow>
            <h2 className="font-heading text-[24px] mt-1">
              {review?.hours_studied || 0}h{" "}
              <span className="text-clay-700 text-base">/ {review?.hours_planned || 0}h planned</span>
            </h2>
          </div>
          <Pill tone="sage">{Math.round((review?.adherence || 0) * 100)}% adherence</Pill>
        </div>
        <div className="hairline mx-7" />
        <div className="px-7 py-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
            {(week.length ? week : [{ label: "—", hrs: 0 }]).map((w, i) => (
              <DayCell key={`${w.label}-${i}`} d={w} target={dailyTargetHours} />
            ))}
          </div>
          {!hasWeek && (
            <div className="mt-3 text-xs text-clay-700">
              No focus sessions this week. Start a focus session to build your weekly curve.
            </div>
          )}
        </div>
      </Card>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        {/* Today's schedule */}
        <Card padded={false}>
          <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-4">
            <div>
              <Eyebrow>Today's schedule</Eyebrow>
              <h2 className="font-heading text-[22px] mt-1 leading-tight">{tasks.length} blocks</h2>
              <button type="button" className="text-[12px] mt-1 link-under text-clay-700" onClick={carryForward}>
                Carry forward backlog →
              </button>
            </div>
            <div className="num-mono text-[11.5px] text-clay-700">
              {done}/{tasks.length} done
            </div>
          </div>
          <div className="hairline mx-7" />
          <div className="px-7 pb-6 pt-2">
            {tasks.length ? (
              tasks.map((t) => {
                const status = t.status || "planned";
                const isDone = t.done || status === "completed";
                return (
                  <div key={t.id} className="task-row !grid-cols-[22px_70px_1fr_auto]">
                    <button
                      onClick={() => toggle(t)}
                      aria-label={isDone ? "Mark task incomplete" : "Mark task complete"}
                      className="mt-1.5 outline-none"
                    >
                      <span
                        className={`tick ${isDone ? "done" : ""} ${status === "skipped" ? "skip" : ""}`}
                      />
                    </button>
                    <div className="num-mono text-[12px] text-clay-700 pt-1">{t.time || "—"}</div>
                    <div>
                      <div
                        className={`text-[15px] leading-snug ${
                          isDone ? "line-through text-[#A68057]" : "text-clay-900 font-medium"
                        }`}
                      >
                        {t.title}
                      </div>
                      <div className="mt-2 flex flex-wrap gap-1.5 items-center">
                        <button
                          type="button"
                          aria-pressed={status === "in_progress"}
                          disabled={status === "in_progress"}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition ${
                            status === "in_progress"
                              ? "border-[#2E2218] bg-[#2E2218] text-[#F3EADB] cursor-default"
                              : "border-[#E7DECB] text-clay-700 hover:bg-clay-50"
                          }`}
                          onClick={() => updateStatus(t, "in_progress")}
                        >
                          In progress
                        </button>
                        <button
                          type="button"
                          aria-pressed={status === "skipped"}
                          disabled={status === "skipped"}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition ${
                            status === "skipped"
                              ? "border-[#2E2218] bg-[#2E2218] text-[#F3EADB] cursor-default"
                              : "border-[#E7DECB] text-clay-700 hover:bg-clay-50"
                          }`}
                          onClick={() => updateStatus(t, "skipped")}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          aria-pressed={status === "missed"}
                          disabled={status === "missed"}
                          className={`text-[11px] px-2.5 py-1 rounded-full border font-semibold transition ${
                            status === "missed"
                              ? "border-[#2E2218] bg-[#2E2218] text-[#F3EADB] cursor-default"
                              : "border-[#E7DECB] text-clay-700 hover:bg-clay-50"
                          }`}
                          onClick={() => updateStatus(t, "missed")}
                        >
                          Mark missed
                        </button>
                      </div>
                    </div>
                    <div className="pt-1.5">
                      <Pill tone={STATUS_TONE[status] || "outline"}>{status.replace("_", " ")}</Pill>
                    </div>
                  </div>
                );
              })
            ) : (
              <p className="py-6 text-sm text-clay-700">
                No tasks scheduled yet. Regenerate your plan to populate today's blocks.
              </p>
            )}
          </div>
        </Card>

        {/* Truth panel */}
        <Card className="!bg-[#2E2218] !border-[#2E2218]">
          <SectionHeader
            eyebrow="Truth panel · week"
            dark
            title={hasReview ? `Studied ${review.hours_studied != null ? review.hours_studied : "—"}h this week.` : "No weekly review data yet"}
          />
          <ul className="space-y-3 text-sm">
            {[
              {
                t: "Tasks completed",
                v: `${review?.completed_tasks || 0} / ${review?.planned_tasks || 0}`,
                good: (review?.task_completion_rate || 0) >= 0.7,
              },
              {
                t: "Mock score trend",
                v: review?.mock_trend?.length ? review.mock_trend.join(" · ") : "No mocks yet",
                good: (review?.mocks_taken || 0) > 0,
              },
              {
                t: "Revision backlog",
                v: review?.backlog_count != null ? `${review.backlog_count} topics` : "No backlog telemetry",
                good: (review?.backlog_count || 0) <= 3,
              },
              {
                t: "Revision coverage",
                v:
                  review?.revision_coverage == null
                    ? "Not available yet"
                    : `${Math.round(review.revision_coverage * 100)}%`,
                good: (review?.revision_coverage || 0) >= 0.7,
              },
            ].map((x, i) => (
              <li
                key={i}
                className="flex items-center justify-between pb-3 border-b border-[#6C5038]/40 last:border-0"
              >
                <span className="text-[#D6BC93]">{x.t}</span>
                <span className={`num-mono font-semibold ${x.good ? "text-sage-300" : "text-clay-300"}`}>
                  {x.v}
                </span>
              </li>
            ))}
          </ul>
          <div className="mt-4 pt-3 border-t border-[#6C5038]/40 text-[12.5px] text-[#D6BC93]">
            {(review?.corrections || [])[0] || "Complete tasks to generate correction insights."}
          </div>
        </Card>
      </div>

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        <PlanByTopic />
        <PlanChangeLogCard />
      </div>

      <Drawer
        open={draftOpen}
        onClose={() => setDraftOpen(false)}
        title={`Preview regenerated plan${selectedExam?.name ? ` · ${selectedExam.name}` : ""}`}
        width={520}
      >
        {draftLoading ? (
          <p className="text-sm text-clay-700">Computing draft plan…</p>
        ) : !draft ? (
          <p className="text-sm text-clay-700">No draft to preview.</p>
        ) : !draft.generated ? (
          <div className="space-y-3">
            <p className="text-sm text-clay-700">
              Cannot regenerate right now.
            </p>
            <p className="text-xs num-mono text-clay-700">{draft.reason || "unknown"}</p>
            {draft.reason === "no_locked_coverage" ? (
              <p className="text-[12px] text-clay-700">
                Locked topic coverage is required before the planner can produce a plan. Ask an
                admin to lock topics in /admin/exam-intelligence.
              </p>
            ) : null}
          </div>
        ) : (
          <DraftDiff
            draft={draft}
            onApply={applyDraft}
            applying={applying}
            applyDisabled={!selectedExamId || (selectedExam && !selectedExam.planner_ready)}
          />
        )}
      </Drawer>
    </div>
  );
}

function DraftDiff({ draft, onApply, applying, applyDisabled = false }) {
  const changes = draft.changes || { added: [], removed: [], unchanged_count: 0 };
  const risk = draft.risk_level || "low";
  const before = draft.before_tasks || [];
  const after = draft.after_tasks || [];
  return (
    <div className="space-y-5" data-testid="plan-draft-diff">
      <div className="flex flex-wrap items-center gap-2">
        <Pill tone="ink">{draft.exam_name || draft.exam || "Plan"}</Pill>
        <Pill tone={risk === "high" ? "rose" : risk === "medium" ? "amber" : "sage"}>
          {risk} risk
        </Pill>
        <Pill tone="dusk">{after.length} tasks</Pill>
        {draft.competition_pressure && draft.competition_pressure !== "unknown" ? (
          <Pill tone="clay">pressure · {draft.competition_pressure}</Pill>
        ) : null}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-3">
          <Eyebrow>Before</Eyebrow>
          <p className="text-[11.5px] text-clay-700 mt-1">{before.length} tasks</p>
          <ul className="mt-2 space-y-1">
            {before.length === 0 ? (
              <li className="text-[11.5px] text-clay-700">No active plan yet.</li>
            ) : (
              before.slice(0, 8).map((t) => (
                <li key={t.topic_id || t.title} className="text-[12px] text-clay-800">
                  · {t.title}
                </li>
              ))
            )}
          </ul>
        </div>
        <div className="rounded-xl border border-[#2E2218] bg-white/80 p-3">
          <Eyebrow>After</Eyebrow>
          <p className="text-[11.5px] text-clay-700 mt-1">{after.length} tasks</p>
          <ul className="mt-2 space-y-1">
            {after.slice(0, 8).map((t) => (
              <li key={t.topic_id || t.title} className="text-[12px] text-clay-800">
                · {t.title}
              </li>
            ))}
          </ul>
        </div>
      </div>

      <div>
        <Eyebrow>Changes</Eyebrow>
        <div className="mt-2 space-y-2 text-[12px]">
          <p>
            <span className="num-mono text-clay-700">added</span>{" "}
            <span className="text-sage-700 font-semibold">{changes.added_count}</span> ·{" "}
            <span className="num-mono text-clay-700">removed</span>{" "}
            <span className="text-rose-700 font-semibold">{changes.removed_count}</span> ·{" "}
            <span className="num-mono text-clay-700">unchanged</span>{" "}
            <span className="font-semibold">{changes.unchanged_count}</span>
          </p>
          {(changes.added || []).slice(0, 5).map((t) => (
            <div key={`a-${t.topic_id || t.title}`} className="text-clay-800">
              <ArrowRight className="inline h-3 w-3 text-sage-600" /> add · {t.title}
            </div>
          ))}
          {(changes.removed || []).slice(0, 5).map((t) => (
            <div key={`r-${t.topic_id || t.title}`} className="text-clay-700">
              · drop · {t.title}
            </div>
          ))}
        </div>
      </div>

      <DraftTimelinePreview timeline={draft.timeline} />

      <div className="flex justify-end gap-2 pt-2 border-t border-[#E7DECB]">
        <button
          type="button"
          className="btn btn-primary"
          onClick={onApply}
          disabled={applying || applyDisabled}
          data-testid="apply-draft-btn"
        >
          {applying ? "Applying…" : "Apply"}
        </button>
      </div>
    </div>
  );
}

// DraftTimelinePreview — only renders when the draft payload includes a
// timeline preview. We never invent these numbers; if the draft doesn't
// carry them, the section stays out of the drawer entirely.
function DraftTimelinePreview({ timeline }) {
  if (!timeline || typeof timeline !== "object") return null;
  const before = timeline.before_projected_completion;
  const after = timeline.after_projected_completion;
  const pressureChange = timeline.changed_phase_pressure;
  const moved = Array.isArray(timeline.subjects_moved_earlier)
    ? timeline.subjects_moved_earlier
    : [];
  const hasContent =
    before || after || pressureChange || moved.length > 0;
  if (!hasContent) return null;
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3">
      <Eyebrow>Cycle impact (preview)</Eyebrow>
      <ul className="mt-2 space-y-1.5 text-[12px] text-clay-800">
        {before || after ? (
          <li>
            Projected completion{" "}
            <span className="num-mono">{before || "—"}</span> →{" "}
            <span className="num-mono">{after || "—"}</span>
          </li>
        ) : null}
        {pressureChange ? (
          <li>
            Phase pressure shift ·{" "}
            <span className="num-mono">{pressureChange}</span>
          </li>
        ) : null}
        {moved.length ? (
          <li>
            Subjects moved earlier ·{" "}
            <span className="num-mono">{moved.join(", ")}</span>
          </li>
        ) : null}
      </ul>
    </div>
  );
}
