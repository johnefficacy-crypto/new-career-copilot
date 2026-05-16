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

// Build the workflow timeline for the side drawer from report columns.
// Each step has { id, status: "done"|"open"|"pending", label, sub, right }.
// Pure function — no fetches; everything is derived from the report row.
export function buildWorkflowSteps(report) {
  if (!report) return [];

  const steps = [];
  const officialStatus = report.official_resolution_status || "not_attempted";
  const officialMethod = report.official_resolution_method;
  const officialConfidence = report.official_resolution_confidence;
  const conflictsAll = report.conflicts || [];
  const conflictsOpen = openConflicts(report);
  const riskFlags = report.risk_flags || [];
  const complexityBlocker = riskFlags.some((f) => (f?.blocking_level || "") === "promotion_blocker");
  const complexityPublishBlocker = riskFlags.some((f) => (f?.blocking_level || "") === "publish_blocker");
  const promotable = report.recommended_action === "promote_eligible";
  const rejected = report.lifecycle_status === "rejected";

  steps.push({
    id: "scrape",
    status: "done",
    label: report.scrape_queue_id ? "scrape_queue insert" : "canonical-only backfill",
    sub: `${formatTime(report.created_at)} · ${report.scrape_queue_id ? `queue ${shortId(report.scrape_queue_id)}` : `recruitment ${shortId(report.recruitment_id)}`}`,
    right: "automated",
  });

  steps.push({
    id: "classify",
    status: "done",
    label: `classified · ${report.criticality_tier || "—"}${report.exam_family_key ? ` · ${report.exam_family_key}` : ""}`,
    sub: `${formatTime(report.created_at)} · recruitment_classifier`,
    right: "rule-based",
  });

  steps.push({
    id: "report",
    status: "done",
    label: `verification report created · v${report.report_version || 1}`,
    sub: `${formatTime(report.created_at)} · trigger=${report.trigger_reason || "—"}${report.chain_root_id ? ` · chain ${shortId(report.chain_root_id)}` : ""}`,
    right: "RPC",
  });

  if (officialStatus === "auto_resolved" || officialStatus === "admin_attached") {
    steps.push({
      id: "official",
      status: "done",
      label: `official resolver · ${officialMethod || "—"}${officialConfidence != null ? ` · confidence ${Number(officialConfidence).toFixed(2)}` : ""}`,
      sub: `official_resolution_status=${officialStatus}`,
      right: "automated",
    });
  } else if (officialStatus === "suggested") {
    steps.push({
      id: "official",
      status: "open",
      label: `official resolver · suggested · ${officialMethod || "—"}`,
      sub: `awaiting admin confirmation${officialConfidence != null ? ` · confidence ${Number(officialConfidence).toFixed(2)}` : ""}`,
      right: "needs admin",
    });
  } else if (officialStatus === "unresolved") {
    steps.push({
      id: "official",
      status: "open",
      label: "official resolver · unresolved",
      sub: "no source matched · needs manual attach",
      right: "needs admin",
    });
  } else {
    steps.push({
      id: "official",
      status: "pending",
      label: "official resolver",
      sub: `status=${officialStatus}`,
      right: "stage 2",
    });
  }

  if (conflictsAll.length === 0) {
    steps.push({
      id: "consensus",
      status: "done",
      label: "consensus engine · no conflicts",
      sub: report.evidence_summary && Object.keys(report.evidence_summary).length
        ? `${Object.keys(report.evidence_summary).length} fields compared`
        : "—",
      right: "automated",
    });
  } else {
    steps.push({
      id: "consensus",
      status: conflictsOpen.length > 0 ? "open" : "done",
      label: `consensus engine · ${conflictsAll.length} conflict${conflictsAll.length === 1 ? "" : "s"}`,
      sub: `${conflictsAll.length - conflictsOpen.length} resolved · ${conflictsOpen.length} open`,
      right: "automated",
    });
    for (const c of conflictsAll) {
      const isOpen = (c?.status || "open") === "open";
      steps.push({
        id: `conflict-${c?.conflict_id || c?.id}`,
        status: isOpen ? "open" : "done",
        label: `conflict · ${c?.conflict_key || c?.field_path || "—"}`,
        sub: c?.conflict_id ? `id ${shortId(c.conflict_id)}` : "—",
        right: isOpen ? "needs admin" : (c?.status || "resolved"),
      });
    }
  }

  if (riskFlags.length > 0) {
    steps.push({
      id: "complexity",
      status: complexityBlocker || complexityPublishBlocker ? "open" : "done",
      label: `eligibility complexity · ${riskFlags.length} flag${riskFlags.length === 1 ? "" : "s"}`,
      sub: complexityBlocker
        ? "promotion blocked: rule missing"
        : complexityPublishBlocker
          ? "publish blocked: rule missing"
          : "informational",
      right: "stage 4",
    });
  } else {
    steps.push({
      id: "complexity",
      status: "done",
      label: "eligibility complexity scan",
      sub: "no blocking flags",
      right: "stage 4",
    });
  }

  if (rejected) {
    steps.push({
      id: "gate",
      status: "done",
      label: "promotion gate · report rejected",
      sub: "lifecycle_status=rejected",
      right: "stage 5",
    });
  } else if (conflictsOpen.length > 0) {
    steps.push({
      id: "gate",
      status: "pending",
      label: "promotion gate check",
      sub: "blocked: consensus_conflict_unresolved",
      right: "stage 5",
    });
  } else if (complexityBlocker) {
    steps.push({
      id: "gate",
      status: "pending",
      label: "promotion gate check",
      sub: "blocked: eligibility_rule_missing",
      right: "stage 5",
    });
  } else if (promotable) {
    steps.push({
      id: "gate",
      status: "done",
      label: "promotion gate · open",
      sub: "all gates passed · ready to promote",
      right: "stage 5",
    });
  } else {
    steps.push({
      id: "gate",
      status: "pending",
      label: "promotion gate check",
      sub: `recommended_action=${report.recommended_action || "—"}`,
      right: "stage 5",
    });
  }

  // Downstream stages: not part of the gateway, but shown for context.
  steps.push({
    id: "promote",
    status: report.recruitment_id ? "done" : "pending",
    label: "draft promotion",
    sub: report.recruitment_id ? `recruitment ${shortId(report.recruitment_id)}` : "downstream · admin_trust",
    right: "manual",
  });
  steps.push({
    id: "validate",
    status: "pending",
    label: "validate & verify",
    sub: "downstream · admin_trust.py",
    right: "manual",
  });
  steps.push({
    id: "publish",
    status: "pending",
    label: "publish gate",
    sub: "downstream",
    right: "manual",
  });
  steps.push({
    id: "alerts",
    status: "pending",
    label: "eligibility recompute & alerts",
    sub: "downstream",
    right: "automated",
  });

  return steps;
}

export function buildChainHistory(report) {
  // The chain itself lives across multiple rows. The current row carries
  // chain_root_id + report_version + superseded_by but not the siblings.
  // Step 3's drawer only needs a "current vs prior" hint; the full chain
  // listing is a follow-up that paginates a dedicated endpoint.
  if (!report) return [];
  const out = [];
  out.push({
    id: "current",
    badge: `v${report.report_version || 1}`,
    label: `current · ${report.lifecycle_status || "—"}`,
    sub: `${formatTime(report.updated_at || report.created_at)} · trigger=${report.trigger_reason || "—"}`,
    right: "active",
  });
  if ((report.report_version || 1) > 1) {
    out.push({
      id: "prior",
      badge: `v${Math.max(1, (report.report_version || 1) - 1)}`,
      label: "prior version",
      sub: report.chain_root_id ? `chain_root ${shortId(report.chain_root_id)}` : "—",
      right: "closed",
    });
  }
  return out;
}
