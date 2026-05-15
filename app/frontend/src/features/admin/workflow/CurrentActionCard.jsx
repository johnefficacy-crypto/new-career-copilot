import React from "react";
import { ArrowRight } from "lucide-react";

// Renders exactly one blocker + one recommended next action + one primary button.
// All copy comes from the backend (reason_code, message, recommended_action).
export default function CurrentActionCard({ report, onPrimaryAction, onOpenDetails }) {
  if (!report) {
    return (
      <div className="card">
        <div className="card-body">
          <div className="anno">Select a queue item to see the recommended next action.</div>
        </div>
      </div>
    );
  }

  const blocker = pickBlocker(report);
  const action = blocker ? null : pickRecommendedAction(report);
  const tone = blocker ? "warn" : "";

  return (
    <section className={`next-action${tone === "warn" ? " warn" : ""}`} data-testid="current-action-card">
      <div>
        <div className="lbl" style={{ marginBottom: 5 }}>
          {blocker ? "Current blocker" : "Ready"}
        </div>
        <h4 className="oc-title" style={{ color: "var(--paper)" }}>
          {blocker ? blocker.label : action ? action.label : "No action required."}
        </h4>
        {blocker ? (
          <div className="anno" style={{ color: "rgba(250,247,242,0.65)", marginTop: 4 }}>{blocker.reason_code}</div>
        ) : null}
      </div>
      <div className="row">
        {onOpenDetails ? <button type="button" className="btn ghost small" style={{ color: "rgba(250,247,242,0.75)", borderColor: "rgba(250,247,242,0.3)" }} onClick={onOpenDetails}>View details</button> : null}
        {action && onPrimaryAction ? (
          <button type="button" className="btn primary" onClick={() => onPrimaryAction(action.id)}>
            {action.button_label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </section>
  );
}

function pickBlocker(report) {
  if (report.criticality_tier === "A_HIGH_STAKES" &&
      ["unresolved", "not_attempted", null, undefined].includes(report.official_resolution_status)) {
    return { label: "Tier A recruitment requires official-source proof before promotion.", reason_code: "official_proof_missing" };
  }
  const openConflict = (report.conflicts || []).find((c) => (c?.status || "open") === "open");
  if (report.criticality_tier === "A_HIGH_STAKES" && openConflict) {
    return { label: "Unresolved consensus conflict — admin override required.", reason_code: "consensus_conflict_unresolved" };
  }
  const promotionBlocker = (report.risk_flags || []).find((f) => f?.blocking_level === "promotion_blocker");
  if (promotionBlocker) {
    return { label: "An eligibility-complexity rule is not yet represented as a canonical rule.", reason_code: "eligibility_rule_missing" };
  }
  return null;
}

function pickRecommendedAction(report) {
  const map = {
    confirm_suggested_proof: { id: "confirm_suggested_proof", label: "A suggested official URL is waiting for confirmation.", button_label: "Confirm proof" },
    resolve_conflict: { id: "resolve_conflict", label: "A consensus conflict needs your decision.", button_label: "Resolve conflict" },
    await_corrigendum: { id: "await_corrigendum", label: "Source updated — re-verify the recruitment.", button_label: "Open re-verification" },
    block_publish: { id: "block_publish", label: "Conditional rule detected — represent it as a canonical rule before publish.", button_label: "Add rule" },
    promote_eligible: { id: "promote_eligible", label: "All gates pass — ready to promote.", button_label: "Promote" },
    request_admin_review: { id: "request_admin_review", label: "Review the verification report.", button_label: "Open report" },
    await_official_proof: { id: "await_official_proof", label: "Awaiting official-source proof.", button_label: "Run resolver" },
    no_action: null,
  };
  return map[report.recommended_action] || null;
}
