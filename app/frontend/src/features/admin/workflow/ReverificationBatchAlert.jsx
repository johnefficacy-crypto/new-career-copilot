import React from "react";

// Single card for a mass-corrigendum batch.
// Plan §7 acceptance: "mass corrigendum surfaced as ReverificationBatchAlert (one card, not N)."
export default function ReverificationBatchAlert({ batch, onAcknowledge, onOpenAffected, onSnooze, disabled }) {
  if (!batch) return null;
  const total = batch.total_reports_affected ?? 0;
  const flipped = batch.promoted_to_needs_reverification ?? 0;
  const remaining = batch.remaining_pending ?? Math.max(0, total - flipped);
  const sourceLabel = batch.source_name || batch.source || batch.trigger_reason || "—";
  const triggerTime = (batch.detected_at || batch.created_at || "").slice(11, 16);
  return (
    <article className="batch-card" data-testid="reverification-batch-alert">
      <div className="row" style={{ gap: 6, marginBottom: 6 }}>
        <span className="badge pending">mass change detected</span>
        {batch.source_tier ? <span className={`badge tier-${String(batch.source_tier).toLowerCase()}`}>tier {String(batch.source_tier).toUpperCase()}</span> : null}
      </div>
      <h3 className="oc-title" style={{ fontSize: 18 }}>
        {sourceLabel} · {total} report{total === 1 ? "" : "s"} affected by source change
      </h3>
      <div className="row-sub" style={{ color: "var(--ink-soft)", marginTop: 4 }}>
        source · {sourceLabel}
        {batch.trigger_reason ? ` · trigger · ${batch.trigger_reason}` : ""}
        {triggerTime ? ` · ${triggerTime} IST` : ""}
      </div>

      <div className="grid3" style={{ marginTop: 14, background: "var(--paper-card)", borderRadius: 3, padding: 12 }}>
        <div>
          <div className="field-lbl">total affected</div>
          <div style={{ fontFamily: "var(--fdisp)", fontSize: 22, fontWeight: 400, marginTop: 3 }}>{total}</div>
        </div>
        <div>
          <div className="field-lbl">flipped to needs_reverification</div>
          <div style={{ fontFamily: "var(--fdisp)", fontSize: 22, fontWeight: 400, marginTop: 3 }}>{flipped}</div>
        </div>
        <div>
          <div className="field-lbl">held in batch · pending</div>
          <div style={{ fontFamily: "var(--fdisp)", fontSize: 22, fontWeight: 400, color: "var(--pending)", marginTop: 3 }}>{remaining}</div>
        </div>
      </div>

      <div className="anno" style={{ marginTop: 12, color: "var(--ink-soft)" }}>
        First {flipped} reports already in admin attention queue. Remaining {remaining} held in batch state to prevent flooding.
        Acknowledge to release in throttled chunks.
      </div>

      <div className="row" style={{ marginTop: 14 }}>
        {remaining > 0 ? (
          <button type="button" className="btn primary" onClick={() => onAcknowledge?.(batch.id)} disabled={disabled}>
            Acknowledge &amp; release {remaining}
          </button>
        ) : null}
        {onOpenAffected ? <button type="button" className="btn" onClick={() => onOpenAffected(batch)}>Open affected list</button> : null}
        {onSnooze ? <button type="button" className="btn ghost" onClick={() => onSnooze(batch.id)}>Snooze 1h</button> : null}
      </div>
    </article>
  );
}
