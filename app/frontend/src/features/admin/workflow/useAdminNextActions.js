import { useMemo } from "react";
import { computeProgress } from "./AdminProgressBar";

// Returns ordered checklist items for the Operations Console.
// Each item: { id, status: "todo"|"done"|"blocked", label, hint?, target?, reason? }
export default function useAdminNextActions(state) {
  return useMemo(() => buildChecklist(state || {}), [state]);
}

export function buildChecklist(state) {
  const items = [];
  const { source, queueItem, recruitment, validateResult, conflicts } = state;
  const progress = computeProgress(state);
  const openConflictCount = (conflicts || []).filter((c) => (c?.status || "open") === "open").length;

  // ── Before scraping ────────────────────────────────────────────────
  items.push({
    id: "select_source",
    label: "Select or add a source",
    status: source ? "done" : "todo",
    target: "source-list",
  });
  items.push({
    id: "source_active",
    label: "Mark source active",
    status: !source ? "todo" : source.is_active !== false ? "done" : "blocked",
    reason: source && source.is_active === false ? "Source is inactive" : undefined,
    target: "source-list",
  });
  items.push({
    id: "source_verified",
    label: "Verify official source or mark aggregator discovery-only",
    status: !source ? "todo" : source.is_verified || source.source_type === "aggregator" ? "done" : "blocked",
    reason: source && !source.is_verified && source.source_type !== "aggregator" ? "Source unverified" : undefined,
    target: "source-list",
  });
  items.push({
    id: "crawler_rules",
    label: "Configure crawler include/exclude/allowed domains",
    status: source ? "done" : "todo",
    hint: "Manage from Source Registry. Empty rules are acceptable.",
    target: "source-list",
  });
  items.push({
    id: "run_dry",
    label: "Run dry scrape",
    status: progress.dry_scrape.status === "complete" ? "done" : "todo",
    target: "run-controls",
  });
  items.push({
    id: "run_live",
    label: "Run live scrape",
    status:
      progress.live_scrape.status === "complete" ? "done"
      : progress.live_scrape.status === "blocked" ? "blocked"
      : "todo",
    reason: progress.live_scrape.reason,
    target: "run-controls",
  });

  // ── After scraping ─────────────────────────────────────────────────
  items.push({
    id: "review_candidate",
    label: "Review candidate from queue",
    status: queueItem ? "done" : "todo",
    target: "queue-list",
  });
  items.push({
    id: "high_risk_fields",
    label: "Verify/correct high-risk fields",
    status: !queueItem ? "todo"
      : (queueItem.unverified_fields || []).length === 0 ? "done"
      : "blocked",
    reason: queueItem ? `Unverified: ${(queueItem.unverified_fields || []).join(", ") || "none"}` : undefined,
    target: "fix-panel",
  });
  items.push({
    id: "post_fields",
    label: "Verify/correct post-level fields",
    status: !queueItem ? "todo"
      : Array.isArray(queueItem.raw_extracted_item?.posts) && queueItem.raw_extracted_item.posts.length
        ? "done"
        : "todo",
    hint: "Post-level eligibility fields (min_age, max_age, education, vacancies) drive matching.",
    target: "fix-panel",
  });
  items.push({
    id: "official_source",
    label: "Resolve official source if unverified",
    status: !queueItem ? "todo"
      : queueItem.official_source_resolved === false ? "blocked"
      : "done",
    reason: queueItem?.official_source_resolved === false ? "Backend gate: unverified_official_source" : undefined,
    target: "fix-panel",
  });
  items.push({
    id: "consensus_conflicts",
    label: "Resolve consensus conflicts",
    status: !queueItem ? "todo"
      : openConflictCount > 0 ? "blocked"
      : "done",
    reason: openConflictCount > 0
      ? `${openConflictCount} field${openConflictCount === 1 ? "" : "s"} disagree across sources`
      : undefined,
    target: "fix-panel-conflicts",
  });
  items.push({
    id: "duplicate_check",
    label: "Check duplicate candidates",
    status: !queueItem ? "todo"
      : (queueItem.duplicate_candidates && queueItem.duplicate_candidates.length) ? "blocked"
      : "done",
    reason: (queueItem?.duplicate_candidates || []).length ? "Duplicate candidate detected" : undefined,
    target: "fix-panel",
  });
  items.push({
    id: "promote",
    label: "Promote queue item to recruitment draft",
    status: !queueItem ? "todo"
      : queueItem.promoted_recruitment_id ? "done"
      : queueItem.promotable && queueItem.official_source_resolved !== false ? "todo"
      : "blocked",
    reason: queueItem && !queueItem.promotable ? "Backend gate not passed yet" : undefined,
    target: "fix-panel",
  });
  items.push({
    id: "draft_blockers",
    label: "Fix promoted recruitment draft blockers",
    status: !recruitment ? "todo"
      : (validateResult?.blocking_issues || recruitment.blocking_issues || []).length === 0 ? "done"
      : "blocked",
    reason: ((validateResult?.blocking_issues || recruitment?.blocking_issues) || []).join(", ") || undefined,
    target: "recruitment-fixes",
  });
  items.push({
    id: "validate",
    label: "Validate publish readiness",
    status: !recruitment ? "todo"
      : validateResult?.ready ? "done"
      : validateResult ? "blocked"
      : "todo",
    reason: validateResult && !validateResult.ready ? "Validate-publish reports blockers" : undefined,
    target: "recruitment-fixes",
  });
  items.push({
    id: "verify",
    label: "Mark recruitment verified",
    status: !recruitment ? "todo"
      : recruitment.publish_status === "verified" || recruitment.publish_status === "published" ? "done"
      : validateResult?.ready ? "todo"
      : "blocked",
    target: "recruitment-fixes",
  });
  items.push({
    id: "publish",
    label: "Publish recruitment",
    status: !recruitment ? "todo"
      : recruitment.publish_status === "published" ? "done"
      : recruitment.publish_status === "verified" ? "todo"
      : "blocked",
    target: "recruitment-fixes",
  });
  items.push({
    id: "monitor_eligibility",
    label: "Monitor eligibility recompute / alerts",
    status: recruitment?.publish_status === "published" ? "todo" : "todo",
    target: "eligibility-ops",
  });

  return items;
}
