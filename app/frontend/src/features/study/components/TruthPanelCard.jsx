import React from "react";
import { Eye } from "lucide-react";

export default function TruthPanelCard({ panel }) {
  const summary =
    panel?.summary || "Not enough data yet to summarise your week.";
  const warnings = Array.isArray(panel?.warnings) ? panel.warnings : [];
  const corrections = Array.isArray(panel?.corrections) ? panel.corrections : [];

  return (
    <section
      className="soft-card rounded-2xl p-5"
      data-testid="truth-panel"
      aria-labelledby="truth-panel-heading"
    >
      <div className="flex items-start gap-3">
        <Eye className="h-5 w-5 text-clay-500 mt-0.5" aria-hidden="true" />
        <div className="flex-1">
          <h2
            id="truth-panel-heading"
            className="font-heading font-semibold text-base"
          >
            What the data shows
          </h2>
          <p className="text-sm text-muted-foreground mt-1">{summary}</p>
          {warnings.length ? (
            <ul className="mt-3 space-y-1 text-xs">
              {warnings.map((w, i) => (
                <li
                  key={`warn-${i}`}
                  className="rounded-xl bg-dusk-50 text-dusk-800 px-3 py-2"
                >
                  {w}
                </li>
              ))}
            </ul>
          ) : null}
          {corrections.length ? (
            <ul className="mt-2 space-y-1 text-xs">
              {corrections.map((c, i) => (
                <li
                  key={`corr-${i}`}
                  className="rounded-xl bg-clay-50 text-clay-800 px-3 py-2"
                >
                  {typeof c === "string" ? c : c?.message || ""}
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </section>
  );
}
