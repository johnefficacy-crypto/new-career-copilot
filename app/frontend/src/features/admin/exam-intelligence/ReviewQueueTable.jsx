import React from "react";

const STATUS_TONE = {
  pending: "text-muted-foreground",
  verified: "text-sage-700",
  rejected: "text-dusk-700",
  needs_correction: "text-clay-700",
};

const ACTIONS = [
  { value: "verified", label: "Verify" },
  { value: "rejected", label: "Reject" },
  { value: "needs_correction", label: "Needs correction" },
  { value: "pending", label: "Reset to pending" },
];

export default function ReviewQueueTable({
  items,
  kind,
  onReview,
  busyRowId,
}) {
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
            {!isMention && !isTag ? (
              <th className="text-left px-4 py-2">Type</th>
            ) : null}
            <th className="text-left px-4 py-2">Status</th>
            <th className="text-right px-4 py-2">Confidence</th>
            <th className="text-right px-4 py-2">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-clay-100 align-top">
              <td className="px-4 py-2 font-mono text-[11px]">{r.id}</td>
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
                  <td className="px-4 py-2 text-right tabular-nums">
                    {r.tag_weight ?? "—"}
                  </td>
                </>
              ) : null}
              {!isMention && !isTag ? (
                <td className="px-4 py-2 text-xs">{r.question_type || "—"}</td>
              ) : null}
              <td className="px-4 py-2">
                <span
                  className={`pill text-[10px] uppercase tracking-wider ${
                    STATUS_TONE[r.reviewer_status] || "text-muted-foreground"
                  }`}
                >
                  {r.reviewer_status}
                </span>
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.confidence_score ?? "—"}
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
          ))}
        </tbody>
      </table>
    </div>
  );
}
