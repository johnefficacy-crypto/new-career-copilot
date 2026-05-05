import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, Sparkles, Zap } from "lucide-react";
import { api } from "../lib/api";

export default function StudyPlan() {
  const [plan, setPlan] = useState({ tasks: [], plan: null });

  useEffect(() => {
    api.get("/api/study/plan").then(setPlan).catch(() => {});
  }, []);

  const week = [
    { d: "Mon", hrs: 4.5 }, { d: "Tue", hrs: 5.2 }, { d: "Wed", hrs: 3.2 }, { d: "Thu", hrs: 6.1 },
    { d: "Fri", hrs: 4.8 }, { d: "Sat", hrs: 7.0 }, { d: "Sun", hrs: 0.5 },
  ];

  async function toggle(t) {
    const next = !t.done;
    setPlan((p) => ({ ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: next } : x)) }));
    await api.post("/api/study/plan/toggle", { task_id: t.id, done: next });
  }

  return (
    <div className="space-y-6" data-testid="study-plan-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Study OS · 90-day plan</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Day {plan.plan?.day || 41} · "{plan.plan?.theme || 'Arithmetic Sprint'}"</h1>
          <p className="text-muted-foreground mt-1">Your plan adapted yesterday after the Tue 4h gap. <a href="#" className="link-under font-semibold">Why changed →</a></p>
        </div>
        <button className="btn btn-primary"><Sparkles className="h-3.5 w-3.5" /> Regenerate with AI</button>
      </div>

      <div className="soft-card rounded-2xl p-5">
        <div className="flex items-baseline justify-between">
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">This week · adherence</div>
            <div className="font-heading text-2xl font-semibold mt-0.5">31.3h <span className="text-muted-foreground text-base">/ 35h planned</span></div>
          </div>
          <div className="text-xs font-semibold text-sage-600">89% adherence</div>
        </div>
        <div className="mt-5 flex items-end gap-3 h-40">
          {week.map((w) => (
            <div key={w.d} className="flex-1 flex flex-col items-center justify-end gap-2">
              <div className="w-full rounded-md bg-clay-100 overflow-hidden flex items-end" style={{ height: "100%" }}>
                <div className="w-full bg-clay-500" style={{ height: `${(w.hrs / 7) * 100}%` }} />
              </div>
              <div className="text-[10px] font-mono text-muted-foreground">{w.hrs}h</div>
              <div className="text-[11px] font-semibold uppercase tracking-wider">{w.d}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-5">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Today's schedule</div>
          <div className="font-heading text-xl font-semibold mt-0.5">{plan.tasks.length} blocks</div>
          <ul className="mt-4 space-y-2.5">
            {plan.tasks.map((t) => (
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
            <h3 className="mt-2 font-heading text-2xl font-semibold">You're on track for 10 June Tier I.</h3>
            <ul className="mt-5 space-y-3 text-sm">
              {[
                { t: "Quant — weak topics closed", v: "7 / 9", good: true },
                { t: "Mock score trend (last 5)", v: "+12 pts", good: true },
                { t: "Revision backlog", v: "4 topics", good: false },
                { t: "Sleep / focus ratio", v: "stable", good: true },
              ].map((x, i) => (
                <li key={i} className="flex items-center justify-between pb-3 border-b border-white/10 last:border-0">
                  <span className="text-dusk-100">{x.t}</span>
                  <span className={`font-mono font-semibold ${x.good ? "text-sage-300" : "text-clay-200"}`}>{x.v}</span>
                </li>
              ))}
            </ul>
            <div className="mt-5 pt-4 border-t border-white/10 text-[13px] inline-flex gap-2 items-start">
              <Zap className="h-4 w-4 text-clay-300 mt-0.5 shrink-0" />
              <span className="text-dusk-100">Next correction: spend Thu 2h closing Polity Ch.4 backlog.</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
