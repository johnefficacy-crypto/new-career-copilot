import React, { useEffect, useMemo, useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

const AGGREGATOR_KINDS = new Set(["aggregator", "aggregator_listing"]);

function isAggregator(candidate) {
  const kind = (candidate?.source_kind || "").toLowerCase();
  return AGGREGATOR_KINDS.has(kind);
}

function isValidHttpUrl(value) {
  if (!value) return false;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch (_e) {
    return false;
  }
}

function formatExtractedAt(value) {
  if (!value) return "";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toISOString().slice(0, 16).replace("T", " ") + "Z";
  } catch (_e) {
    return value;
  }
}

function formatValue(value) {
  if (value == null) return "—";
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

export default function ConflictResolver({
  open,
  conflict,
  busy,
  onClose,
  onSubmit,
  onReject,
}) {
  const containerRef = useRef(null);
  const cancelRef = useRef(null);
  useFocusTrap({ active: open, containerRef, onEscape: onClose, initialFocusRef: cancelRef });

  const candidates = useMemo(() => conflict?.candidates || [], [conflict]);
  const fieldKey = conflict?.field_key || "";

  const officialCandidates = useMemo(() => candidates.filter((c) => !isAggregator(c)), [candidates]);
  const allAggregator = candidates.length > 0 && officialCandidates.length === 0;

  const defaultIdx = useMemo(() => candidates.findIndex((c) => !isAggregator(c)), [candidates]);
  const [selectedIdx, setSelectedIdx] = useState(defaultIdx >= 0 ? defaultIdx : 0);
  const [scope, setScope] = useState("field");
  const [reason, setReason] = useState("");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState(null);

  // Reset form whenever a different conflict is opened.
  useEffect(() => {
    if (!open) return;
    setSelectedIdx(defaultIdx >= 0 ? defaultIdx : 0);
    setScope("field");
    setReason("");
    setEvidenceUrl("");
    setSubmitted(false);
    setError(null);
  }, [open, conflict?.id, defaultIdx]);

  if (!open || !conflict) return null;

  const selected = candidates[selectedIdx] || null;
  const reasonTooShort = reason.trim().length < 10;
  const evidenceInvalid = !isValidHttpUrl(evidenceUrl);
  const selectedIsAggregator = !selected || isAggregator(selected);
  const canApply = !!selected && !selectedIsAggregator && !reasonTooShort && !evidenceInvalid;

  const submit = async () => {
    setSubmitted(true);
    setError(null);
    if (!canApply) return;
    try {
      await onSubmit?.({
        conflict_id: conflict.id,
        value: selected.value,
        scope,
        reason: reason.trim(),
        evidence_url: evidenceUrl.trim(),
      });
    } catch (e) {
      setError(e?.message || "Failed to apply override.");
    }
  };

  const reject = async () => {
    setError(null);
    try {
      await onReject?.({
        conflict_id: conflict.id,
        reason: "aggregator value rejected by policy",
      });
    } catch (e) {
      setError(e?.message || "Failed to reject conflict.");
    }
  };

  const onBackdrop = (e) => {
    if (e.target === e.currentTarget) onClose?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onBackdrop}
      data-testid="conflict-resolver-backdrop"
    >
      <div className="absolute inset-0 bg-black/30" />
      <div
        ref={containerRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="conflict-resolver-title"
        className="relative w-full max-w-2xl"
        data-testid="conflict-resolver"
      >
        <div className="card" style={{ maxHeight: "85vh", overflowY: "auto" }}>
          <div className="card-head">
            <div>
              <div className="lbl">admin_override_conflict</div>
              <h3 id="conflict-resolver-title" className="oc-title">
                Resolve conflict · <code style={{ fontFamily: "var(--font-mono)" }}>{fieldKey}</code>
              </h3>
            </div>
            <button
              type="button"
              className="btn ghost small"
              onClick={onClose}
              aria-label="Close conflict resolver"
              data-testid="conflict-resolver-close"
            >
              ✕
            </button>
          </div>
          <div className="card-body stack">
            <div className="anno">
              conflict_id <strong>{(conflict.id || "").slice(0, 8)}</strong>
              {conflict.queue_id ? <> · queue {(conflict.queue_id || "").slice(0, 8)}</> : null}
              {conflict.recruitment_id ? <> · recruitment {(conflict.recruitment_id || "").slice(0, 8)}</> : null}
            </div>

            <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="lbl" style={{ marginBottom: 5 }}>
                Chosen value · pick one official source
              </legend>
              <div className="stack" role="radiogroup" aria-label="Conflict candidates">
                {candidates.map((cand, idx) => {
                  const aggregator = isAggregator(cand);
                  const checked = selectedIdx === idx;
                  return (
                    <label
                      key={`${cand?.source_url || "cand"}-${idx}`}
                      className={`row${checked ? " selected" : ""}`}
                      style={{
                        alignItems: "flex-start",
                        gap: 10,
                        padding: 10,
                        border: "1px solid var(--rule)",
                        borderRadius: 6,
                        opacity: aggregator ? 0.65 : 1,
                        cursor: aggregator ? "not-allowed" : "pointer",
                      }}
                    >
                      <input
                        type="radio"
                        name="conflict-candidate"
                        value={idx}
                        checked={checked}
                        disabled={aggregator}
                        onChange={() => setSelectedIdx(idx)}
                        data-testid={`conflict-candidate-${idx}`}
                      />
                      <div style={{ flex: 1 }}>
                        <div>
                          <strong>{formatValue(cand?.value)}</strong>
                        </div>
                        <div className="row-sub">
                          {(cand?.source_kind || "unknown")} ·{" "}
                          <a href={cand?.source_url} target="_blank" rel="noreferrer">
                            {cand?.source_url || "—"}
                          </a>
                          {cand?.extracted_at ? <> · extracted {formatExtractedAt(cand.extracted_at)}</> : null}
                        </div>
                        {aggregator ? (
                          <div className="warn-row" style={{ marginTop: 4 }}>
                            Aggregator value cannot become canonical — reject this conflict instead.
                          </div>
                        ) : null}
                      </div>
                    </label>
                  );
                })}
              </div>
            </fieldset>

            <fieldset className="stack" style={{ border: "none", padding: 0, margin: 0 }}>
              <legend className="lbl" style={{ marginBottom: 5 }}>
                Override scope
              </legend>
              <div className="row" style={{ gap: 14 }}>
                <label className="row" style={{ alignItems: "flex-start", gap: 6 }}>
                  <input
                    type="radio"
                    name="conflict-scope"
                    value="field"
                    checked={scope === "field"}
                    onChange={() => setScope("field")}
                    data-testid="conflict-scope-field"
                  />
                  <span>
                    <strong>field</strong>
                    <span className="row-sub"> · override only this conflicting field</span>
                  </span>
                </label>
                <label className="row" style={{ alignItems: "flex-start", gap: 6 }}>
                  <input
                    type="radio"
                    name="conflict-scope"
                    value="recruitment"
                    checked={scope === "recruitment"}
                    onChange={() => setScope("recruitment")}
                    data-testid="conflict-scope-recruitment"
                  />
                  <span>
                    <strong>recruitment</strong>
                    <span className="row-sub"> · accept selected source for all open conflicts on this target</span>
                  </span>
                </label>
              </div>
            </fieldset>

            <div>
              <label className="lbl" htmlFor="conflict-reason" style={{ display: "block", marginBottom: 5 }}>
                Reason <span style={{ color: "var(--danger, #b00)" }}>*</span>
              </label>
              <textarea
                id="conflict-reason"
                className="input"
                rows={3}
                placeholder="e.g., Official corrigendum-1 supersedes the earlier PDF. Apply window extended."
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                style={{
                  borderColor: submitted && reasonTooShort ? "var(--danger, #b00)" : undefined,
                }}
                data-testid="conflict-reason"
                aria-invalid={submitted && reasonTooShort ? "true" : "false"}
              />
              {submitted && reasonTooShort ? (
                <div className="err-row" style={{ marginTop: 4 }} role="alert">
                  Reason must be at least 10 characters.
                </div>
              ) : null}
            </div>

            <div>
              <label className="lbl" htmlFor="conflict-evidence" style={{ display: "block", marginBottom: 5 }}>
                Evidence URL <span style={{ color: "var(--danger, #b00)" }}>*</span>
              </label>
              <input
                id="conflict-evidence"
                className="input"
                type="url"
                placeholder="https://..."
                value={evidenceUrl}
                onChange={(e) => setEvidenceUrl(e.target.value)}
                style={{
                  borderColor: submitted && evidenceInvalid ? "var(--danger, #b00)" : undefined,
                }}
                data-testid="conflict-evidence-url"
                aria-invalid={submitted && evidenceInvalid ? "true" : "false"}
              />
              {submitted && evidenceInvalid ? (
                <div className="err-row" style={{ marginTop: 4 }} role="alert">
                  Evidence URL must be a valid http(s) link.
                </div>
              ) : null}
            </div>

            {error ? (
              <div className="err-row" role="alert">{error}</div>
            ) : null}

            <div className="anno">
              Override writes an audit row to{" "}
              <code style={{ fontFamily: "var(--font-mono)" }}>admin_audit_logs</code> and flips the
              conflict to <code style={{ fontFamily: "var(--font-mono)" }}>resolved_by_admin</code>.
              The promotion gate updates immediately.
            </div>
          </div>
          <div className="card-foot" style={{ justifyContent: "space-between" }}>
            <div>
              {allAggregator && onReject ? (
                <button
                  type="button"
                  className="btn ghost small"
                  onClick={reject}
                  disabled={busy}
                  data-testid="conflict-reject"
                >
                  Reject conflict
                </button>
              ) : null}
            </div>
            <div className="row" style={{ gap: 8 }}>
              <button
                ref={cancelRef}
                type="button"
                className="btn small"
                onClick={onClose}
                disabled={busy}
                data-testid="conflict-cancel"
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary small"
                onClick={submit}
                disabled={busy || !canApply}
                data-testid="conflict-apply"
              >
                {busy ? "Applying…" : "Apply override"}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
