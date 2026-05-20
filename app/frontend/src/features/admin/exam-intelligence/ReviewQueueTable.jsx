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
      <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5 text-sm text-clay-700">
        No items match the current filter.
      </div>
    );
  }

  const isMention = kind === "syllabus_topic_mention";
  const isTag = kind === "pyq_question_topic_tag";
  const isOption = kind === "pyq_option";

  function toggle(id) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // base = id + status + confidence + actions (4). Each variant adds two
  // extra columns (mention text/type, tag role/weight, option label/correct).
  const variantExtra = isMention || isTag || isOption ? 2 : 1;
  const detailColSpan = 4 + variantExtra;

  return (
    <div className="soft-card grain relative overflow-hidden rounded-[18px]">
      <table className="tbl" data-testid={`exam-intel-review-${kind}`}>
        <thead>
          <tr>
            <th>Row id</th>
            {isMention ? (
              <>
                <th>Text</th>
                <th>Mention</th>
              </>
            ) : null}
            {isTag ? (
              <>
                <th>Role</th>
                <th className="right">Weight</th>
              </>
            ) : null}
            {isOption ? (
              <>
                <th>Option</th>
                <th>Correct</th>
              </>
            ) : null}
            {!isMention && !isTag && !isOption ? <th>Type</th> : null}
            <th>Status</th>
            <th>Confidence</th>
            <th className="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const isOpen = expanded.has(r.id);
            return (
              <React.Fragment key={r.id}>
                <tr>
                  <td className="num-mono">
                    <button
                      type="button"
                      onClick={() => toggle(r.id)}
                      className="inline-flex items-center gap-1 text-clay-700 hover:text-clay-900"
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
                      <td className="max-w-md">
                        <div className="line-clamp-2">{r.normalized_text || r.raw_text || "—"}</div>
                      </td>
                      <td className="text-clay-700">{r.mention_type || "—"}</td>
                    </>
                  ) : null}
                  {isTag ? (
                    <>
                      <td>{r.tag_role || "—"}</td>
                      <td className="right num-mono">{r.tag_weight ?? "—"}</td>
                    </>
                  ) : null}
                  {isOption ? (
                    <>
                      <td className="max-w-md">
                        <span className="num-mono text-clay-700 mr-1.5">
                          {r.option_label || "—"}.
                        </span>
                        <span className="line-clamp-2 inline">{r.option_text || "—"}</span>
                      </td>
                      <td>{r.is_correct ? "Yes" : "No"}</td>
                    </>
                  ) : null}
                  {!isMention && !isTag && !isOption ? (
                    <td>{r.question_type || "—"}</td>
                  ) : null}
                  <td>
                    <StatusBadge status={r.reviewer_status} />
                  </td>
                  <td>
                    <ConfidencePill value={r.confidence_score} />
                  </td>
                  <td className="right">
                    <div className="inline-flex flex-wrap gap-1 justify-end">
                      {ACTIONS.filter((a) => a.value !== r.reviewer_status).map((a) => (
                        <button
                          key={a.value}
                          type="button"
                          onClick={() => onReview && onReview(r, a.value)}
                          disabled={busyRowId === r.id}
                          className={`text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] font-semibold ${
                            a.value === "verified"
                              ? "text-sage-700"
                              : a.value === "rejected"
                                ? "text-dusk-700"
                                : "text-clay-700"
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
                  <tr>
                    <td colSpan={detailColSpan} className="bg-[#FBF8F2]">
                      <ExamEvidenceDrawer row={r} kind={kind} defaultOpen />
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
