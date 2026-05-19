import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";

const DECISION_BADGE = {
  update: { cls: "badge resolved", text: "update" },
  skip: { cls: "badge neutral", text: "skip" },
  force_available: { cls: "badge pending", text: "force" },
};

function valueText(v) {
  if (v == null || v === "") return "(empty)";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

export default function DuplicateMergePreview({ open, queueId, recruitment, onClose, onConfirmMerge, busy }) {
  const [preview, setPreview] = useState(null);
  const [error, setError] = useState(null);
  const [forceFields, setForceFields] = useState(() => new Set());

  useEffect(() => {
    if (!open || !queueId || !recruitment?.id) return;
    setPreview(null);
    setError(null);
    let cancelled = false;
    api.get(`/api/admin/scrape/items/${queueId}/merge-preview/${recruitment.id}`)
      .then((r) => { if (!cancelled) setPreview(r); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, [open, queueId, recruitment?.id]);

  const toggleForce = (field) => {
    setForceFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) next.delete(field);
      else next.add(field);
      return next;
    });
  };

  const updatingFields = useMemo(() => {
    if (!preview) return [];
    return preview.fields.filter((f) => f.decision === "update" || (f.decision === "force_available" && forceFields.has(f.field)));
  }, [preview, forceFields]);

  if (!open) return null;

  return (
    <section className="card" data-testid="duplicate-merge-preview">
      <div className="card-head-col">
        <div className="lbl">Merge into existing recruitment</div>
        <h3 className="oc-title">Target · {recruitment?.name || recruitment?.id}</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Existing values are kept by default. Toggle force to overwrite a non-empty field.{" "}
          {preview ? `${updatingFields.length} field${updatingFields.length === 1 ? "" : "s"} will update.` : ""}
        </div>
      </div>
      <div className="card-body" style={{ padding: 0 }}>
        {!preview && !error ? (
          <div style={{ padding: 14 }}>
            <div className="skel" style={{ height: 36, marginBottom: 8 }} />
            <div className="skel" style={{ height: 36, marginBottom: 8 }} />
            <div className="skel" style={{ height: 36 }} />
          </div>
        ) : null}
        {error ? <div style={{ padding: 14 }}><div className="err-row">Failed to load merge preview · {error.message}</div></div> : null}
        {preview ? (
          <>
            <div className="merge-row" style={{ background: "var(--paper-sunk)" }}>
              <span className="lbl">field</span>
              <span className="lbl">existing</span>
              <span className="lbl">queue</span>
              <span className="lbl">decision</span>
            </div>
            {preview.fields.map((row) => {
              const decision = row.decision;
              const meta = DECISION_BADGE[decision] || { cls: "badge neutral", text: decision };
              return (
                <div key={row.field} className="merge-row" data-decision={decision}>
                  <span className="merge-key">{row.field}</span>
                  <span className="merge-old">{valueText(row.current_value)}</span>
                  <span className="merge-new">{valueText(row.effective_value ?? row.queue_value)}</span>
                  {decision === "force_available" ? (
                    <label style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                      <input
                        type="checkbox"
                        checked={forceFields.has(row.field)}
                        onChange={() => toggleForce(row.field)}
                        data-testid={`force-${row.field}`}
                      />
                      <span className={meta.cls}>{meta.text}</span>
                    </label>
                  ) : (
                    <span className={meta.cls}>{meta.text}</span>
                  )}
                </div>
              );
            })}
          </>
        ) : null}
      </div>
      <div className="card-foot">
        <button type="button" className="btn small" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className="btn primary small"
          onClick={() => onConfirmMerge?.({ force_fields: Array.from(forceFields) })}
          disabled={busy || updatingFields.length === 0}
          data-testid="confirm-merge"
        >
          {busy ? "Merging…" : `Merge ${updatingFields.length} field${updatingFields.length === 1 ? "" : "s"}`}
        </button>
      </div>
    </section>
  );
}
