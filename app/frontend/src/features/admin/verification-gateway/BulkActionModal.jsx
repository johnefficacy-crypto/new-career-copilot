import React, { useEffect, useRef, useState } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";
import { verificationReportsService } from "../../../services/verificationReportsService";

const ACTION_LABELS = {
  bulk_promote: "Promote selected",
  bulk_reject: "Reject selected",
};

function groupBlockersByReason(blockers) {
  const out = {};
  for (const b of blockers || []) {
    const key = b.reason_code || "unknown";
    if (!out[key]) out[key] = [];
    out[key].push(b);
  }
  return out;
}

export default function BulkActionModal({
  open,
  selectedIds = [],
  action = "bulk_promote",
  onClose,
  onApplied,
  busy: parentBusy,
}) {
  const containerRef = useRef(null);
  const cancelRef = useRef(null);
  useFocusTrap({ active: open, containerRef, onEscape: onClose, initialFocusRef: cancelRef });

  const [dryRun, setDryRun] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [applying, setApplying] = useState(false);

  useEffect(() => {
    if (!open || selectedIds.length === 0) {
      setDryRun(null);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setError(null);
    verificationReportsService
      .bulkDryRun({ selected_ids: selectedIds, action, dry_run: true })
      .then((res) => {
        if (cancelled) return;
        setDryRun(res?.result || null);
      })
      .catch((e) => { if (!cancelled) setError(e); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, [open, selectedIds, action]);

  if (!open) return null;

  const apply = async () => {
    if (!dryRun || dryRun.eligible_count === 0) return;
    setApplying(true);
    setError(null);
    try {
      const res = await verificationReportsService.bulkApply({
        selected_ids: selectedIds,
        action,
        dry_run: false,
      });
      onApplied?.(res);
    } catch (e) {
      setError(e);
    } finally {
      setApplying(false);
    }
  };

  const onBackdrop = (e) => { if (e.target === e.currentTarget) onClose?.(); };

  const blockers = dryRun?.blockers || [];
  const blockersByReason = groupBlockersByReason(blockers);
  const busy = Boolean(parentBusy) || applying || loading;

  return (
    <div
      className="modal-backdrop open"
      onClick={onBackdrop}
      role="dialog"
      aria-modal="true"
      aria-labelledby="bulk-action-title"
      data-testid="bulk-action-backdrop"
    >
      <div ref={containerRef} tabIndex={-1} className="modal" style={{ maxWidth: 680 }}>
        <div className="modal-head">
          <div>
            <div className="tinylabel" style={{ marginBottom: 4 }}>
              bulk_dry_run · {action}
            </div>
            <h2 id="bulk-action-title">
              {ACTION_LABELS[action] || action} · {selectedIds.length} selected
            </h2>
          </div>
          <button className="btn ghost small" onClick={onClose} aria-label="Close bulk action modal">✕</button>
        </div>
        <div className="modal-body">
          {loading ? (
            <div className="anno">Running dry-run…</div>
          ) : error ? (
            <div className="tn" style={{ color: "var(--danger, #b00)" }} role="alert">
              {error.message || "Dry-run failed."}
            </div>
          ) : dryRun ? (
            <>
              <div className="bulk-summary" data-testid="bulk-summary">
                <div className="bulk-stat">
                  <div className="bs-label">selected</div>
                  <div className="bs-value">{selectedIds.length}</div>
                </div>
                <div className="bulk-stat eligible">
                  <div className="bs-label">eligible</div>
                  <div className="bs-value">{dryRun.eligible_count}</div>
                </div>
                <div className="bulk-stat blocked">
                  <div className="bs-label">blocked</div>
                  <div className="bs-value">{dryRun.blocked_count}</div>
                </div>
              </div>

              {blockers.length > 0 ? (
                <div className="bulk-list" style={{ marginTop: 16 }}>
                  <div className="bulk-list-head">
                    <h3>Blocked items · {blockers.length}</h3>
                    <span className="tn">grouped by reason_code</span>
                  </div>
                  {Object.entries(blockersByReason).map(([reason, group]) => (
                    <div className="blocker-row" key={reason}>
                      <div>
                        <div className="br-title">{reason}</div>
                        <div className="br-meta">{group[0]?.message || "—"}</div>
                      </div>
                      <div className="br-reason tn">{group.length} report{group.length === 1 ? "" : "s"}</div>
                    </div>
                  ))}
                </div>
              ) : null}

              {dryRun.eligible_count === 0 ? (
                <div className="anno" style={{ marginTop: 12 }}>
                  Every selected report is blocked — apply is disabled. Resolve the blockers above and retry.
                </div>
              ) : null}
            </>
          ) : null}
        </div>
        <div className="modal-foot">
          <div className="tn">
            Apply runs only on the eligible subset. Blocked items stay untouched.
          </div>
          <div className="row">
            <button ref={cancelRef} className="btn" onClick={onClose} disabled={busy} data-testid="bulk-cancel">
              Cancel
            </button>
            <button
              className="btn primary"
              onClick={apply}
              disabled={busy || !dryRun || dryRun.eligible_count === 0}
              data-testid="bulk-apply"
            >
              {applying ? "Applying…" : `Apply on ${dryRun?.eligible_count ?? 0}`}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
