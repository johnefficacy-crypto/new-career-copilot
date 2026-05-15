import React from "react";
import { Check, Circle, AlertTriangle } from "lucide-react";

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

  // 1. Source ready
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

  // 2. Dry scrape
  if (latestRun?.mode === "dry" || latestRun?.triggered_by === "dry") {
    out.dry_scrape = { status: "complete" };
  } else if (latestRun) {
    out.dry_scrape = { status: "complete", reason: "Dry already implied by recent scrape run." };
  } else {
    out.dry_scrape = { status: "pending", reason: "Run a dry scrape." };
  }

  // 3. Live scrape
  if (latestRun && latestRun.status === "completed") {
    out.live_scrape = { status: "complete" };
  } else if (latestRun && latestRun.status === "failed") {
    out.live_scrape = { status: "blocked", reason: "Last scrape run failed." };
  } else if (latestRun) {
    out.live_scrape = { status: "active", reason: `Last run status: ${latestRun.status || "unknown"}` };
  } else {
    out.live_scrape = { status: "pending", reason: "Run a live scrape." };
  }

  // 4. Queue review
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

  // 5. Field fixes
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

  // 6. Official source resolved
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

  // 7. Promoted draft
  if (queueItem?.promoted_recruitment_id || recruitment) {
    out.promoted_draft = { status: "complete" };
  } else if (queueItem?.promotable) {
    out.promoted_draft = { status: "active", reason: "Ready to promote." };
  } else {
    out.promoted_draft = { status: "pending", reason: "Promotion blocked until field & source gates pass." };
  }

  // 8. Draft blockers fixed
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

  // 9. Validated
  if (validateResult) {
    out.validated = validateResult.ready
      ? { status: "complete" }
      : { status: "blocked", reason: "Validate-publish reports blockers." };
  } else if (recruitment) {
    out.validated = { status: "active", reason: "Run validate-publish to confirm readiness." };
  } else {
    out.validated = { status: "pending" };
  }

  // 10. Verified
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

  // 11. Published
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

  // 12. Eligibility monitored
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

// Sub-steps grouped into four phases. The full 12-step row used to wrap
// onto 3 rows on a laptop and was hard to scan; the phase header gives an
// at-a-glance status, the dots fill in the detail without taking width.
const PHASES = [
  { id: "discovery", label: "Discovery", stepIds: ["source_ready", "dry_scrape", "live_scrape"] },
  { id: "review", label: "Review", stepIds: ["queue_review", "field_fixes", "official_source_resolved"] },
  { id: "promote", label: "Promote", stepIds: ["promoted_draft", "draft_blockers_fixed"] },
  { id: "publish", label: "Publish & Monitor", stepIds: ["validated", "verified", "published", "eligibility_monitored"] },
];

function rollupPhaseStatus(phaseSteps, progress) {
  // Phase status priority: blocked > active > pending > complete-all.
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

function toneFor(status) {
  if (status === "complete") return "border-sage-300 bg-sage-100 text-sage-900";
  if (status === "active") return "border-clay-300 bg-clay-50 text-foreground";
  if (status === "blocked") return "border-amber-300 bg-amber-50 text-amber-900";
  return "border-border bg-white/60 text-muted-foreground";
}

function iconFor(status) {
  if (status === "complete") return Check;
  if (status === "blocked") return AlertTriangle;
  return Circle;
}

const STEP_LABEL_BY_ID = Object.fromEntries(STEPS.map((s) => [s.id, s.label]));

export default function AdminProgressBar({ state = {}, onStepClick }) {
  const progress = computeProgress(state);
  return (
    <nav className="soft-card rounded-2xl p-3" aria-label="Scraper-to-publish progress" data-testid="admin-progress-bar">
      <ol className="flex flex-wrap gap-2 text-xs">
        {PHASES.map((phase, phaseIndex) => {
          const phaseStatus = rollupPhaseStatus(phase.stepIds, progress);
          const PhaseIcon = iconFor(phaseStatus);
          const phaseTone = toneFor(phaseStatus);
          const completedCount = phase.stepIds.filter((id) => (progress[id]?.status) === "complete").length;
          return (
            <li key={phase.id} className="flex-1 min-w-[180px]" data-testid={`progress-phase-${phase.id}`} data-status={phaseStatus}>
              <div className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 ${phaseTone}`}>
                <div className="flex items-center gap-2 min-w-0">
                  <span className="font-mono text-[10px] opacity-75">{phaseIndex + 1}</span>
                  <PhaseIcon className="h-3.5 w-3.5 shrink-0" />
                  <span className="font-semibold truncate">{phase.label}</span>
                </div>
                <span className="text-[10px] font-mono opacity-75 shrink-0">{completedCount}/{phase.stepIds.length}</span>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {phase.stepIds.map((id) => {
                  const node = progress[id] || { status: "pending" };
                  const StepIcon = iconFor(node.status);
                  const stepTone = toneFor(node.status);
                  return (
                    <button
                      key={id}
                      type="button"
                      onClick={() => onStepClick?.(id)}
                      title={node.reason ? `${STEP_LABEL_BY_ID[id]} — ${node.reason}` : STEP_LABEL_BY_ID[id]}
                      aria-label={`${STEP_LABEL_BY_ID[id]} — ${node.status}`}
                      data-testid={`progress-step-${id}`}
                      data-status={node.status}
                      className={`inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] ${stepTone}`}
                    >
                      <StepIcon className="h-3 w-3" />
                      <span className="hidden xl:inline">{STEP_LABEL_BY_ID[id]}</span>
                    </button>
                  );
                })}
              </div>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { STEPS as ADMIN_PROGRESS_STEPS, PHASES as ADMIN_PROGRESS_PHASES };
