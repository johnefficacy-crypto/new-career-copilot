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

export default function AdminProgressBar({ state = {}, onStepClick }) {
  const progress = computeProgress(state);
  return (
    <nav className="soft-card rounded-2xl p-3" aria-label="Scraper-to-publish progress" data-testid="admin-progress-bar">
      <ol className="flex flex-wrap items-center gap-2 text-xs">
        {STEPS.map((step, index) => {
          const node = progress[step.id] || { status: "pending" };
          const Icon = node.status === "complete" ? Check : node.status === "blocked" ? AlertTriangle : Circle;
          const tone =
            node.status === "complete" ? "border-sage-300 bg-sage-100 text-sage-900"
            : node.status === "active" ? "border-clay-300 bg-clay-50 text-foreground"
            : node.status === "blocked" ? "border-amber-300 bg-amber-50 text-amber-900"
            : "border-border bg-white/60 text-muted-foreground";
          return (
            <li key={step.id}>
              <button
                type="button"
                onClick={() => onStepClick?.(step.id)}
                className={`inline-flex items-center gap-2 rounded-full border px-3 py-1.5 ${tone}`}
                title={node.reason || step.label}
                data-testid={`progress-step-${step.id}`}
                data-status={node.status}
              >
                <span className="font-mono text-[10px]">{index + 1}</span>
                <Icon className="h-3.5 w-3.5" />
                <span className="font-medium">{step.label}</span>
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}

export { STEPS as ADMIN_PROGRESS_STEPS };
