import React from "react";
import { Newspaper } from "lucide-react";
import { StatusBadge, SourceTrustBadge, EmptyState } from "../../../shared/ui";

// exam_policy_updates review surface.
//
// Two axes: reviewer_status (operator workflow) and source_type (trust
// origin). Only verified official rows ever reach the Study OS planner;
// non-official rows are discovery-only. The affects_* flags are set at row
// creation and gated by a DB check constraint — this surface only moves
// reviewer_status.
const REVIEW_ACTIONS = {
  pending: [
    { to: "verified", label: "Verify", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
    { to: "needs_correction", label: "Needs correction" },
  ],
  needs_correction: [
    { to: "verified", label: "Verify", tone: "primary" },
    { to: "rejected", label: "Reject", tone: "danger" },
    { to: "pending", label: "Reset to pending" },
  ],
  verified: [
    { to: "rejected", label: "Reject", tone: "danger" },
    { to: "needs_correction", label: "Needs correction" },
  ],
  rejected: [
    { to: "pending", label: "Reset to pending" },
    { to: "needs_correction", label: "Needs correction" },
  ],
};

const AFFECT_KEYS = [
  ["affects_plan", "plan"],
  ["affects_deadline", "deadline"],
  ["affects_eligibility", "eligibility"],
  ["affects_documents", "documents"],
  ["affects_syllabus", "syllabus"],
  ["affects_vacancy", "vacancy"],
];

function actionClasses(tone) {
  if (tone === "primary") {
    return "border-sage-300 bg-sage-50 text-sage-800 hover:bg-sage-100";
  }
  if (tone === "danger") {
    return "border-dusk-200 bg-dusk-50 text-dusk-800 hover:bg-dusk-100";
  }
  return "border-clay-200 text-clay-700 hover:bg-clay-50";
}

function AffectsCell({ row }) {
  const active = AFFECT_KEYS.filter(([k]) => row[k]);
  if (!active.length) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  return (
    <div className="flex flex-wrap gap-1">
      {active.map(([, label]) => (
        <span key={label} className="pill pill-amber text-[10px]"><span>{label}</span></span>
      ))}
    </div>
  );
}

export default function PolicyUpdatesTable({ items, onReview, busyRowId }) {
  const rows = Array.isArray(items) ? items : [];
  const interactive = typeof onReview === "function";

  if (!rows.length) {
    return (
      <EmptyState
        icon={Newspaper}
        title="No policy updates yet"
        description="Official notification / cycle / syllabus / vacancy changes and unverified aggregator discoveries appear here for review."
      />
    );
  }

  return (
    <div className="soft-card rounded-2xl overflow-hidden" data-testid="policy-updates-table">
      <table className="w-full text-sm">
        <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
          <tr>
            <th className="text-left px-4 py-2">Exam</th>
            <th className="text-left px-4 py-2">Type</th>
            <th className="text-left px-4 py-2">Title</th>
            <th className="text-left px-4 py-2">Source</th>
            <th className="text-left px-4 py-2">Affects</th>
            <th className="text-left px-4 py-2">Status</th>
            {interactive ? <th className="text-left px-4 py-2">Actions</th> : null}
          </tr>
        </thead>
        <tbody>
          {rows.map((u) => {
            const actions = REVIEW_ACTIONS[u.status] || [];
            const busy = busyRowId === u.id;
            const isOfficial = u.source_type === "official";
            return (
              <tr key={u.id} className="border-t border-clay-100 align-top">
                <td className="px-4 py-2 text-xs">{u.exam || u.exam_slug || "—"}</td>
                <td className="px-4 py-2 text-xs text-muted-foreground">
                  {(u.update_type || "—").replace(/_/g, " ")}
                </td>
                <td className="px-4 py-2">
                  <div className="font-medium">{u.title || "—"}</div>
                  {u.summary ? (
                    <div className="text-xs text-muted-foreground mt-0.5 max-w-md">
                      {u.summary}
                    </div>
                  ) : null}
                </td>
                <td className="px-4 py-2">
                  <SourceTrustBadge
                    kind={isOfficial ? "official" : u.source_type || "needs_verification"}
                    compact
                  />
                </td>
                <td className="px-4 py-2">
                  <AffectsCell row={u} />
                </td>
                <td className="px-4 py-2">
                  <StatusBadge status={u.status} />
                </td>
                {interactive ? (
                  <td className="px-4 py-2">
                    <div className="flex flex-wrap gap-1.5">
                      {actions.length ? (
                        actions.map((a) => (
                          <button
                            key={a.to}
                            type="button"
                            disabled={busy}
                            onClick={() => onReview(u, a.to)}
                            className={`text-[11px] rounded-full border px-2 py-1 disabled:opacity-50 ${actionClasses(
                              a.tone,
                            )}`}
                            data-testid={`policy-action-${u.id}-${a.to}`}
                          >
                            {busy ? "…" : a.label}
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
