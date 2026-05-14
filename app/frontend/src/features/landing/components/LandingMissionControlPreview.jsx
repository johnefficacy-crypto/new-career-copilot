import React from "react";
import { Zap, CheckCircle2, Circle, Cpu, BadgeCheck } from "lucide-react";

// Static homepage preview of the Study OS "Today" mission control.
// All data below is a fixed, fictional sample — this component never
// calls /api/study/mission-control or any private endpoint.
const SAMPLE = {
  nextAction: {
    title: "Review Mock 13 before starting new topics",
    reason: "Your last mock is logged but unreviewed — review lifts the next score most.",
  },
  tasks: [
    { id: "s1", time: "07:00", title: "Polity Ch.4 — retrieval drill", done: true },
    { id: "s2", time: "10:30", title: "Quant — ratio & percentage set", done: false },
    { id: "s3", time: "18:00", title: "Mock 13 — wrong-answer review", done: false },
  ],
  truth: {
    improved: "Morning consistency up",
    declined: "Mock review latency up",
  },
  trace: ["Your signals", "Exam intelligence", "Plan engine"],
  signals: ["Official notification", "Verified PYQ trend"],
};

export default function LandingMissionControlPreview() {
  return (
    <div
      className="soft-card rounded-3xl p-6 space-y-5"
      data-testid="landing-mission-control-preview"
      aria-label="Sample Study OS mission control preview"
    >
      <div className="flex items-center justify-between">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">
          Today · Study OS Mission Control
        </div>
        <span className="pill pill-dusk text-[10px]">Sample preview</span>
      </div>

      {/* Next best action */}
      <div className="rounded-2xl bg-dusk-900 text-white p-4">
        <div className="flex items-start gap-3">
          <Zap className="h-4 w-4 text-clay-300 mt-0.5" aria-hidden="true" />
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-white/60 font-semibold">
              Next best action
            </div>
            <div className="font-heading font-semibold text-[15px] mt-1">
              {SAMPLE.nextAction.title}
            </div>
            <p className="text-[12px] text-white/70 mt-1">{SAMPLE.nextAction.reason}</p>
          </div>
        </div>
      </div>

      {/* Today's tasks */}
      <div>
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Today's tasks
        </div>
        <ul className="mt-2 space-y-1.5">
          {SAMPLE.tasks.map((t) => (
            <li key={t.id} className="flex items-center gap-2.5 text-sm">
              {t.done ? (
                <CheckCircle2 className="h-4 w-4 text-sage-500" aria-hidden="true" />
              ) : (
                <Circle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
              )}
              <span className="font-mono text-[10px] text-muted-foreground">{t.time}</span>
              <span className={t.done ? "line-through text-muted-foreground" : ""}>
                {t.title}
              </span>
            </li>
          ))}
        </ul>
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        {/* Truth panel */}
        <div className="rounded-2xl bg-clay-50 border border-clay-100 p-3">
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            What the data shows
          </div>
          <div className="mt-2 text-[12px] text-sage-700">↑ {SAMPLE.truth.improved}</div>
          <div className="text-[12px] text-clay-700">↓ {SAMPLE.truth.declined}</div>
        </div>
        {/* Engine trace */}
        <div className="rounded-2xl bg-clay-50 border border-clay-100 p-3">
          <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            <Cpu className="h-3 w-3" aria-hidden="true" /> Engine trace
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-1 text-[11px] text-foreground/70">
            {SAMPLE.trace.map((step, i) => (
              <span key={step}>
                {step}
                {i < SAMPLE.trace.length - 1 ? <span className="text-clay-400"> → </span> : null}
              </span>
            ))}
          </div>
        </div>
      </div>

      {/* Verified signal badges */}
      <div className="flex flex-wrap gap-2 pt-1">
        {SAMPLE.signals.map((s) => (
          <span key={s} className="pill pill-sage text-[11px]">
            <BadgeCheck className="h-3.5 w-3.5" aria-hidden="true" /> {s}
          </span>
        ))}
      </div>
    </div>
  );
}
