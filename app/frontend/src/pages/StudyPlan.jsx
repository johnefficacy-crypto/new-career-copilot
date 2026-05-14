import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";
import { Eyebrow, StatusDot } from "../shared/ui/studyos";

export default function StudyPlan() {
  const [plan, setPlan] = useState({ tasks: [], plan: null });
  const [focus, setFocus] = useState({ total_hours_7d: 0, week: [] });
  const [review, setReview] = useState(null);
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/study/plan").then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] })).catch((e) => { setErr("Study plan is temporarily unavailable."); if (process.env.NODE_ENV !== "production") console.error(e); });
    api.get("/api/study/focus/summary").then((d) => setFocus({ total_hours_7d: d?.total_hours_7d || 0, week: Array.isArray(d?.week) ? d.week : [] })).catch(() => setFocus({ total_hours_7d: 0, week: [] }));
    api.get("/api/study/weekly-review").then((d) => setReview(d || null)).catch(() => setReview(null));
  }, []);

  async function toggle(t) {
    const nextStatus = t.status === "completed" ? "planned" : "completed";
    setPlan((p) => ({ ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: nextStatus === "completed", status: nextStatus } : x)) }));
    await api.put(`/api/study/tasks/${t.id}`, { status: nextStatus });
  }
  async function updateStatus(t, status) {
    await api.put(`/api/study/tasks/${t.id}`, { status });
    await api.get("/api/study/plan").then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] }));
  }
  async function carryForward() {
    await api.post("/api/study/tasks/carry-forward", {});
    await api.get("/api/study/plan").then((d) => setPlan({ plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] }));
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const week = (focus.week || []).map((d) => ({ d: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }), hrs: Number(((d.minutes || 0) / 60).toFixed(1)) }));
  const hasWeek = week.some((x) => x.hrs > 0);
  const hasReview = review && ((review.hours_studied || 0) > 0 || (review.planned_tasks || 0) > 0 || (review.mocks_taken || 0) > 0 || (review.corrections || []).length > 0);

  return (
    <div className="space-y-6" data-testid="study-plan-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <Eyebrow>Study Plan · timeline &amp; adaptation</Eyebrow>
          <h1 className="font-heading text-[36px] leading-[1.05] mt-2">
            {plan.plan ? `Day ${plan.plan?.day} · ${plan.plan?.theme || "Active plan"}` : "Your week, with every change traced."}
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[64ch]">
            {plan.plan
              ? "Plan telemetry is synced from your latest saved schedule. The plan only mutates after you preview and approve."
              : "Create or regenerate a study plan to start tracking progress."}
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot state="live" label="" />
          <button className="btn btn-primary"><Sparkles className="h-3.5 w-3.5" /> Regenerate with AI</button>
        </div>
      </header>

      <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <Eyebrow>This week · adherence</Eyebrow>
            <div className="font-heading text-[24px] font-semibold mt-1">{review?.hours_studied || 0}h <span className="text-clay-700 text-base">/ {review?.hours_planned || 0}h planned</span></div>
          </div>
          <span className="pill pill-sage">{Math.round((review?.adherence || 0) * 100)}% adherence</span>
        </div>
        <div className="mt-5 flex items-end gap-3 h-40">
          {(week.length ? week : [{ d: "—", hrs: 0 }]).map((w) => (
            <div key={w.d} className="flex-1 flex flex-col items-center justify-end gap-2">
              <div className="w-full rounded-md bg-clay-100 overflow-hidden flex items-end" style={{ height: "100%" }}>
                <div className="w-full bg-clay-500" style={{ height: `${(w.hrs / 7) * 100}%` }} />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{w.hrs}h</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{w.d}</div>
            </div>
          ))}
        </div>
        {!hasWeek && <div className="mt-3 text-xs text-muted-foreground">No focus sessions this week. Start a focus session to build your weekly curve.</div>}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card grain relative overflow-hidden rounded-[18px] p-5">
          <Eyebrow>Today's schedule</Eyebrow>
          <div className="font-heading text-[20px] font-semibold mt-1">{tasks.length} blocks</div>
          <button type="button" className="text-xs mt-2 link-under" onClick={carryForward}>Carry forward backlog</button>
          <ul className="mt-4 space-y-2.5">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-clay-50 transition">
                <button onClick={() => toggle(t)}>
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-sage-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{t.time}</div>
                  <div className={`text-[15px] ${t.done ? "line-through text-muted-foreground" : "font-semibold"}`}>{t.title}</div>
                  <div className="text-[11px] text-muted-foreground">Status: {t.status || "planned"}</div>
                  <div className="mt-1 flex gap-2">
                    <button type="button" className="text-[11px] link-under" onClick={() => updateStatus(t, "skipped")}>Skip</button>
                    <button type="button" className="text-[11px] link-under" onClick={() => updateStatus(t, "missed")}>Mark missed</button>
                    <button type="button" className="text-[11px] link-under" onClick={() => updateStatus(t, "in_progress")}>In progress</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <div className="rounded-2xl bg-dusk-800 text-dusk-50 p-6 relative overflow-hidden">
          <div className="absolute -bottom-20 -right-10 h-60 w-60 rounded-full blur-3xl bg-sage-500/30" />
          <div className="relative">
            <div className="text-[11px] uppercase tracking-[0.22em] text-dusk-200 font-semibold">Truth Panel · week</div>
            <h3 className="mt-2 font-heading text-2xl font-semibold">{hasReview ? `Studied ${review.hours_studied || 0}h this week.` : "No weekly review data yet"}</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                { t: "Tasks completed", v: `${review?.completed_tasks || 0} / ${review?.planned_tasks || 0}`, good: (review?.task_completion_rate || 0) >= 0.7 },
                { t: "Mock score trend", v: review?.mock_trend?.length ? review.mock_trend.join(" · ") : "No mocks yet", good: (review?.mocks_taken || 0) > 0 },
                { t: "Revision backlog", v: review?.backlog_count != null ? `${review.backlog_count} topics` : "No backlog telemetry", good: (review?.backlog_count || 0) <= 3 },
                { t: "Revision coverage", v: review?.revision_coverage == null ? "Not available yet" : `${Math.round(review.revision_coverage * 100)}%`, good: (review?.revision_coverage || 0) >= 0.7 },
              ].map((x, i) => (
                <li key={i} className="flex items-center justify-between pb-3 border-b border-white/10 last:border-0">
                  <span className="text-dusk-100">{x.t}</span>
                  <span className={`font-mono font-semibold ${x.good ? "text-sage-300" : "text-clay-200"}`}>{x.v}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-4 border-t border-white/10 text-[13px] inline-flex gap-2 items-start">
              <Zap className="h-4 w-4 text-clay-300 mt-0.5 shrink-0" />
              <span className="text-dusk-100">{(review?.corrections || [])[0] || "Complete tasks to generate correction insights."}</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
