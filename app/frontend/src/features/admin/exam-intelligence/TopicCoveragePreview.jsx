import React from "react";
import { Lock, Info } from "lucide-react";
import { StatusBadge, ConfidencePill, EmptyState } from "../../../shared/ui";

// Read-only preview of exam_topic_coverage. Phase 3 will add a backend
// endpoint and reviewer write actions; for now this renders whatever rows
// are passed in (or an empty state) and never mutates anything.
//
// Coverage lifecycle: draft -> pending_review -> reviewed -> locked -> rejected
// Only `locked` rows are eligible for the Study OS planner.
export default function TopicCoveragePreview({ items }) {
  const rows = Array.isArray(items) ? items : [];

  return (
    <div className="space-y-3" data-testid="topic-coverage-preview">
      <div className="soft-card rounded-2xl p-4 flex items-start gap-3">
        <Info className="h-5 w-5 text-dusk-600 mt-0.5" aria-hidden="true" />
        <div className="text-sm">
          <div className="font-semibold">Read-only preview</div>
          <p className="text-muted-foreground mt-1">
            Topic coverage converts verified syllabus and PYQ evidence into
            planner-ready topic scores. This tab is read-only — reviewer
            actions (approve, edit, reject, lock) arrive in a later phase.
            Only rows with status <span className="font-mono">locked</span>{" "}
            reach the Study OS planner.
          </p>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState
          icon={Lock}
          title="No topic coverage yet"
          description="Verified syllabus mentions and PYQ tags will be aggregated into exam_topic_coverage here once the backend endpoint lands."
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
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
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
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
