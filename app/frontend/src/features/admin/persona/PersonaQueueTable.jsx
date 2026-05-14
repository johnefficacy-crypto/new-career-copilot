import React from "react";

const STATUS_TONE = {
  pending: "text-muted-foreground",
  processing: "text-clay-700",
  completed: "text-sage-700",
  failed: "text-dusk-700",
};

export default function PersonaQueueTable({ items, onProcess, processing }) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <div className="space-y-3">
      <div className="flex items-center justify-end">
        {onProcess ? (
          <button
            type="button"
            onClick={() => onProcess(25)}
            disabled={processing}
            className="btn btn-primary text-xs"
            data-testid="persona-queue-process"
          >
            {processing ? "Processing…" : "Process pending (25)"}
          </button>
        ) : null}
      </div>
      {!rows.length ? (
        <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
          No queue rows match the current filter.
        </div>
      ) : (
        <div className="soft-card rounded-2xl overflow-hidden">
          <table className="w-full text-sm" data-testid="persona-queue-table">
            <thead className="bg-clay-50 text-[10px] uppercase tracking-[0.18em] text-muted-foreground">
              <tr>
                <th className="text-left px-4 py-2">User</th>
                <th className="text-left px-4 py-2">Reason</th>
                <th className="text-left px-4 py-2">Status</th>
                <th className="text-right px-4 py-2">Attempts</th>
                <th className="text-left px-4 py-2">Created</th>
                <th className="text-left px-4 py-2">Error</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-clay-100 align-top">
                  <td className="px-4 py-2 font-mono text-xs">{r.user_id}</td>
                  <td className="px-4 py-2 text-xs">{r.reason || "—"}</td>
                  <td className="px-4 py-2">
                    <span
                      className={`pill text-[10px] uppercase tracking-wider ${
                        STATUS_TONE[r.status] || "text-muted-foreground"
                      }`}
                    >
                      {r.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums">{r.attempts ?? 0}</td>
                  <td className="px-4 py-2 text-xs text-muted-foreground">{r.created_at}</td>
                  <td className="px-4 py-2 text-xs text-dusk-700 max-w-xs truncate">
                    {r.error_message || ""}
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
