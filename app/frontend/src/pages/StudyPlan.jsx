import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";

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
    const next = !t.done;
    setPlan((p) => ({ ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: next } : x)) }));
    await api.post("/api/study/plan/toggle", { task_id: t.id, done: next });
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const week = (focus.week || []).map((d) => ({ d: new Date(d.date).toLocaleDateString("en-US", { weekday: "short" }), hrs: Number(((d.minutes || 0) / 60).toFixed(1)) }));
  const hasWeek = week.some((x) => x.hrs > 0);
  const hasReview = review && ((review.hours_studied || 0) > 0 || (review.planned_tasks || 0) > 0 || (review.mocks_taken || 0) > 0 || (review.corrections || []).length > 0);

  return (
    <div className="space-y-6" data-testid="study-plan-page">
      {err && <div className="text-xs text-clay-700">{err}</div>}
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Study OS · 90-day plan</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">
            {plan.plan ? `Day ${plan.plan?.day} · "${plan.plan?.theme || "Active plan"}"` : "No active study plan yet"}
          </h1>
          <p className="text-muted-foreground mt-1">{plan.plan ? "Plan telemetry is synced from your latest saved schedule." : "Create or regenerate a study plan to start tracking progress."}</p>
        </div>
        <button className="btn btn-primary"><Sparkles className="h-3.5 w-3.5" /> Regenerate with AI</button>
      </div>

      <div className="soft-card rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">This week · adherence</div>
            <div className="font-heading text-2xl font-semibold mt-0.5">{review?.hours_studied || 0}h <span className="text-muted-foreground text-base">/ {review?.hours_planned || 0}h planned</span></div>
          </div>
          <div className="text-xs font-semibold text-sage-600">{Math.round((review?.adherence || 0) * 100)}% adherence</div>
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
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Today's schedule</div>
          <div className="font-heading text-xl font-semibold mt-0.5">{tasks.length} blocks</div>
          <ul className="mt-4 space-y-2.5">
            {tasks.map((t) => (
              <li key={t.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-clay-50 transition">
                <button onClick={() => toggle(t)}>
                  {t.done ? <CheckCircle2 className="h-5 w-5 text-sage-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
                </button>
                <div className="flex-1">
                  <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{t.time}</div>
                  <div className={`text-[15px] ${t.done ? "line-through text-muted-foreground" : "font-semibold"}`}>{t.title}</div>
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
