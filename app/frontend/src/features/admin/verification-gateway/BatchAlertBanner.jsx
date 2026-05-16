import React from "react";
import { formatTime } from "./lifecycle";

export default function BatchAlertBanner({ batches = [], busy, onAcknowledge }) {
  const unacknowledged = batches.filter((b) => !b.acknowledged_at);
  if (unacknowledged.length === 0) return null;
  const lead = unacknowledged[0];
  const others = unacknowledged.length - 1;
  return (
    <div className="batch-alert" data-testid="batch-alert">
      <div className="row" style={{ marginBottom: 8 }}>
        <span className="badge pending">mass change detected</span>
        <span className="badge plain">{unacknowledged.length} unacknowledged</span>
      </div>
      <h2>
        {lead.total_reports_affected || 0} reports affected · {lead.trigger_reason || "—"}
      </h2>
      <div className="ba-source">
        batch_id · {lead.id} · created {formatTime(lead.created_at)}
        {others > 0 ? ` · +${others} more batch${others === 1 ? "" : "es"} queued` : ""}
      </div>

      <div className="ba-stats">
        <div className="ba-stat">
          <div className="bn">total affected</div>
          <div className="bv">{lead.total_reports_affected ?? 0}</div>
        </div>
        <div className="ba-stat">
          <div className="bn">flipped to needs_reverification</div>
          <div className="bv">{lead.promoted_to_needs_reverification ?? 0}</div>
        </div>
        <div className="ba-stat">
          <div className="bn">pending_reverification_batch</div>
          <div className="bv">{lead.remaining_pending ?? 0}</div>
        </div>
      </div>

      <div className="tn" style={{ marginBottom: 12 }}>
        First {lead.promoted_to_needs_reverification ?? 0} reports already in the admin attention queue.
        Acknowledge to release the remaining {lead.remaining_pending ?? 0} in throttled chunks.
      </div>

      <div className="ba-actions">
        <button
          type="button"
          className="btn primary"
          disabled={busy || !lead.remaining_pending}
          onClick={() => onAcknowledge?.(lead.id)}
          data-testid="batch-acknowledge"
        >
          {lead.remaining_pending ? `Acknowledge & release ${lead.remaining_pending}` : "Acknowledge"}
        </button>
      </div>
    </div>
  );
}
