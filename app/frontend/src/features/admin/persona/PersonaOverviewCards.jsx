import React from "react";

function Card({ label, value, hint, accent = "clay" }) {
  const accentClass =
    accent === "sage"
      ? "text-sage-600"
      : accent === "dusk"
        ? "text-dusk-600"
        : "text-clay-600";
  return (
    <div className="soft-card rounded-2xl p-4" data-testid={`admin-persona-card-${label}`}>
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className={`mt-1 font-heading text-2xl font-semibold ${accentClass}`}>
        {value === null || value === undefined ? "—" : value}
      </div>
      {hint ? <div className="mt-1 text-xs text-muted-foreground">{hint}</div> : null}
    </div>
  );
}

export default function PersonaOverviewCards({ overview }) {
  const o = overview || {};
  const snapshots = o.snapshots || {};
  const questions = o.questions || {};
  const queue = o.queue || {};
  const signals = o.signals || {};
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      <Card label="Active Qs" value={questions.active ?? 0} hint={`${questions.inactive ?? 0} inactive`} />
      <Card label="Answers · 24h" value={questions.answers_24h ?? 0} hint="Saved by users" />
      <Card label="Snapshots · 24h" value={snapshots.computed_24h ?? 0} hint={`${snapshots.total ?? 0} total`} accent="sage" />
      <Card label="Pending recompute" value={queue.pending ?? 0} hint={`${queue.completed_24h ?? 0} completed 24h`} />
      <Card label="Failed recompute" value={queue.failed ?? 0} accent={queue.failed ? "dusk" : "clay"} />
      <Card label="Signals · 24h" value={signals.events_24h ?? 0} hint={`${signals.unprocessed ?? 0} unprocessed`} />
    </div>
  );
}
