import React from "react";
import { Eyebrow, Pill, StudyCard } from "../../../shared/ui/studyos";

// Renders the backend-generated `user_context.safe_user_explanation` list.
// These strings are aspirant-safe by contract — they never contain raw
// persona dimension labels, so they can be shown verbatim as signal pills.
export default function SafeExplanationCard({ explanations }) {
  const list = Array.isArray(explanations) ? explanations.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <StudyCard data-testid="safe-explanation-card">
      <Eyebrow>What changed and why</Eyebrow>
      <h2 className="font-heading text-[22px] mt-1.5 leading-snug max-w-[64ch]">
        Your plan reflects these signals.
      </h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {list.map((line, i) => (
          <Pill key={i} tone={i % 2 === 0 ? "sage" : "clay"}>
            {line}
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
