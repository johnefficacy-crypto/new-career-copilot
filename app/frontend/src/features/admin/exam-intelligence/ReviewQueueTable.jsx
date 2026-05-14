import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { StatusBadge, ConfidencePill } from "../../../shared/ui";
import ExamEvidenceDrawer from "./ExamEvidenceDrawer";

const ACTIONS = [
  { value: "verified", label: "Verify" },
  { value: "rejected", label: "Reject" },
  { value: "needs_correction", label: "Needs correction" },
  { value: "pending", label: "Reset to pending" },
];

export default function ReviewQueueTable({ items, kind, onReview, busyRowId }) {
  const [expanded, setExpanded] = useState(() => new Set());
  const rows = Array.isArray(items) ? items : [];

  if (!rows.length) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
        No items match the current filter.
      </div>
    );
  }

  const isMention = kind === "syllabus_topic_mention";
  const isTag = kind === "pyq_question_topic_tag";

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const detailColSpan = 6 + (isMention ? 1 : 0) + (isTag ? 1 : 0);

  return (
    <div className="soft-card rounded-2xl overflow-hidden">
      <table className="w-full text-sm" data-testid={`exam-intel-review-${kind}`}>
        <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">Row id</th>
            {isMention ? (
              <>
                <th className="text-left px-4 py-2">Text</th>
                <th className="text-left px-4 py-2">Mention</th>
              </>
            ) : null}
            {isTag ? (
              <>
                <th className="text-left px-4 py-2">Role</th>
                <th className="text-right px-4 py-2">Weight</th>
              </>
            ) : null}
            {!isMention && !isTag ? <th className="text-left px-4 py-2">Type</th> : null}
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-left px-4 py-2">Confidence</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <React.Fragment key={r.id}>
                <tr className="border-t border-clay-100 align-top">
                  <td className="px-4 py-2 font-mono text-[11px]">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      className="inline-flex items-center gap-1 text-muted-foreground hover:text-clay-700"
                      aria-expanded={isOpen}
                      data-testid={`exam-intel-review-${r.id}-expand`}
                    >
                      {isOpen ? (
                        <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
                      ) : (
                        <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
                      )}
                      {r.id}
                    </button>
                  </td>
                  {isMention ? (
                    <>
                      <td className="px-4 py-2 max-w-md">
                        <div className="line-clamp-2 text-xs">
                          {r.normalized_text || r.raw_text || "—"}
                        </div>
                      </td>
                      <td className="px-4 py-2 text-xs text-muted-foreground">
                        {r.mention_type || "—"}
                      </td>
                    </>
                  ) : null}
                  {isTag ? (
                    <>
                      <td className="px-4 py-2 text-xs">{r.tag_role || "—"}</td>
                      <td className="px-4 py-2 text-right tabular-nums">{r.tag_weight ?? "—"}</td>
                    </>
                  ) : null}
                  {!isMention && !isTag ? (
                    <td className="px-4 py-2 text-xs">{r.question_type || "—"}</td>
                  ) : null}
                  <td className="px-4 py-2">
                    <StatusBadge status={r.reviewer_status} />
                  </td>
                  <td className="px-4 py-2">
                    <ConfidencePill value={r.confidence_score} />
                  </td>
                  <td className="px-4 py-2 text-right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      {ACTIONS.filter((a) => a.value !== r.reviewer_status).map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => onReview && onReview(r, a.value)}
                          disabled={busyRowId === r.id}
                          className={`btn btn-ghost text-[11px] ${
                            a.value === "verified"
                              ? "text-sage-700"
                              : a.value === "rejected"
                                ? "text-dusk-700"
                                : "text-muted-foreground"
                          }`}
                          data-testid={`exam-intel-review-${r.id}-${a.value}`}
                        >
                          {busyRowId === r.id ? "…" : a.label}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
                {isOpen ? (
                  <tr className="border-t border-clay-50 bg-clay-50/40">
                    <td colSpan={detailColSpan} className="px-4 py-3">
                      <ExamEvidenceDrawer row={r} defaultOpen />
                    </td>
                  </tr>
                ) : null}
              </React.Fragment>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
