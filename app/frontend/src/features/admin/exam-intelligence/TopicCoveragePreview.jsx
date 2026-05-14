import React from "react";
import { Lock, Info } from "lucide-react";
import { StatusBadge, ConfidencePill, EmptyState } from "../../../shared/ui";

// exam_topic_coverage review surface.
//
// Coverage lifecycle: draft -> pending_review -> reviewed -> locked -> rejected
// Only `locked` rows are eligible for the Study OS planner. When `onReview` is
// passed the table renders lifecycle actions; without it the table stays
// read-only.

// Sensible next transitions per current status. Operators can still walk a
// row back (e.g. locked -> reviewed) — the backend allows any target state.
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

export default function TopicCoveragePreview({ items, onReview, busyRowId }) {
  const rows = Array.isArray(items) ? items : [];
  const interactive = typeof onReview === "function";

  return (
    <div className="space-y-3" data-testid="topic-coverage-preview">
      <div className="soft-card rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-dusk-600 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <div className="font-semibold">
            {interactive ? "Topic coverage review" : "Read-only preview"}
          </div>
          <p className="text-muted-foreground mt-1">
            Topic coverage converts verified syllabus and PYQ evidence into
            planner-ready topic scores. Only rows with status{" "}
            <span className="font-mono">locked</span> reach the Study OS
            planner — <span className="font-mono">draft</span>,{" "}
            <span className="font-mono">pending_review</span>,{" "}
            <span className="font-mono">reviewed</span> and{" "}
            <span className="font-mono">rejected</span> rows never reach an
            aspirant.
          </p>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={Lock}
          title="No topic coverage yet"
          description="Verified syllabus mentions and PYQ tags are aggregated into exam_topic_coverage. Rows appear here once that data exists for the selected exam."
        />
      ) : (
        <div className="soft-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm" data-testid="topic-coverage-table">
            <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">Exam</th>
                <th className="text-left px-4 py-2">Phase</th>
                <th className="text-left px-4 py-2">Subject</th>
                <th className="text-left px-4 py-2">Topic</th>
                <th className="text-left px-4 py-2">Depth</th>
                <th className="text-left px-4 py-2">Difficulty</th>
                <th className="text-right px-4 py-2">Priority</th>
                <th className="text-left px-4 py-2">High yield</th>
                <th className="text-left px-4 py-2">Confidence</th>
                <th className="text-right px-4 py-2">Evidence</th>
                <th className="text-left px-4 py-2">Status</th>
                {interactive ? (
                  <th className="text-left px-4 py-2">Actions</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => {
                const transitions = TRANSITIONS[c.status] || [];
                const busy = busyRowId === c.id;
                return (
                  <tr key={c.id} className="border-t border-clay-100 align-top">
                    <td className="px-4 py-2 text-xs">{c.exam || c.exam_slug || "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">{c.phase || "—"}</td>
                    <td className="px-4 py-2 text-xs">{c.subject || "—"}</td>
                    <td className="px-4 py-2">{c.topic || "—"}</td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {c.coverage_depth || "—"}
                    </td>
                    <td className="px-4 py-2 text-xs text-muted-foreground">
                      {c.expected_difficulty || "—"}
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.priority_score ?? "—"}
                    </td>
                    <td className="px-4 py-2">
                      {c.high_yield ? (
                        <span className="pill pill-sage"><span>High yield</span></span>
                      ) : (
                        <span className="text-xs text-muted-foreground">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      <ConfidencePill value={c.confidence_score} />
                    </td>
                    <td className="px-4 py-2 text-right tabular-nums">
                      {c.evidence_count ?? 0}
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
                                data-testid={`coverage-action-${c.id}-${t.to}`}
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
      )}
    </div>
  );
}
