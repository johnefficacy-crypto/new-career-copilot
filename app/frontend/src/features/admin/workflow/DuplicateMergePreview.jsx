import React, { useEffect, useMemo, useState } from "react";
import { X } from "lucide-react";
import { api } from "../../../lib/api";
import { ErrorState, LoadingSkeleton } from "../../../shared/ui";

const DECISION_LABEL = {
  update: "Will update",
  skip: "Skipped (no value)",
  force_available: "Existing value kept — force to overwrite",
};

const DECISION_TONE = {
  update: "border-sage-300 bg-sage-50",
  skip: "border-border bg-white/60",
  force_available: "border-amber-300 bg-amber-50",
};

function valueText(v) {
  if (v == null) return "—";
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
    <section className="soft-card rounded-2xl p-4" data-testid="duplicate-merge-preview">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Merge preview</div>
          <h3 className="font-heading text-lg">Merge into existing recruitment</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Target: {recruitment?.name || recruitment?.id}. Existing values are kept by default; toggle "force"
            to overwrite a non-empty field.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close merge preview">
          <X className="h-4 w-4" />
        </button>
      </div>

      {!preview && !error ? <LoadingSkeleton variant="table" /> : null}
      {error ? <ErrorState title="Failed to load merge preview" message={error.message} /> : null}
      {preview ? (
        <>
          <ul className="mt-3 space-y-2">
            {preview.fields.map((row) => {
              const tone = DECISION_TONE[row.decision] || DECISION_TONE.skip;
              return (
                <li key={row.field} className={`rounded-xl border p-3 text-xs ${tone}`}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="font-semibold">{row.field}</div>
                    <div className="text-[11px]">{DECISION_LABEL[row.decision] || row.decision}</div>
                  </div>
                  <div className="mt-2 grid gap-2 sm:grid-cols-3">
                    <Cell label="Existing" value={valueText(row.current_value)} />
                    <Cell label="Queue" value={valueText(row.queue_value)} />
                    <Cell label="Effective (with corrections)" value={valueText(row.effective_value)} highlight={row.corrected_value != null} />
                  </div>
                  {row.decision === "force_available" ? (
                    <label className="mt-2 inline-flex items-center gap-2 text-[11px]">
                      <input type="checkbox" checked={forceFields.has(row.field)} onChange={() => toggleForce(row.field)} data-testid={`force-${row.field}`} />
                      Force overwrite this field
                    </label>
                  ) : null}
                  {row.reason ? <div className="mt-1 text-[10px] text-muted-foreground">reason: {row.reason}</div> : null}
                </li>
              );
            })}
          </ul>

          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" className="btn btn-ghost h-8 text-xs" onClick={onClose} disabled={busy}>Cancel</button>
            <button
              type="button"
              className="btn btn-primary h-8 text-xs"
              onClick={() => onConfirmMerge?.({ force_fields: Array.from(forceFields) })}
              disabled={busy || updatingFields.length === 0}
              data-testid="confirm-merge"
            >
              {busy ? "Merging..." : `Merge ${updatingFields.length} field${updatingFields.length === 1 ? "" : "s"}`}
            </button>
          </div>
        </>
      ) : null}
    </section>
  );
}

function Cell({ label, value, highlight }) {
  return (
    <div className={`rounded border border-border bg-white/70 p-2 ${highlight ? "ring-1 ring-sage-300" : ""}`}>
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 break-words font-mono text-[11px]">{value}</div>
    </div>
  );
}
