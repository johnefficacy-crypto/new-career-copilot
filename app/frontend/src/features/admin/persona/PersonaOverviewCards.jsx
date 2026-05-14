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

const POLICY_HINT = {
  ok: "Every snapshot has a derived policy",
  partial: "Some snapshots lack a derived policy",
  missing: "No snapshots have a derived policy",
  no_data: "No snapshots computed yet",
};

function DimensionDistribution({ distribution }) {
  const entries = Object.entries(distribution || {});
  if (!entries.length) {
    return (
      <div className="soft-card rounded-2xl p-4 text-xs text-muted-foreground">
        No persona dimensions computed yet.
      </div>
    );
  }
  return (
    <div className="soft-card rounded-2xl p-4" data-testid="admin-persona-dimension-distribution">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        Top persona dimensions
      </div>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([dimension, values]) => (
          <div key={dimension}>
            <div className="text-xs font-medium text-clay-800">
              {dimension.replaceAll("_", " ")}
            </div>
            <div className="mt-1 flex flex-wrap gap-1">
              {Object.entries(values).map(([value, count]) => (
                <span
                  key={value}
                  className="pill text-[10px] uppercase tracking-wider bg-clay-50 text-clay-700 px-2 py-0.5 rounded-full"
                >
                  {value.replaceAll("_", " ")} · {count}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export default function PersonaOverviewCards({ overview }) {
  const o = overview || {};
  const snapshots = o.snapshots || {};
  const questions = o.questions || {};
  const queue = o.queue || {};
  const signals = o.signals || {};
  const risk = o.risk || {};
  const policy = o.policy || {};
  const dimensions = o.dimensions || {};
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <Card label="Active Qs" value={questions.active ?? 0} hint={`${questions.inactive ?? 0} inactive`} />
        <Card label="Answers · 24h" value={questions.answers_24h ?? 0} hint="Saved by users" />
        <Card label="Snapshots · 24h" value={snapshots.computed_24h ?? 0} hint={`${snapshots.total ?? 0} total`} accent="sage" />
        <Card label="Pending recompute" value={queue.pending ?? 0} hint={`${queue.completed_24h ?? 0} completed 24h`} />
        <Card label="Failed recompute" value={queue.failed ?? 0} accent={queue.failed ? "dusk" : "clay"} />
        <Card label="Signals · 24h" value={signals.events_24h ?? 0} hint={`${signals.unprocessed ?? 0} unprocessed`} />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <Card
          label="High study-risk"
          value={risk.high_study_risk ?? 0}
          hint={`Score ≥ ${risk.threshold ?? 0.6}`}
          accent={risk.high_study_risk ? "dusk" : "clay"}
        />
        <Card
          label="High dropoff-risk"
          value={risk.high_dropoff_risk ?? 0}
          hint={`Score ≥ ${risk.threshold ?? 0.6}`}
          accent={risk.high_dropoff_risk ? "dusk" : "clay"}
        />
        <Card
          label="Stale snapshots"
          value={snapshots.stale ?? 0}
          hint="Older than 14 days"
          accent={snapshots.stale ? "dusk" : "clay"}
        />
        <Card
          label="Policy generation"
          value={policy.generation_status ? policy.generation_status.replaceAll("_", " ") : "—"}
          hint={POLICY_HINT[policy.generation_status] || "Derived from snapshots"}
          accent={
            policy.generation_status === "ok"
              ? "sage"
              : policy.generation_status === "partial"
                ? "clay"
                : "dusk"
          }
        />
      </div>
      <DimensionDistribution distribution={dimensions.distribution} />
    </div>
  );
}
