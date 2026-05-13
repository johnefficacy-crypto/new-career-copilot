import React, { useState } from "react";
import { AlertTriangle, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import FieldReviewGroup from "./FieldReviewGroup";
import PostEligibilityReviewGroup from "./PostEligibilityReviewGroup";
import BlockerList from "./BlockerList";
import RecruitmentCriteriaPanel from "../recruitments/RecruitmentCriteriaPanel";
import { HIGH_RISK_QUEUE_FIELDS, RECOMMENDED_REVIEW_FIELDS } from "./adminWorkflowContract";

// AdminFixPanel concentrates blocker display + fix controls for both the
// selected scrape_queue item and the selected canonical recruitment so admins
// do not need to leave the Operations Console to fix the most common issues.
// Backend validate-publish remains the source of truth for publish readiness.
export default function AdminFixPanel({
  queueItem,
  recruitment,
  validateResult,
  onQueueFieldAction,
  onPromote,
  onMergeIntoExisting,
  onMarkDuplicate,
  onValidate,
  onVerify,
  onPublish,
  onOpenOfficialSourceResolver,
  busy,
}) {
  if (!queueItem && !recruitment) {
    return (
      <section className="soft-card rounded-2xl p-6 text-sm text-muted-foreground" data-testid="admin-fix-panel-empty">
        Select a queue item or a recruitment to view blockers and fix them in place.
      </section>
    );
  }

  return (
    <div className="space-y-4" data-testid="admin-fix-panel">
      {queueItem ? (
        <QueueFixSection
          item={queueItem}
          onFieldAction={onQueueFieldAction}
          onPromote={onPromote}
          onMergeIntoExisting={onMergeIntoExisting}
          onMarkDuplicate={onMarkDuplicate}
          onOpenOfficialSourceResolver={onOpenOfficialSourceResolver}
          busy={busy}
        />
      ) : null}
      {recruitment ? (
        <RecruitmentFixSection
          recruitment={recruitment}
          validateResult={validateResult}
          onValidate={onValidate}
          onVerify={onVerify}
          onPublish={onPublish}
          busy={busy}
        />
      ) : null}
    </div>
  );
}

function QueueFixSection({ item, onFieldAction, onPromote, onMergeIntoExisting, onMarkDuplicate, onOpenOfficialSourceResolver, busy }) {
  const blockers = item.unverified_fields || [];
  const dups = item.duplicate_candidates || [];
  const officialUnresolved = item.official_source_resolved === false;
  const dataQuality = typeof item.data_quality_score === "number" ? item.data_quality_score : null;
  const dataQualityPct = dataQuality != null ? Math.round(Math.max(0, Math.min(1, dataQuality)) * 100) : null;
  const lowQuality = dataQualityPct != null && dataQualityPct < 60;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="queue-fix-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Queue item fixes</div>
          <h3 className="font-heading text-xl">{item.recruitment || item.raw_extracted_item?.title || "Untitled candidate"}</h3>
          <p className="text-xs text-muted-foreground mt-1">Source: {item.source || "-"}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 text-xs">
          {dataQualityPct != null ? (
            <span className={`pill ${lowQuality ? "pill-amber" : "pill-sage"}`} data-testid="queue-data-quality">
              quality {dataQualityPct}%
            </span>
          ) : null}
          {officialUnresolved ? <span className="pill pill-amber">official source unresolved</span> : null}
          {dups.length ? <span className="pill pill-amber">duplicate candidate</span> : null}
        </div>
      </div>

      {lowQuality ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          Low data quality. Confirm extracted values are complete before promotion.
        </div>
      ) : null}

      {officialUnresolved ? (
        <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
            <div className="flex-1">
              <div className="font-semibold">Official source not resolved</div>
              <div>Backend gate blocks promotion until an official, verified source is linked.</div>
            </div>
            <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={onOpenOfficialSourceResolver} disabled={busy} data-testid="open-official-resolver">
              Resolve
            </button>
          </div>
        </div>
      ) : null}

      <div className="mt-4">
        <FieldReviewGroup
          extracted={item.raw_extracted_item || item.normalized_item || {}}
          evidence={item.field_evidence_status || {}}
          requiredFields={HIGH_RISK_QUEUE_FIELDS}
          recommendedFields={RECOMMENDED_REVIEW_FIELDS}
          onFieldAction={(field, action, correctedValue) => onQueueFieldActionSafe(onFieldAction, item.id, field, action, correctedValue)}
        />
      </div>

      <div className="mt-4">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Post-level eligibility review</div>
        <p className="text-xs text-muted-foreground mt-1">Eligibility matching relies on per-post age, education, and vacancy fields. Correcting these uses dotted paths (posts.0.min_age) so the backend patches the nested array instead of creating a flat key.</p>
        <div className="mt-3">
          <PostEligibilityReviewGroup
            posts={(item.raw_extracted_item || item.normalized_item || {}).posts}
            evidence={item.field_evidence_status || {}}
            onFieldAction={(path, action, correctedValue) => onQueueFieldActionSafe(onFieldAction, item.id, path, action, correctedValue)}
          />
        </div>
      </div>

      {dups.length ? (
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <div className="font-semibold text-amber-900">Possible duplicates</div>
          <ul className="mt-2 space-y-1 text-xs">
            {dups.slice(0, 3).map((d, i) => (
              <li key={d.id || i} className="flex flex-wrap items-center justify-between gap-2">
                <span>{d.name || d.title || d.id}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => onMergeIntoExisting?.(item, d)} disabled={busy}>
                    Preview merge
                  </button>
                  <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => onMarkDuplicate?.(item, d)} disabled={busy}>
                    Mark duplicate
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <button
          type="button"
          className="btn btn-primary h-9 text-xs"
          disabled={busy || !item.promotable || officialUnresolved}
          onClick={() => onPromote?.(item)}
          data-testid="fix-panel-promote"
        >
          Promote to draft
        </button>
        {blockers.length ? (
          <span className="text-xs text-amber-700 self-center">Blocked by: {blockers.join(", ")}</span>
        ) : null}
      </div>
    </section>
  );
}

function onQueueFieldActionSafe(handler, id, field, action, correctedValue) {
  try {
    return handler?.(id, field, action, correctedValue);
  } catch (err) {
    console.error("queue field action failed", err);
    return undefined;
  }
}

function RecruitmentFixSection({ recruitment, validateResult, onValidate, onVerify, onPublish, busy }) {
  const blockers = (validateResult?.blocking_issues || recruitment.blocking_issues || []);
  const [reviewing, setReviewing] = useState(false);
  return (
    <section className="soft-card rounded-2xl p-4" data-testid="recruitment-fix-section">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitment fixes</div>
          <h3 className="font-heading text-xl">{recruitment.name || "Untitled recruitment"}</h3>
          <p className="text-xs text-muted-foreground mt-1">
            publish_status: <code>{recruitment.publish_status || "unknown"}</code>
          </p>
        </div>
        <Link to={`/admin/recruitments?focus=${recruitment.id}`} className="btn btn-ghost h-8 text-xs">
          Open full editor <ExternalLink className="h-3 w-3" />
        </Link>
      </div>

      <div className="mt-3">
        <BlockerList blockers={blockers} />
      </div>

      {(blockers.includes("posts_missing") || blockers.includes("eligibility_rules_missing")) ? (
        <div className="mt-4" data-testid="recruitment-criteria-section">
          <RecruitmentCriteriaPanel recruitmentId={recruitment.id} onChanged={() => onValidate?.(recruitment)} />
        </div>
      ) : null}

      <div className="mt-4 flex flex-wrap gap-2 border-t border-border pt-3">
        <button type="button" className="btn btn-ghost h-9 text-xs" disabled={busy} onClick={async () => {
          setReviewing(true);
          try { await onValidate?.(recruitment); } finally { setReviewing(false); }
        }} data-testid="fix-panel-validate">
          {reviewing ? "Validating..." : "Validate publish readiness"}
        </button>
        <button
          type="button"
          className="btn btn-ghost h-9 text-xs"
          disabled={busy || !validateResult?.ready || recruitment.publish_status === "verified" || recruitment.publish_status === "published"}
          onClick={() => onVerify?.(recruitment)}
          data-testid="fix-panel-verify"
        >
          Mark verified
        </button>
        <button
          type="button"
          className="btn btn-primary h-9 text-xs"
          disabled={busy || recruitment.publish_status !== "verified"}
          onClick={() => onPublish?.(recruitment)}
          data-testid="fix-panel-publish"
        >
          Publish
        </button>
      </div>
    </section>
  );
}
