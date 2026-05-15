import React from "react";
import { AlertTriangle, ArrowRight, CheckCircle2 } from "lucide-react";

// CurrentActionCard — PR plan §7 default surface.
// Renders exactly one blocker + one recommended next action + one
// primary button. The full checklist is hidden in WorkflowDetailsDrawer.
//
// All copy comes from the backend (reason_code, message, recommended_action).
// The frontend never derives business-truth labels per plan §7 "Frontend
// truth boundary".
export default function CurrentActionCard({ report, onPrimaryAction, onOpenDetails }) {
  if (!report) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50 p-5 text-sm text-gray-500">
        Select a queue item to see the recommended next action.
      </div>
    );
  }

  const blocker = pickBlocker(report);
  const action = blocker ? null : pickRecommendedAction(report);

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-5 shadow-sm">
      {blocker ? (
        <div className="flex items-start gap-3">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" aria-hidden="true" />
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-amber-700">
              Current blocker
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900">
              {blocker.label}
            </div>
            <div className="mt-1 text-xs text-gray-500">
              {blocker.reason_code}
            </div>
          </div>
        </div>
      ) : (
        <div className="flex items-start gap-3">
          <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" aria-hidden="true" />
          <div className="flex-1">
            <div className="text-xs font-semibold uppercase tracking-wide text-emerald-700">
              Ready
            </div>
            <div className="mt-1 text-sm font-medium text-gray-900">
              {action ? action.label : "No action required."}
            </div>
          </div>
        </div>
      )}

      <div className="mt-4 flex items-center justify-between gap-3">
        <button
          type="button"
          className="text-xs text-gray-500 underline-offset-2 hover:underline"
          onClick={onOpenDetails}
        >
          View workflow details
        </button>
        {action && onPrimaryAction ? (
          <button
            type="button"
            className="inline-flex h-9 items-center gap-2 rounded-xl bg-gray-900 px-4 text-sm font-semibold text-white hover:bg-gray-800"
            onClick={() => onPrimaryAction(action.id)}
          >
            {action.button_label}
            <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        ) : null}
      </div>
    </div>
  );
}

// Pure helpers — they map backend states to displayable labels.
// No business-truth derivation: every branch corresponds to a backend
// state that already names itself.

function pickBlocker(report) {
  // PR2: official proof.
  if (
    report.criticality_tier === "A_HIGH_STAKES" &&
    ["unresolved", "not_attempted", null, undefined].includes(report.official_resolution_status)
  ) {
    return {
      label: "Tier A recruitment requires official-source proof before promotion.",
      reason_code: "official_proof_missing",
    };
  }
  // PR3: open consensus conflict.
  const openConflict = (report.conflicts || []).find((c) => (c?.status || "open") === "open");
  if (report.criticality_tier === "A_HIGH_STAKES" && openConflict) {
    return {
      label: "Unresolved consensus conflict — admin override required.",
      reason_code: "consensus_conflict_unresolved",
    };
  }
  // PR4: complexity rule unrepresented.
  const promotionBlocker = (report.risk_flags || []).find(
    (f) => f?.blocking_level === "promotion_blocker",
  );
  if (promotionBlocker) {
    return {
      label: "An eligibility-complexity rule is not yet represented as a canonical rule.",
      reason_code: "eligibility_rule_missing",
    };
  }
  return null;
}

function pickRecommendedAction(report) {
  const map = {
    confirm_suggested_proof: {
      id: "confirm_suggested_proof",
      label: "A suggested official URL is waiting for confirmation.",
      button_label: "Confirm proof",
    },
    resolve_conflict: {
      id: "resolve_conflict",
      label: "A consensus conflict needs your decision.",
      button_label: "Resolve conflict",
    },
    await_corrigendum: {
      id: "await_corrigendum",
      label: "Source updated — re-verify the recruitment.",
      button_label: "Open re-verification",
    },
    block_publish: {
      id: "block_publish",
      label: "Conditional rule detected — represent it as a canonical rule before publish.",
      button_label: "Add rule",
    },
    promote_eligible: {
      id: "promote_eligible",
      label: "All gates pass — ready to promote.",
      button_label: "Promote",
    },
    request_admin_review: {
      id: "request_admin_review",
      label: "Review the verification report.",
      button_label: "Open report",
    },
    await_official_proof: {
      id: "await_official_proof",
      label: "Awaiting official-source proof.",
      button_label: "Run resolver",
    },
    no_action: null,
  };
  return map[report.recommended_action] || null;
}
