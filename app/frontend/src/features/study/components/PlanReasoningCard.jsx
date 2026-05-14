import React from "react";
import { GitBranch } from "lucide-react";

// Renders `plan_reasoning` — each entry is tagged with a reason_type so the
// persona / exam / progress / update signal channels stay visually separate.
const REASON_META = {
  persona: { label: "Persona", tone: "pill-dusk" },
  exam_intelligence: { label: "Exam intelligence", tone: "pill-sage" },
  progress: { label: "Progress", tone: "pill-clay" },
  update: { label: "Update", tone: "pill-amber" },
};

export default function PlanReasoningCard({ reasoning }) {
  const list = Array.isArray(reasoning)
    ? reasoning.filter((r) => r && r.summary)
    : [];
  if (!list.length) return null;
  return (
    <section className="soft-card rounded-2xl p-6" data-testid="plan-reasoning-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        <GitBranch className="h-3.5 w-3.5" aria-hidden="true" /> What shaped today's plan
      </div>
      <ul className="mt-3 space-y-2">
        {list.map((r, i) => {
          const meta = REASON_META[r.reason_type] || {
            label: r.reason_type || "Signal",
            tone: "pill-dusk",
          };
          return (
            <li key={i} className="flex items-start gap-2 text-sm">
              <span
                className={`pill ${meta.tone} text-[10px] uppercase tracking-wider shrink-0`}
              >
                {meta.label}
              </span>
              <span className="text-clay-800">{r.summary}</span>
            </li>
          );
        })}
      </ul>
    </section>
  );
}
