// Pure helpers shared by the VGC components. Keep these free of React /
// JSX so the same shape names can be reused server-to-client without a
// transform.

export const TIER_LABELS = {
  A_HIGH_STAKES: { short: "A", long: "A · high stakes", className: "tier-a" },
  B_TECHNICAL_CONDITIONAL: { short: "B", long: "B · technical/conditional", className: "tier-b" },
  C_STANDARD_LONG_TAIL: { short: "C", long: "C · standard", className: "tier-c" },
};

// Sticky one-liner for the queue-item action arrow. Picked from
// recommended_action first; falls back to lifecycle_status if the
// action is "no_action".
export const RECOMMENDED_ACTION_LABEL = {
  await_official_proof: "→ await official proof",
  request_admin_review: "→ request admin review",
  promote_eligible: "→ promote eligible",
  block_publish: "→ block publish",
  no_action: "→ review",
  confirm_suggested_proof: "→ confirm suggested proof",
  resolve_conflict: "→ resolve conflict",
  await_corrigendum: "→ await corrigendum",
};

// Pill descriptor chosen from the most-blocking signal on the report.
// Returns { cls, text }.
export function lifecyclePill(report) {
  const lc = report?.lifecycle_status || "";
  const rec = report?.recommended_action || "";
  const stale = report?.staleness_status || "fresh";
  if (lc === "conflict" || lc === "admin_override_required") {
    return { cls: "badge blocker", text: "conflict" };
  }
  if (lc === "rejected") return { cls: "badge plain", text: "rejected" };
  if (lc === "superseded") return { cls: "badge plain", text: "superseded" };
  if (lc === "consensus_pending") return { cls: "badge neutral", text: "consensus pending" };
  if (lc === "complexity_detected") return { cls: "badge blocker", text: "publish blocker" };
  if (lc === "stale_source_changed" || lc === "stale_canonical_changed" || stale !== "fresh") {
    return { cls: "badge pending", text: "stale source" };
  }
  if (lc === "needs_reverification") return { cls: "badge pending", text: "needs reverification" };
  if (lc === "backfilled_needs_review") return { cls: "badge plain", text: "backfilled" };
  if (rec === "confirm_suggested_proof") return { cls: "badge pending", text: "suggested proof" };
  if (rec === "await_official_proof") return { cls: "badge blocker", text: "unresolved" };
  if (rec === "block_publish") return { cls: "badge blocker", text: "publish blocker" };
  if (rec === "promote_eligible") return { cls: "badge resolved", text: "official resolved" };
  return { cls: "badge resolved", text: "classified" };
}

// Decide which variant of the report pane to render. Mirrors the
// HTML mock's three states (suggested / conflict / resolved) but
// folds the rest of the recommended_action enum into the closest
// match so every real report has a non-empty pane.
export function reportPaneVariant(report) {
  if (!report) return "empty";
  const lc = report.lifecycle_status || "";
  const rec = report.recommended_action || "";
  const openConflicts = (report.conflicts || []).filter((c) => (c?.status || "open") === "open");
  if (openConflicts.length > 0 || lc === "conflict" || lc === "admin_override_required") return "conflict";
  if (rec === "confirm_suggested_proof") return "suggested";
  return "resolved";
}

export function openConflicts(report) {
  return (report?.conflicts || []).filter((c) => (c?.status || "open") === "open");
}

export function isAggregatorOnlyConflict(conflict) {
  const values = conflict?.candidate_values || conflict?.values || [];
  if (!values.length) return false;
  return values.every((v) => (v?.source_kind || "").toLowerCase().includes("aggregator"));
}

export function formatTime(value) {
  if (!value) return "—";
  try {
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return value;
    return d.toLocaleString("en-IN", {
      hour: "2-digit", minute: "2-digit",
      day: "2-digit", month: "short",
    });
  } catch (_e) {
    return value;
  }
}

export function shortId(value) {
  if (!value) return "—";
  const s = String(value);
  return s.length > 10 ? s.slice(0, 10) : s;
}

