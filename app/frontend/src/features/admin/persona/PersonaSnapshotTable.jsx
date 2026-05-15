import React from "react";

function dimSummary(dims) {
  if (!dims || typeof dims !== "object") return "—";
  const keys = [
    "preparation_stage",
    "time_constraint",
    "learning_behavior",
    "execution_risk",
  ];
  return keys
    .map((k) => dims[k])
    .filter(Boolean)
    .join(" · ");
}

export default function PersonaSnapshotTable({ items, onInspectUser }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
        No persona snapshots yet.
      </div>
    );
  }
  return (
    <div className="soft-card grain relative overflow-hidden rounded-[18px]">
      <table className="tbl" data-testid="persona-snapshot-table">
        <thead>
          <tr>
            <th>User</th>
            <th>Primary</th>
            <th>Dimensions</th>
            <th className="right">Confidence</th>
            <th>Computed</th>
            <th className="right">Actions</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.id} className="border-t border-clay-100">
              <td className="px-4 py-2 font-mono text-xs">{r.user_id}</td>
              <td className="px-4 py-2 text-xs">{r.primary_persona || "—"}</td>
              <td className="px-4 py-2 text-xs text-muted-foreground max-w-md truncate">
                {dimSummary(r.dimensions)}
              </td>
              <td className="px-4 py-2 text-right tabular-nums">
                {r.scores?.confidence == null ? "—" : Number(r.scores.confidence).toFixed(2)}
              </td>
              <td className="px-4 py-2 text-xs text-muted-foreground">
                {r.computed_at ? new Date(r.computed_at).toLocaleString() : "—"}
              </td>
              <td className="px-4 py-2 text-right">
                <button
                  type="button"
                  onClick={() => onInspectUser && onInspectUser(r.user_id)}
                  className="btn btn-ghost text-xs"
                  data-testid={`persona-snapshot-inspect-${r.user_id}`}
                >
                  Inspect
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
