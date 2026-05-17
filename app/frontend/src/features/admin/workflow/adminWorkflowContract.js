export const ADMIN_WORKFLOW_STEPS = [
  "Sources",
  "Scrape",
  "Candidate review",
  "Recruitment Draft",
  "Validate",
  "Publish",
  "Eligibility",
];

export const ADMIN_ROUTES_BY_STEP = {
  Sources: "/admin/sources",
  Scrape: "/admin/scraper",
  "Candidate review": "/admin/scraper",
  "Recruitment Draft": "/admin/recruitments",
  Validate: "/admin/recruitments",
  Publish: "/admin/recruitments",
  Eligibility: "/admin/eligibility-queue",
};

export const SOURCE_TYPE_LABELS = {
  aggregator: "Aggregator/listing page",
  official_html: "Official HTML page",
  official_pdf: "Official PDF",
  rss: "RSS feed",
  sitemap: "Sitemap",
  api: "API source",
};

export const QUEUE_ACTION_LABELS = {
  approve: "Mark reviewed only",
  reject: "Reject candidate",
  promote: "Promote to recruitment draft",
};

export const RECRUITMENT_BLOCKER_LABELS = {
  organization_missing: "Link an organization before publishing.",
  organization_unverified: "Organization is not verified.",
  official_notification_url_missing: "Official notification URL is missing.",
  official_apply_url_missing_while_open: "Open recruitment requires official apply URL.",
  apply_dates_reversed: "Apply start date is after apply end date.",
  apply_dates_invalid: "Apply dates are invalid.",
  posts_missing: "Posts are missing.",
  eligibility_rules_missing: "Eligibility rules are missing.",
  source_provenance_missing: "Source provenance is missing.",
  source_provenance_not_found: "Linked source no longer exists.",
  unverified_source_provenance: "Linked source is not verified.",
  readiness_check_failed: "Readiness check failed.",
};

export const RECRUITMENT_BLOCKER_NEXT_ACTIONS = {
  organization_missing: "Open recruitment edit panel and set organization.",
  organization_unverified: "Open Organizations and verify the organization.",
  official_notification_url_missing: "Add official notification URL.",
  official_apply_url_missing_while_open: "Add official apply URL or change lifecycle status.",
  apply_dates_reversed: "Correct recruitment dates.",
  apply_dates_invalid: "Correct recruitment dates.",
  posts_missing: "Add or confirm post records.",
  eligibility_rules_missing: "Add age/education criteria or mark rules unavailable only if backend supports it.",
  source_provenance_missing: "Link a verified official source.",
  source_provenance_not_found: "Relink source.",
  unverified_source_provenance: "Verify source before publishing.",
  readiness_check_failed: "Inspect backend error and retry validation.",
};

export const HIGH_RISK_QUEUE_FIELDS = [
  "apply_end_date",
  "official_notification_url",
  "official_apply_url",
  "organization_name",
  "total_vacancies",
  // Post-scoped. FieldReviewGroup already renders this per post with a
  // boolean correction control; before this, the backend gate blocked
  // promotion on missing requires_domicile evidence but the drawer
  // never surfaced the row, dead-ending the reviewer.
  "requires_domicile",
];

export const RECOMMENDED_REVIEW_FIELDS = [
  "title",
  "notification_date",
  "apply_start_date",
];

export const NEXT_ACTION_MESSAGES = {
  sourceVerify: "Verify official sources before using them as recruitment provenance.",
  aggregatorDiscovery: "Aggregator sources are discovery-only. Use them to discover candidates, then confirm from official source.",
  runDryScrape: "Next: run a dry scrape from Scraper.",
  runDryFirst: "Run dry scrape first. Live scrape only queues candidates; it does not publish.",
  reviewQueue: "Open each queued candidate, verify high-risk fields, then promote to recruitment draft.",
  promoteBlocked: "Verify required high-risk fields before promotion.",
  validateRecruitment: "Recruitment draft created. Next: open Recruitments and validate publish readiness.",
  fixRecruitmentBlockers: "Fix blockers before verification or publishing.",
  validateThenVerify: "Validate publish readiness, then verify.",
  readyToPublish: "Ready to publish.",
  monitorEligibility: "Monitor eligibility recompute and alerts.",
  promotionQueueToRecruitments: "After promotion, go to Recruitments and validate publish readiness.",
  verifyOrganization: "Verify organization before publishing linked recruitments.",
  validateLinkedRecruitments: "Next: validate linked recruitments.",
};

export function getNextActionForSource(source) {
  const type = source?.source_type || source?.kind;
  if (type === "aggregator") return NEXT_ACTION_MESSAGES.aggregatorDiscovery;
  if (!source?.is_verified) return NEXT_ACTION_MESSAGES.sourceVerify;
  return NEXT_ACTION_MESSAGES.runDryScrape;
}

export function getNextActionForQueueItem(item) {
  const unverified = item?.unverified_fields || [];
  if (unverified.length) return `Promote blocked. Verify required fields: ${unverified.join(", ")}.`;
  if (item?.promotable) return "Promote to recruitment draft, then validate publish readiness.";
  return NEXT_ACTION_MESSAGES.reviewQueue;
}

export function getNextActionForRecruitment(row) {
  if ((row?.blocking_issues || []).length) return NEXT_ACTION_MESSAGES.fixRecruitmentBlockers;
  if (row?.publish_status === "published") return NEXT_ACTION_MESSAGES.monitorEligibility;
  if (row?.publish_status === "verified") return NEXT_ACTION_MESSAGES.readyToPublish;
  if (row?.publish_status === "needs_review") return NEXT_ACTION_MESSAGES.validateThenVerify;
  return "Inspect readiness before changing trust status.";
}

export function getBlockerLabel(code) {
  return RECRUITMENT_BLOCKER_LABELS[code] || "Backend readiness blocker.";
}

export function getBlockerNextAction(code) {
  return RECRUITMENT_BLOCKER_NEXT_ACTIONS[code] || "Inspect backend response and resolve this blocker.";
}
