import React from "react";
import { Sparkles } from "lucide-react";

// Renders the backend-generated `user_context.safe_user_explanation` list.
// These strings are aspirant-safe by contract — they never contain raw
// persona dimension labels, so they can be shown verbatim.
export default function SafeExplanationCard({ explanations }) {
  const list = Array.isArray(explanations) ? explanations.filter(Boolean) : [];
  if (!list.length) return null;
  return (
    <section className="soft-card rounded-2xl p-6" data-testid="safe-explanation-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        <Sparkles className="h-3.5 w-3.5" aria-hidden="true" /> Why your plan looks like this
      </div>
      <ul className="mt-3 space-y-1.5">
        {list.map((line, i) => (
          <li key={i} className="text-sm text-clay-800 flex gap-2">
            <span className="text-clay-400" aria-hidden="true">
              •
            </span>
            <span>{line}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}
