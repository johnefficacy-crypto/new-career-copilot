import React from "react";

export default function StudyMetricCard({ label, value, hint, accent = "clay" }) {
  const accentClass =
    accent === "sage"
      ? "text-sage-600"
      : accent === "dusk"
        ? "text-dusk-600"
        : "text-clay-600";
  return (
    <div className="soft-card rounded-2xl p-4" data-testid={`metric-${label}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`mt-1 font-heading text-2xl font-semibold ${accentClass}`}>
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
      {hint ? (
        <div className="mt-1 text-xs text-muted-foreground">{hint}</div>
      ) : null}
    </div>
  );
}
