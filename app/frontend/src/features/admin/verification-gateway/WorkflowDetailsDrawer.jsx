import React, { useRef } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";
import { buildChainHistory, buildWorkflowSteps, formatTime, shortId } from "./lifecycle";

function stepBadge(status) {
  if (status === "done") return <span className="badge resolved">done</span>;
  if (status === "open") return <span className="badge blocker">open</span>;
  if (status === "active") return <span className="badge pending">active</span>;
  return <span className="badge plain">pending</span>;
}

export default function WorkflowDetailsDrawer({ open, report, onClose }) {
  const containerRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: open, containerRef, onEscape: onClose, initialFocusRef: closeRef });

  if (!open) return null;
  const steps = buildWorkflowSteps(report);
  const chain = buildChainHistory(report);
  const lastUpdated = report?.updated_at || report?.created_at;

  return (
    <div
      className="modal-backdrop open"
      onClick={(e) => { if (e.target === e.currentTarget) onClose?.(); }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="workflow-drawer-title"
      data-testid="workflow-drawer-backdrop"
    >
      <div ref={containerRef} tabIndex={-1} className="modal" style={{ maxWidth: 760 }}>
        <div className="modal-head">
          <div>
            <div className="tinylabel" style={{ marginBottom: 4 }}>workflow_details</div>
            <h2 id="workflow-drawer-title">
              {report ? `Verification workflow · ${shortId(report.id)}` : "Workflow details"}
            </h2>
          </div>
          <button
            ref={closeRef}
            className="btn ghost small"
            onClick={onClose}
            aria-label="Close workflow drawer"
          >
            ✕
          </button>
        </div>
        <div className="modal-body">
          {!report ? (
            <div className="anno">Select a report on the left to view its workflow.</div>
          ) : (
            <>
              <div className="card mb-3">
                <div className="card-header">
                  <h3>Workflow checklist</h3>
                  <span className="tn">{steps.length} steps · last update {formatTime(lastUpdated)}</span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <ul className="rlist" style={{ padding: "0 20px" }}>
                    {steps.map((step) => (
                      <li key={step.id} data-testid={`wf-step-${step.id}`}>
                        {stepBadge(step.status)}
                        <div>
                          <div className="li-label">{step.label}</div>
                          <div className="li-sub">{step.sub}</div>
                        </div>
                        <span className="tn">{step.right}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="card mb-3">
                <div className="card-header">
                  <h3>Chain history</h3>
                  <span className="tn">
                    chain_root {shortId(report.chain_root_id || report.id)} · v{report.report_version || 1}
                  </span>
                </div>
                <div className="card-body" style={{ padding: 0 }}>
                  <ul className="rlist" style={{ padding: "0 16px" }}>
                    {chain.map((row) => (
                      <li key={row.id}>
                        <span className="badge resolved">{row.badge}</span>
                        <div>
                          <div className="li-label">{row.label}</div>
                          <div className="li-sub">{row.sub}</div>
                        </div>
                        <span className="tn">{row.right}</span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="tn">
                Report id <strong>{report.id}</strong> · trigger_reason{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>{report.trigger_reason}</code> ·
                staleness{" "}
                <code style={{ fontFamily: "var(--font-mono)" }}>{report.staleness_status || "fresh"}</code>
                {report.valid_until ? <> · valid_until {formatTime(report.valid_until)}</> : null}
              </div>
            </>
          )}
        </div>
        <div className="modal-foot">
          <div className="tn">{report ? `updated_at ${formatTime(lastUpdated)}` : ""}</div>
          <div className="row">
            <button className="btn" onClick={onClose}>Close</button>
          </div>
        </div>
      </div>
    </div>
  );
}
