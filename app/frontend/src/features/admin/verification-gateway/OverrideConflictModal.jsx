import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";
import { isAggregatorOnlyConflict } from "./lifecycle";

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const u = new URL(value);
    return u.protocol === "http:" || u.protocol === "https:";
  } catch (_e) {
    return false;
  }
}

function formatValue(v) {
  if (v == null) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function candidateList(conflict) {
  // Backend conflict rows may use either `candidate_values` (PR3 shape)
  // or `values`. Accept both so the modal works on either.
  const values = conflict?.candidate_values || conflict?.values || [];
  return values;
}

export default function OverrideConflictModal({
  open,
  conflict,
  busy,
  onClose,
  onSubmit,
}) {
  const containerRef = useRef(null);
  const cancelRef = useRef(null);
  useFocusTrap({ active: open, containerRef, onEscape: onClose, initialFocusRef: cancelRef });

  const candidates = useMemo(() => candidateList(conflict), [conflict]);
  const aggregatorOnly = useMemo(() => isAggregatorOnlyConflict(conflict), [conflict]);
  const conflictKey = conflict?.conflict_key || conflict?.field_path || "";

  const defaultIdx = useMemo(() => {
    if (!candidates.length) return 0;
    const idx = candidates.findIndex((c) => !(c?.source_kind || "").toLowerCase().includes("aggregator"));
    return idx >= 0 ? idx : 0;
  }, [candidates]);
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx);
  const [scope, setScope] = useState("field");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);

  useEffect(() => {
    if (!open) return;
    setSelectedIdx(defaultIdx);
    setScope("field");
    setReason("");
    setEvidenceUrl("");
    setSubmitted(false);
  }, [open, conflict?.conflict_id, defaultIdx]);

  if (!open || !conflict) return null;

  const selected = candidates[selectedIdx] || null;
  const reasonTooShort = reason.trim().length < 10;
  const evidenceInvalid = evidenceUrl.length > 0 && !isValidHttpUrl(evidenceUrl);
  const selectedIsAggregator = selected && (selected.source_kind || "").toLowerCase().includes("aggregator");
  const canApply = !!selected && !selectedIsAggregator && !reasonTooShort && !evidenceInvalid;

  const submit = async () => {
    setSubmitted(true);
    if (!canApply) return;
    await onSubmit?.({
      conflict_id: conflict.conflict_id || conflict.id,
      prior_value: conflict.prior_value ?? null,
      chosen_value: selected.value,
      reason: reason.trim(),
      evidence_url: evidenceUrl.trim() || null,
      override_scope: scope,
    });
  };

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      className="modal-backdrop open"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="override-conflict-title"
      data-testid="override-conflict-backdrop"
    >
      <div ref={containerRef} tabIndex={-1} className="modal">
        <div className="modal-head">
          <div>
            <div className="tinylabel" style={{ marginBottom: 4 }}>admin_override_conflict</div>
            <h2 id="override-conflict-title">Resolve conflict · {conflictKey}</h2>
          </div>
          <button
            className="btn ghost small"
            onClick={onClose}
            aria-label="Close override modal"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          <div className="tn" style={{ marginBottom: 16 }}>
            conflict_id <strong>{conflict.conflict_id || conflict.id}</strong>
            {conflictKey ? <> · field_path <code style={{ fontFamily: "var(--font-mono)" }}>{conflictKey}</code></> : null}
          </div>

          {candidates.length === 0 ? (
            <div className="anno" style={{ marginBottom: 16 }}>
              This conflict has no recorded candidate values. Pick a manual scope and reason to record an admin decision.
            </div>
          ) : null}

          {candidates.length > 0 ? (
            <div className="form-row">
              <label>Chosen value · pick one official source</label>
              <div className="radio-group" role="radiogroup">
                {candidates.map((c, idx) => {
                  const isAgg = (c?.source_kind || "").toLowerCase().includes("aggregator");
                  return (
                    <label key={`${c?.source_url || idx}`} style={{ opacity: isAgg ? 0.55 : 1 }}>
                      <input
                        type="radio"
                        name="chosen"
                        value={idx}
                        checked={selectedIdx === idx}
                        disabled={isAgg}
                        onChange={() => setSelectedIdx(idx)}
                        data-testid={`override-candidate-${idx}`}
                      />
                      <div>
                        <div><strong>{formatValue(c?.value)}</strong></div>
                        <div className="rg-sub">
                          {isAgg ? "aggregator" : "official"} · {c?.source_url || "—"}
                          {c?.extracted_at ? ` · extracted ${new Date(c.extracted_at).toLocaleString()}` : ""}
                        </div>
                        {isAgg ? (
                          <div className="rg-sub" style={{ color: "var(--danger, #b00)", marginTop: 2 }}>
                            aggregator value cannot become canonical
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="form-row">
            <label>Override scope</label>
            <div className="radio-group" role="radiogroup">
              <label>
                <input
                  type="radio" name="scope" value="field"
                  checked={scope === "field"}
                  onChange={() => setScope("field")}
                  data-testid="override-scope-field"
                />
                <div>
                  <div><strong>field</strong></div>
                  <div className="rg-sub">override only this conflicting field</div>
                </div>
              </label>
              <label>
                <input
                  type="radio" name="scope" value="recruitment"
                  checked={scope === "recruitment"}
                  onChange={() => setScope("recruitment")}
                  data-testid="override-scope-recruitment"
                />
                <div>
                  <div><strong>recruitment</strong></div>
                  <div className="rg-sub">accept selected version for whole recruitment</div>
                </div>
              </label>
            </div>
          </div>

          <div className="form-row">
            <label htmlFor="override-reason">Reason</label>
            <textarea
              id="override-reason"
              placeholder="Required. e.g., Official corrigendum-1 supersedes earlier PDF — apply window extended."
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              style={{ borderColor: submitted && reasonTooShort ? "var(--danger, #b00)" : undefined }}
              aria-invalid={submitted && reasonTooShort ? "true" : "false"}
              data-testid="override-reason"
            />
            {submitted && reasonTooShort ? (
              <div className="tn" style={{ color: "var(--danger, #b00)" }} role="alert">
                Reason must be at least 10 characters.
              </div>
            ) : null}
          </div>

          <div className="form-row">
            <label htmlFor="override-evidence">Evidence URL <span className="tn">(optional)</span></label>
            <input
              id="override-evidence"
              type="url"
              placeholder="https://..."
              value={evidenceUrl}
              onChange={(e) => setEvidenceUrl(e.target.value)}
              style={{ borderColor: submitted && evidenceInvalid ? "var(--danger, #b00)" : undefined }}
              aria-invalid={submitted && evidenceInvalid ? "true" : "false"}
              data-testid="override-evidence"
            />
            {submitted && evidenceInvalid ? (
              <div className="tn" style={{ color: "var(--danger, #b00)" }} role="alert">
                Evidence URL must be a valid http(s) link.
              </div>
            ) : null}
          </div>

          {aggregatorOnly ? (
            <div className="tn" style={{ background: "var(--blocker-bg)", padding: 10, borderRadius: 4, marginBottom: 12 }}>
              This conflict has only aggregator candidates. Apply will be rejected by the gate.
              Close this modal and reject the report from the report-pane footer if no official source can be attached.
            </div>
          ) : null}

          <div className="tn" style={{ borderTop: "1px solid var(--rule)", paddingTop: 12 }}>
            Override creates an audit row in{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>recruitment_verification_overrides</code>.
            The matching conflict on the report flips to{" "}
            <code style={{ fontFamily: "var(--font-mono)" }}>resolved_by_admin</code>.
          </div>
        </div>
        <div className="modal-foot">
          <div className="tn">override_scope=&apos;{scope}&apos;</div>
          <div className="row">
            <button ref={cancelRef} className="btn" onClick={onClose} disabled={busy} data-testid="override-cancel">
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={submit}
              disabled={busy || !canApply}
              data-testid="override-apply"
            >
              {busy ? "Applying…" : "Apply override"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
