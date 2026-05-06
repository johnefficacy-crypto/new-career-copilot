import React, { useEffect, useState } from "react";
import { CheckCircle2, Circle, Clock, Target, Zap } from "lucide-react";
import { api } from "../lib/api";

export default function Today() {
  const [plan, setPlan] = useState({ tasks: [], plan: null, date: "" });
  const [err, setErr] = useState("");

  useEffect(() => {
    api.get("/api/study/plan").then((d) => setPlan({ date: d?.date || "", plan: d?.plan || null, tasks: Array.isArray(d?.tasks) ? d.tasks : [] })).catch((e) => { setErr("Could not load today's plan."); if (process.env.NODE_ENV !== "production") console.error(e); });
  }, []);

  async function toggle(t) {
    const next = !t.done;
    setPlan((p) => ({ ...p, tasks: p.tasks.map((x) => (x.id === t.id ? { ...x, done: next } : x)) }));
    try {
      await api.post("/api/study/plan/toggle", { task_id: t.id, done: next });
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }

  const tasks = Array.isArray(plan.tasks) ? plan.tasks : [];
  const done = tasks.filter((t) => t.done).length;

  return (
    <div className="space-y-6" data-testid="today-page">
      {err && <div className="text-xs text-clay-700">{err}</div>}
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Today · {plan.date}</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Today's plan</h1>
        <p className="text-muted-foreground mt-1">{done} of {tasks.length} tasks complete</p>
      </div>

      <div className="soft-card rounded-2xl p-6">
        <div className="flex items-center gap-3 text-sm">
          <Target className="h-4 w-4 text-clay-600" />
          <span className="font-semibold">{plan.plan?.theme}</span>
          <span className="text-muted-foreground">·</span>
          <span className="text-muted-foreground">{plan.plan?.target}</span>
        </div>
        <ul className="mt-5 space-y-2">
          {tasks.map((t) => (
            <li key={t.id} className="flex items-start gap-3 rounded-xl p-3 hover:bg-clay-50 transition">
              <button onClick={() => toggle(t)} data-testid={`toggle-${t.id}`} className="mt-0.5">
                {t.done ? <CheckCircle2 className="h-5 w-5 text-sage-500" /> : <Circle className="h-5 w-5 text-muted-foreground" />}
              </button>
              <div className="flex-1">
                <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-mono">{t.time}</div>
                <div className={`text-[15px] ${t.done ? "line-through text-muted-foreground" : "font-medium"}`}>{t.title}</div>
              </div>
            </li>
          ))}
        </ul>
      </div>

      <div className="soft-card rounded-2xl p-5 flex items-start gap-4">
        <Zap className="h-5 w-5 text-clay-500 mt-0.5" />
        <div>
          <div className="font-heading font-semibold">One thing today</div>
          <p className="text-sm text-muted-foreground mt-1">Close Polity Ch. 4 revision before 9pm. It's been carried forward twice.</p>
        </div>
      </div>
    </div>
  );
}
