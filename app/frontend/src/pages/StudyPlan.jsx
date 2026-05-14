import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import { api } from "../lib/api";
import { Card, Eyebrow, PageHeader, Pill, SectionHeader, StatusDot } from "../shared/ui/studyos";

const STATUS_TONE = {
  completed: "sage",
  in_progress: "ink",
  skipped: "dusk",
  missed: "rose",
  planned: "outline",
};

function DayCell({ d }) {
  const pct = Math.max(0, Math.min(100, Math.round((d.hrs / 7) * 100)));
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
        <div className="text-[10.5px] text-clay-700 mt-1 num-mono">{pct}% of 7h</div>
      </div>
    </div>
  );
}

export default function StudyPlan() {
  const [plan, setPlan] = useState({ tasks: [], plan: null });
  const [focus, setFocus] = useState({ total_hours_7d: 0, week: [] });
  const [review, setReview] = useState(null);
  const [err, setErr] = useState("");

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
  }, []);

  async function toggle(t) {
    const nextStatus = t.status === "completed" ? "planned" : "completed";
    setPlan((p) => ({
      ...p,
      tasks: p.tasks.map((x) =>
        x.id === t.id ? { ...x, done: nextStatus === "completed", status: nextStatus } : x,
      ),
    }));
    await api.put(`/api/study/tasks/${t.id}`, { status: nextStatus });
  }
  async function updateStatus(t, status) {
    await api.put(`/api/study/tasks/${t.id}`, { status });
    await api
      .get("/api/study/plan")
      .then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] }));
  }
  async function carryForward() {
    await api.post("/api/study/tasks/carry-forward", {});
    await api
      .get("/api/study/plan")
      .then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] }));
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const todayKey = new Date().toLocaleDateString("en-US", { weekday: "short" });
  const week = (focus.week || []).map((d) => {
    const label = new Date(d.date).toLocaleDateString("en-US", { weekday: "short" });
    return { label, hrs: Number(((d.minutes || 0) / 60).toFixed(1)), isToday: label === todayKey };
  });
  const hasWeek = week.some((x) => x.hrs > 0);
  const hasReview =
    review &&
    ((review.hours_studied || 0) > 0 ||
      (review.planned_tasks || 0) > 0 ||
      (review.mocks_taken || 0) > 0 ||
      (review.corrections || []).length > 0);
  const done = tasks.filter((t) => t.done || t.status === "completed").length;

  return (
    <div className="space-y-6" data-testid="study-plan-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}

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
            <button className="btn btn-primary">
              <Sparkles className="h-3.5 w-3.5" /> Regenerate with AI
            </button>
          </div>
        }
      />

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
              <DayCell key={`${w.label}-${i}`} d={w} />
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
                          className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
                          onClick={() => updateStatus(t, "in_progress")}
                        >
                          In progress
                        </button>
                        <button
                          type="button"
                          className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
                          onClick={() => updateStatus(t, "skipped")}
                        >
                          Skip
                        </button>
                        <button
                          type="button"
                          className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
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
            title={hasReview ? `Studied ${review.hours_studied || 0}h this week.` : "No weekly review data yet"}
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
    </div>
  );
}
