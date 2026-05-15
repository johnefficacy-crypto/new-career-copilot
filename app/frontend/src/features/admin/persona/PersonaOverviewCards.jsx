import React from "react";
import { Eyebrow, StatusDot } from "../../../shared/ui/studyos";

const TONE_TEXT = {
  sage: "text-sage-700",
  clay: "text-clay-700",
  dusk: "text-dusk-700",
  ink: "text-clay-900",
};

function KpiCard({ label, value, hint, tone = "ink", state, testId }) {
  const display = value === null || value === undefined ? "—" : value;
  return (
    <div
      className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5"
      data-testid={testId || `admin-persona-card-${label}`}
    >
      <Eyebrow>{label}</Eyebrow>
      <div className={`font-heading text-[22px] mt-1.5 leading-none ${TONE_TEXT[tone] || TONE_TEXT.ink}`}>
        {display}
      </div>
      {hint ? <div className="text-[11px] text-clay-700 mt-2">{hint}</div> : null}
      {state ? (
        <div className="absolute top-3 right-3">
          <StatusDot state={state} label="" />
        </div>
      ) : null}
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
      <div className="soft-card grain relative overflow-hidden rounded-[18px] p-4 text-[12px] text-clay-700">
        No persona dimensions computed yet.
      </div>
    );
  }
  return (
    <div
      className="soft-card grain relative overflow-hidden rounded-[18px] p-5"
      data-testid="admin-persona-dimension-distribution"
    >
      <Eyebrow>Top persona dimensions</Eyebrow>
      <div className="mt-3 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {entries.map(([dimension, values]) => (
          <div key={dimension} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3">
            <div className="text-[12px] font-medium text-clay-900 capitalize">
              {dimension.replaceAll("_", " ")}
            </div>
            <div className="mt-2 flex flex-wrap gap-1">
              {Object.entries(values).map(([value, count]) => (
                <span
                  key={value}
                  className="pill pill-clay text-[10px]"
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
        <KpiCard
          label="Active Qs"
          value={questions.active ?? 0}
          hint={`${questions.inactive ?? 0} inactive`}
          tone="sage"
        />
        <KpiCard
          label="Answers · 24h"
          value={questions.answers_24h ?? 0}
          hint="Saved by users"
          tone="ink"
        />
        <KpiCard
          label="Snapshots · 24h"
          value={snapshots.computed_24h ?? 0}
          hint={`${snapshots.total ?? 0} total`}
          tone="sage"
          state="live"
        />
        <KpiCard
          label="Pending recompute"
          value={queue.pending ?? 0}
          hint={`${queue.completed_24h ?? 0} done 24h`}
          tone={queue.pending ? "clay" : "ink"}
          state={queue.pending ? "partial" : "live"}
        />
        <KpiCard
          label="Failed recompute"
          value={queue.failed ?? 0}
          tone={queue.failed ? "dusk" : "clay"}
          state={queue.failed ? "partial" : "live"}
        />
        <KpiCard
          label="Signals · 24h"
          value={signals.events_24h ?? 0}
          hint={`${signals.unprocessed ?? 0} unprocessed`}
          tone="ink"
        />
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
        <KpiCard
          label="High study-risk"
          value={risk.high_study_risk ?? 0}
          hint={`Score ≥ ${risk.threshold ?? 0.6}`}
          tone={risk.high_study_risk ? "dusk" : "clay"}
        />
        <KpiCard
          label="High dropoff-risk"
          value={risk.high_dropoff_risk ?? 0}
          hint={`Score ≥ ${risk.threshold ?? 0.6}`}
          tone={risk.high_dropoff_risk ? "dusk" : "clay"}
        />
        <KpiCard
          label="Stale snapshots"
          value={snapshots.stale ?? 0}
          hint="Older than 14 days"
          tone={snapshots.stale ? "dusk" : "clay"}
        />
        <KpiCard
          label="Policy generation"
          value={policy.generation_status ? policy.generation_status.replaceAll("_", " ") : "—"}
          hint={POLICY_HINT[policy.generation_status] || "Derived from snapshots"}
          tone={
            policy.generation_status === "ok"
              ? "sage"
              : policy.generation_status === "partial"
                ? "clay"
                : "dusk"
          }
          state={
            policy.generation_status === "ok"
              ? "live"
              : policy.generation_status === "partial"
                ? "partial"
                : "preview"
          }
        />
      </div>
      <DimensionDistribution distribution={dimensions.distribution} />
    </div>
  );
}
