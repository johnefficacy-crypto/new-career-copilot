import React from "react";
import { Eyebrow, Pill, StudyCard } from "../../../shared/ui/studyos";

// Renders the backend-generated `user_context.safe_user_explanation` list.
// These strings are aspirant-safe by contract — they never contain raw
// persona dimension labels, so they can be shown verbatim as signal pills.
//
// Each entry may be a plain string OR an object `{label, tone}` from the
// backend. When the backend specifies a tone we honour it; otherwise we
// fall back to a neutral "sage" pill for every entry. The earlier
// alternating tone by array index made the same signal flip colour
// whenever the backend reordered the list, defeating colour-coding.
export default function SafeExplanationCard({ explanations }) {
  const list = (Array.isArray(explanations) ? explanations : [])
    .map((entry) => {
      if (entry == null) return null;
      if (typeof entry === "string") return { label: entry, tone: "sage" };
      const label = entry.label || entry.message || entry.text;
      if (!label) return null;
      return { label, tone: entry.tone || "sage" };
    })
    .filter(Boolean);
  if (!list.length) return null;
  return (
    <StudyCard data-testid="safe-explanation-card">
      <Eyebrow>What changed and why</Eyebrow>
      <h2 className="font-heading text-[22px] mt-1.5 leading-snug max-w-[64ch]">
        Your plan reflects these signals.
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {list.map((entry, i) => (
          <Pill key={`${entry.label.slice(0, 48)}-${i}`} tone={entry.tone}>
            {entry.label}
          </Pill>
        ))}
      </div>
      <div className="rule mt-5 pt-3 text-[11.5px] text-clay-700">
        We show the <em>signals</em> that shaped today's plan — never internal persona labels.
        Tap any task below to see the exact reasoning.
      </div>
    </StudyCard>
  );
}
