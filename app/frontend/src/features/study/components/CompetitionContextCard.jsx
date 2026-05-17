import React from "react";
import { Users } from "lucide-react";
import { StatusBadge } from "../../../shared/ui";

// Renders the `competition_context` block from mission-control. Backend
// reads only `locked`/`reviewed` exam_competition_metrics rows, so anything
// shown here is reviewed intelligence — never a silent estimate.
const PRESSURE_STATUS = {
  high: "needs_review",
  medium: "partial",
  low: "ready",
  unknown: "not_connected",
};

// Explicit labels so the badge no longer renders "unknown pressure" — which
// reads ambiguously (is pressure unknown, or "unknown" the pressure level?).
const PRESSURE_LABEL = {
  high: "High competition",
  medium: "Medium competition",
  low: "Low competition",
  unknown: "Pressure not measured",
};

function fmtInt(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return Number.isFinite(n) ? n.toLocaleString() : null;
}

function fmtRatio(v) {
  if (v === null || v === undefined) return null;
  const n = Number(v);
  if (!Number.isFinite(n) || n <= 0 || n > 1) return null;
  // "1 in N" only makes intuitive sense for sparse selection ratios. Past
  // ~10% the integer rounding produces noise ("1 in 2", "1 in 1") and is
  // misleading; fall back to a percent display so callers always see a
  // calibrated value.
  if (n >= 0.1) {
    const pct = Math.round(n * 100);
    return `${pct}% select`;
  }
  return `1 in ${Math.round(1 / n).toLocaleString()}`;
}

export default function CompetitionContextCard({ competitionContext }) {
  const cc = competitionContext || {};
  const pressure = cc.cycle_pressure || {};
  const level = pressure.pressure_level || "unknown";

  if (!cc.available) {
    return (
      <section className="soft-card rounded-2xl p-6" data-testid="competition-context-card">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          <Users className="h-3.5 w-3.5" aria-hidden="true" /> Competition intelligence
        </div>
        <p className="mt-2 text-sm text-muted-foreground">
          No reviewed competition data for this exam yet — vacancy, applicant
          ratio and difficulty trends appear here once an operator locks them.
        </p>
      </section>
    );
  }

  const vacancy = fmtInt(cc.vacancy_total);
  const applicants = fmtInt(cc.applicant_count);
  const ratio = fmtRatio(cc.selection_ratio);
  const difficulty = cc.difficulty_trend || {};
  const stats = [
    vacancy ? { k: "Vacancies", v: vacancy } : null,
    applicants ? { k: "Applicants", v: applicants } : null,
    ratio ? { k: "Selection odds", v: ratio } : null,
    difficulty.expected_difficulty
      ? { k: "Difficulty trend", v: String(difficulty.expected_difficulty).replace(/_/g, " ") }
      : null,
  ].filter(Boolean);

  return (
    <section className="soft-card rounded-2xl p-6" data-testid="competition-context-card">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          <Users className="h-3.5 w-3.5" aria-hidden="true" /> Competition intelligence
        </div>
        <StatusBadge
          status={PRESSURE_STATUS[level] || "not_connected"}
          label={PRESSURE_LABEL[level] || PRESSURE_LABEL.unknown}
        />
      </div>

      {stats.length ? (
        <dl className="mt-3 grid grid-cols-2 sm:grid-cols-4 gap-3">
          {stats.map((s) => (
            <div key={s.k}>
              <dt className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                {s.k}
              </dt>
              <dd className="text-sm font-medium mt-0.5 tabular-nums">{s.v}</dd>
            </div>
          ))}
        </dl>
      ) : null}

      {pressure.reason ? (
        <p className="mt-3 text-sm text-clay-800">{pressure.reason}</p>
      ) : null}

      <p className="mt-2 text-[11px] text-muted-foreground">
        Reviewed competition intelligence — adjusts plan intensity, never
        shown as a deadline or a guarantee.
      </p>
    </section>
  );
}
