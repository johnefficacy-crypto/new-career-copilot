import React from "react";
import { BarChart3 } from "lucide-react";
import { StatusBadge, ConfidencePill, EmptyState } from "../../../shared/ui";

// exam_competition_metrics review surface.
//
// Lifecycle: draft -> pending_review -> reviewed -> locked -> rejected.
// `reviewed` or `locked` rows feed the planner via competition_context in
// Study OS (locked preferred over reviewed; see competition_context.py
// `_READABLE_STATUSES`). When `onReview` is passed the table renders
// lifecycle actions.
const TRANSITIONS = {
  draft: [{ to: "pending_review", label: "Send to review" }],
  pending_review: [
    { to: "reviewed", label: "Mark reviewed" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  reviewed: [
    { to: "locked", label: "Lock for planner", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
  ],
  locked: [{ to: "reviewed", label: "Unlock" }],
  rejected: [{ to: "draft", label: "Reset to draft" }],
};

function actionClasses(tone) {
  if (tone === "primary") {
    return "border-sage-300 bg-sage-50 text-sage-800 hover:bg-sage-100";
  }
  if (tone === "danger") {
    return "border-dusk-200 bg-dusk-50 text-dusk-800 hover:bg-dusk-100";
  }
  return "border-clay-200 text-clay-700 hover:bg-clay-50";
}

function fmtRatio(v) {
  if (v === null || v === undefined || v === "") return "—";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(4) : "—";
}

export default function CompetitionMetricsTable({ items, onReview, busyRowId }) {
  const rows = Array.isArray(items) ? items : [];
  const interactive = typeof onReview === "function";

  if (!rows.length) {
    return (
      <EmptyState
        icon={BarChart3}
        title="No competition metrics yet"
        description="Vacancy, applicant ratio, cutoff and difficulty-trend rows appear here once an operator adds reviewed competition analysis for an exam."
      />
    );
  }

  return (
    <div className="soft-card grain relative overflow-hidden rounded-[18px]" data-testid="competition-metrics-table">
      <table className="tbl">
        <thead>
          <tr>
            <th>Exam</th>
            <th className="right">Vacancy</th>
            <th className="right">Applicants</th>
            <th className="right">Selection ratio</th>
            <th className="right">Pressure</th>
            <th>Source basis</th>
            <th>Confidence</th>
            <th>Status</th>
            {interactive ? <th>Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((c) => {
            const transitions = TRANSITIONS[c.status] || [];
            const busy = busyRowId === c.id;
            return (
              <tr key={c.id} className="border-t border-clay-100 align-top">
                <td className="px-4 py-2 text-xs">{c.exam || c.exam_slug || "—"}</td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {c.vacancy_total ?? "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {c.applicant_count ?? "—"}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {fmtRatio(c.selection_ratio)}
                </td>
                <td className="px-4 py-2 text-right tabular-nums">
                  {c.competition_pressure_score ?? "—"}
                </td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {c.source_basis || "—"}
                </td>
                <td className="px-4 py-2">
                  <ConfidencePill value={c.confidence_score} />
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={c.status} />
                </td>
                {interactive ? (
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {transitions.length ? (
                        transitions.map((t) => (
                          <button
                            key={t.to}
                            type="button"
                            disabled={busy}
                            onClick={() => onReview(c, t.to)}
                            className={`text-[11px] rounded-full border px-2 py-1 disabled:opacity-50 ${actionClasses(
                              t.tone,
                            )}`}
                            data-testid={`competition-action-${c.id}-${t.to}`}
                          >
                            {busy ? "…" : t.label}
                          </button>
                        ))
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </div>
                  </td>
                ) : null}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
