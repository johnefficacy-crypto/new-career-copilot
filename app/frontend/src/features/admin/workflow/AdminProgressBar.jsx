import React from "react";

const STEPS = [
  { id: "source_ready", label: "Source ready" },
  { id: "dry_scrape", label: "Dry scrape" },
  { id: "live_scrape", label: "Live scrape" },
  { id: "queue_review", label: "Queue review" },
  { id: "field_fixes", label: "Field fixes" },
  { id: "official_source_resolved", label: "Official source resolved" },
  { id: "promoted_draft", label: "Promoted draft" },
  { id: "draft_blockers_fixed", label: "Draft blockers fixed" },
  { id: "validated", label: "Validated" },
  { id: "verified", label: "Verified" },
  { id: "published", label: "Published" },
  { id: "eligibility_monitored", label: "Eligibility monitored" },
];

// state: { source, latestRun, queueItem, recruitment, validateResult, eligibilityOps }
// Returns { id -> { status: "pending"|"active"|"complete"|"blocked", reason?: string } }
export function computeProgress(state = {}) {
  const out = {};
  const { source, latestRun, queueItem, recruitment, validateResult, eligibilityOps } = state;

  const sourceType = source?.source_type || source?.kind;
  if (source) {
    if (sourceType === "aggregator") {
      out.source_ready = { status: "active", reason: "Aggregator: discovery-only. Confirm official source on each candidate." };
    } else if (source.is_verified && source.is_active !== false) {
      out.source_ready = { status: "complete" };
    } else if (source.is_active === false) {
      out.source_ready = { status: "blocked", reason: "Source is inactive." };
    } else {
      out.source_ready = { status: "blocked", reason: "Source not verified." };
    }
  } else {
    out.source_ready = { status: "pending", reason: "Select a source." };
  }

  if (latestRun?.mode === "dry" || latestRun?.triggered_by === "dry") {
    out.dry_scrape = { status: "complete" };
  } else if (latestRun) {
    out.dry_scrape = { status: "complete", reason: "Dry already implied by recent scrape run." };
  } else {
    out.dry_scrape = { status: "pending", reason: "Run a dry scrape." };
  }

  if (latestRun && latestRun.status === "completed") {
    out.live_scrape = { status: "complete" };
  } else if (latestRun && latestRun.status === "failed") {
    out.live_scrape = { status: "blocked", reason: "Last scrape run failed." };
  } else if (latestRun) {
    out.live_scrape = { status: "active", reason: `Last run status: ${latestRun.status || "unknown"}` };
  } else {
    out.live_scrape = { status: "pending", reason: "Run a live scrape." };
  }

  if (queueItem) {
    if (queueItem.status === "rejected" || queueItem.status === "duplicate") {
      out.queue_review = { status: "blocked", reason: `Item status: ${queueItem.status}` };
    } else if (queueItem.status === "approved" || queueItem.promoted_recruitment_id) {
      out.queue_review = { status: "complete" };
    } else {
      out.queue_review = { status: "active" };
    }
  } else {
    out.queue_review = { status: "pending", reason: "Select a queue item." };
  }

  if (queueItem) {
    const unverified = queueItem.unverified_fields || [];
    if (unverified.length === 0) {
      out.field_fixes = { status: "complete" };
    } else {
      out.field_fixes = { status: "blocked", reason: `Verify required fields: ${unverified.join(", ")}` };
    }
  } else {
    out.field_fixes = { status: "pending" };
  }

  if (queueItem) {
    if (queueItem.official_source_resolved === false) {
      out.official_source_resolved = { status: "blocked", reason: "Resolve official source before promotion." };
    } else if (queueItem.official_source_resolved === true) {
      out.official_source_resolved = { status: "complete" };
    } else {
      out.official_source_resolved = { status: "active", reason: "Official source resolution not required for this source." };
    }
  } else {
    out.official_source_resolved = { status: "pending" };
  }

  if (queueItem?.promoted_recruitment_id || recruitment) {
    out.promoted_draft = { status: "complete" };
  } else if (queueItem?.promotable) {
    out.promoted_draft = { status: "active", reason: "Ready to promote." };
  } else {
    out.promoted_draft = { status: "pending", reason: "Promotion blocked until field & source gates pass." };
  }

  const blockers = validateResult?.blocking_issues || recruitment?.blocking_issues || [];
  if (recruitment) {
    if (blockers.length === 0) {
      out.draft_blockers_fixed = { status: "complete" };
    } else {
      out.draft_blockers_fixed = { status: "blocked", reason: blockers.join(", ") };
    }
  } else {
    out.draft_blockers_fixed = { status: "pending" };
  }

  if (validateResult) {
    out.validated = validateResult.ready
      ? { status: "complete" }
      : { status: "blocked", reason: "Validate-publish reports blockers." };
  } else if (recruitment) {
    out.validated = { status: "active", reason: "Run validate-publish to confirm readiness." };
  } else {
    out.validated = { status: "pending" };
  }

  if (recruitment) {
    if (recruitment.publish_status === "verified" || recruitment.publish_status === "published") {
      out.verified = { status: "complete" };
    } else if (validateResult?.ready) {
      out.verified = { status: "active", reason: "Mark verified, then publish." };
    } else {
      out.verified = { status: "pending" };
    }
  } else {
    out.verified = { status: "pending" };
  }

  if (recruitment) {
    if (recruitment.publish_status === "published") {
      out.published = { status: "complete" };
    } else if (recruitment.publish_status === "verified") {
      out.published = { status: "active", reason: "Ready to publish." };
    } else {
      out.published = { status: "pending" };
    }
  } else {
    out.published = { status: "pending" };
  }

  if (recruitment?.publish_status === "published") {
    if (eligibilityOps) {
      out.eligibility_monitored = { status: "complete" };
    } else {
      out.eligibility_monitored = { status: "active", reason: "Monitor recompute and alerts." };
    }
  } else {
    out.eligibility_monitored = { status: "pending" };
  }

  return out;
}

const PHASES = [
  { id: "discovery", label: "Discovery", stepIds: ["source_ready", "dry_scrape", "live_scrape"] },
  { id: "review", label: "Review", stepIds: ["queue_review", "field_fixes", "official_source_resolved"] },
  { id: "promote", label: "Promote", stepIds: ["promoted_draft", "draft_blockers_fixed"] },
  { id: "publish", label: "Publish & Monitor", stepIds: ["validated", "verified", "published", "eligibility_monitored"] },
];

function rollupPhaseStatus(phaseSteps, progress) {
  let anyActive = false;
  let anyPending = false;
  let allComplete = true;
  for (const id of phaseSteps) {
    const s = (progress[id] || { status: "pending" }).status;
    if (s === "blocked") return "blocked";
    if (s === "active") anyActive = true;
    if (s === "pending") anyPending = true;
    if (s !== "complete") allComplete = false;
  }
  if (allComplete) return "complete";
  if (anyActive) return "active";
  if (anyPending) return "pending";
  return "pending";
}

function phaseClass(status) {
  if (status === "complete") return "phase done";
  if (status === "active") return "phase active";
  if (status === "blocked") return "phase blocked";
  return "phase";
}

function phaseCountLabel(stepIds, progress, status) {
  const done = stepIds.filter((id) => (progress[id]?.status) === "complete").length;
  const total = stepIds.length;
  if (status === "blocked") {
    const blocked = stepIds.filter((id) => (progress[id]?.status) === "blocked").length;
    return `blocked · ${blocked} fix`;
  }
  if (status === "active") return `${done} / ${total} active`;
  if (status === "complete") return `${done} / ${total} done`;
  return `${done} / ${total} pending`;
}

export default function AdminProgressBar({ state = {}, onStepClick }) {
  const progress = computeProgress(state);
  return (
    <section className="card" data-testid="admin-progress-bar">
      <div className="card-body">
        <div className="lbl" style={{ marginBottom: 8 }}>Pipeline · 4 phases · 12 steps</div>
        <div className="phase-rail">
          {PHASES.map((phase, phaseIndex) => {
            const phaseStatus = rollupPhaseStatus(phase.stepIds, progress);
            return (
              <button
                type="button"
                key={phase.id}
                className={phaseClass(phaseStatus)}
                onClick={() => onStepClick?.(phase.stepIds[0])}
                data-testid={`progress-phase-${phase.id}`}
                data-status={phaseStatus}
              >
                <div className="phase-num">{String(phaseIndex + 1).padStart(2, "0")}</div>
                <div className="phase-name">{phase.label}</div>
                <div className="phase-count">{phaseCountLabel(phase.stepIds, progress, phaseStatus)}</div>
              </button>
            );
          })}
        </div>
      </div>
    </section>
  );
}

export { STEPS as ADMIN_PROGRESS_STEPS, PHASES as ADMIN_PROGRESS_PHASES };
