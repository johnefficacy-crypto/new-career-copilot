import React from "react";
import { Eyebrow, StudyCard, StatusDot } from "../../../shared/ui/studyos";

// Renders `plan_reasoning` — each entry is tagged with a reason_type so the
// persona / exam / competition / policy / progress signal channels stay
// visually separate. Styled after the prototype's PlanReasoningCard.
const REASON_LABEL = {
  persona: "Persona",
  exam_intelligence: "Exam intelligence",
  competition_pressure: "Competition",
  policy_update: "Policy update",
  progress: "Progress",
  update: "Update",
};

export default function PlanReasoningCard({ reasoning }) {
  const list = Array.isArray(reasoning) ? reasoning.filter((r) => r && r.summary) : [];
  if (!list.length) return null;
  return (
    <StudyCard data-testid="plan-reasoning-card">
      <div className="flex items-end justify-between gap-4 mb-3">
        <div>
          <Eyebrow>Plan reasoning</Eyebrow>
          <h2 className="font-heading text-[18px] mt-1 leading-tight">
            What shaped today's plan.
          </h2>
        </div>
        <StatusDot state="live" label="" />
      </div>
      <ul className="space-y-2">
        {list.map((r, i) => {
          const label = REASON_LABEL[r.reason_type] || r.reason_type || "Signal";
          return (
            <li key={i} className="flex items-start gap-3 text-[13px]">
              <span className="sdot sdot-live mt-1.5" aria-hidden="true" />
              <span className="flex-1 text-clay-800">{r.summary}</span>
              <span className="num-mono text-[10px] text-clay-700 mt-1 shrink-0">{label}</span>
            </li>
          );
        })}
      </ul>
    </StudyCard>
  );
}
