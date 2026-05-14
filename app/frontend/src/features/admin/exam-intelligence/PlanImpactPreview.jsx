import React, { useState } from "react";
import { Info, ArrowRight } from "lucide-react";
import { StatusBadge } from "../../../shared/ui";

// Static, read-only preview of how verified exam intelligence would change a
// Study OS plan BEFORE it is rolled out to aspirants. No backend writes, no
// planner mutation. The before/after example is rendered from a fixed sample
// fixture — not a live user — so admins can reason about impact safely.
const SAMPLE = {
  exam: "SSC CGL 2026 · Tier 1",
  risk_level: "low",
  affected_topics: [
    { topic: "Percentage", change: "priority_score 70 → 84, status reviewed → locked" },
    { topic: "Data Interpretation", change: "newly locked as high-yield" },
  ],
  affected_cohorts: [
    "Repeaters targeting SSC CGL Tier 1",
    "Working professionals with < 10h/week availability",
  ],
  before_plan: [
    "40 min Concept · Quant · Ratio & Proportion",
    "30 min Revision · English · Vocabulary",
    "45 min Mock review (optional)",
  ],
  after_plan: [
    "35 min Retrieval Quiz · Quant · Percentage  (locked high-yield)",
    "30 min Mock correction · Quant  (required before next mock)",
    "25 min Revision · English · Vocabulary",
  ],
};

const DECISIONS = [
  { value: "hold", label: "Hold for more evidence" },
  { value: "stage", label: "Stage for rollout" },
  { value: "approve", label: "Approve for Study OS" },
];

export default function PlanImpactPreview({ sample = SAMPLE }) {
  // Local-only — this preview never persists a decision.
  const [decision, setDecision] = useState("hold");

  return (
    <div className="space-y-3" data-testid="plan-impact-preview">
      <div className="soft-card rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-dusk-600 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <div className="font-semibold">Static preview — no writes</div>
          <p className="text-muted-foreground mt-1">
            This shows how locking exam intelligence would reshape a study
            plan. The before/after example uses a fixed sample, not a live
            aspirant. Nothing here mutates the planner or persists a decision.
          </p>
        </div>
      </div>

      <section className="soft-card rounded-2xl p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Affected exam
            </div>
            <div className="mt-1 font-medium">{sample.exam}</div>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">Risk level</span>
            <StatusBadge
              status={sample.risk_level === "low" ? "ready" : "needs_review"}
              label={`${sample.risk_level} risk`}
            />
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Affected topics
          </div>
          <ul className="mt-2 space-y-1">
            {sample.affected_topics.map((t) => (
              <li key={t.topic} className="text-sm">
                <span className="font-medium">{t.topic}</span>
                <span className="text-muted-foreground"> — {t.change}</span>
              </li>
            ))}
          </ul>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Affected user cohorts
          </div>
          <div className="mt-2 flex flex-wrap gap-1">
            {sample.affected_cohorts.map((c) => (
              <span key={c} className="pill pill-clay"><span>{c}</span></span>
            ))}
          </div>
        </div>

        <div className="grid md:grid-cols-2 gap-3">
          <div className="rounded-xl bg-clay-50 p-3">
            <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
              Before
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {sample.before_plan.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
          <div className="rounded-xl bg-sage-50 p-3">
            <div className="flex items-center gap-1 text-[10px] uppercase tracking-wider text-sage-700 font-semibold">
              After <ArrowRight className="h-3 w-3" aria-hidden="true" />
            </div>
            <ul className="mt-2 space-y-1 text-xs">
              {sample.after_plan.map((line, i) => (
                <li key={i}>• {line}</li>
              ))}
            </ul>
          </div>
        </div>

        <div>
          <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Review decision (local only)
          </div>
          <div className="mt-2 flex flex-wrap gap-3">
            {DECISIONS.map((d) => (
              <label key={d.value} className="flex items-center gap-1.5 text-sm">
                <input
                  type="radio"
                  name="plan-impact-decision"
                  value={d.value}
                  checked={decision === d.value}
                  onChange={() => setDecision(d.value)}
                />
                {d.label}
              </label>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Selecting a decision here does nothing yet — wiring this to a
            real rollout gate is a later phase.
          </p>
        </div>
      </section>
    </div>
  );
}
