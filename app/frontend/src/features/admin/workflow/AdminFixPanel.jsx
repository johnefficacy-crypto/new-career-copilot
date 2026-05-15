import React, { useState } from "react";
import { AlertTriangle, ArrowRight, Compass, ExternalLink } from "lucide-react";
import { Link } from "react-router-dom";
import FieldReviewGroup from "./FieldReviewGroup";
import PostEligibilityReviewGroup from "./PostEligibilityReviewGroup";
import BlockerList from "./BlockerList";
import RecruitmentCriteriaPanel from "../recruitments/RecruitmentCriteriaPanel";
import RecruitmentBlockerFixForm from "../recruitments/RecruitmentBlockerFixForm";
import { HIGH_RISK_QUEUE_FIELDS, RECOMMENDED_REVIEW_FIELDS } from "./adminWorkflowContract";
import { scoreToPct, isLowQuality } from "./scoreUtils";

// AdminFixPanel concentrates blocker display + fix controls for both the
// selected scrape_queue item and the selected canonical recruitment so admins
// do not need to leave the Operations Console to fix the most common issues.
// Backend validate-publish remains the source of truth for publish readiness.
export default function AdminFixPanel({
  queueItem,
  recruitment,
  validateResult,
  sources = [],
  nextAction = null,
  onQueueFieldAction,
  onPromote,
  onMergeIntoExisting,
  onMarkDuplicate,
  onValidate,
  onVerify,
  onPublish,
  onOpenOfficialSourceResolver,
  onJumpToTarget,
  busy,
}) {
  if (!queueItem && !recruitment) {
    return <NextActionEmpty nextAction={nextAction} onJump={onJumpToTarget} />;
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
          sources={sources}
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
  const dataQualityPct = scoreToPct(item.data_quality_score);
  const lowQuality = isLowQuality(item.data_quality_score);

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
          evidenceDetails={item.field_evidence_details || []}
          requiredFields={HIGH_RISK_QUEUE_FIELDS}
          recommendedFields={RECOMMENDED_REVIEW_FIELDS}
          onFieldAction={(field, action, correctedValue, scope) => onQueueFieldActionSafe(onFieldAction, item.id, field, action, correctedValue, scope)}
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
            {dups.slice(0, 3).map((d, i) => {
              const dupId = d.recruitment_id || d.id;
              return (
              <li key={dupId || i} className="flex flex-wrap items-center justify-between gap-2">
                <span>{d.name || d.title || dupId}</span>
                <div className="flex gap-1">
                  <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => onMergeIntoExisting?.(item, d)} disabled={busy}>
                    Preview merge
                  </button>
                  <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => onMarkDuplicate?.(item, d)} disabled={busy}>
                    Mark duplicate
                  </button>
                </div>
              </li>
              );
            })}
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

function onQueueFieldActionSafe(handler, id, field, action, correctedValue, scope) {
  try {
    return handler?.(id, field, action, correctedValue, scope);
  } catch (err) {
    console.error("queue field action failed", err);
    return undefined;
  }
}

function RecruitmentFixSection({ recruitment, validateResult, sources = [], onValidate, onVerify, onPublish, busy }) {
  const blockers = (validateResult?.blocking_issues || recruitment.blocking_issues || []);
  const [reviewing, setReviewing] = useState(false);
  const NON_CRITERIA_BLOCKERS = new Set([
    "organization_missing",
    "organization_unverified",
    "official_notification_url_missing",
    "official_apply_url_missing_while_open",
    "apply_dates_reversed",
    "apply_dates_invalid",
    "source_provenance_missing",
    "source_provenance_not_found",
    "unverified_source_provenance",
  ]);
  const nonCriteriaBlockers = blockers.filter((b) => NON_CRITERIA_BLOCKERS.has(b));
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

      {nonCriteriaBlockers.length ? (
        <div className="mt-4" data-testid="recruitment-blocker-fix-section">
          <RecruitmentBlockerFixForm
            recruitment={recruitment}
            blockers={nonCriteriaBlockers}
            sources={sources}
            onChanged={() => onValidate?.(recruitment)}
          />
        </div>
      ) : null}

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

// Replaces the bare "Select a queue item or a recruitment..." empty state.
// Reads the first actionable checklist item (first blocked, then first todo)
// and renders it as a CTA so the right column always has something useful.
function NextActionEmpty({ nextAction, onJump }) {
  const status = nextAction?.status || "todo";
  const tone = status === "blocked"
    ? "border-amber-300 bg-amber-50 text-amber-900"
    : status === "done"
      ? "border-sage-300 bg-sage-50 text-sage-900"
      : "border-clay-300 bg-clay-50 text-foreground";
  const label = nextAction?.label || "Pick a workflow target on the left";
  const reason = nextAction?.reason;
  const hint = nextAction?.hint;
  const ctaLabel = nextAction?.target ? "Jump to action" : "Select something to fix";
  return (
    <section className="soft-card rounded-2xl p-6" data-testid="admin-fix-panel-empty">
      <div className="flex items-start gap-3">
        <div className="rounded-full bg-dusk-700/10 p-2 shrink-0">
          <Compass className="h-5 w-5 text-dusk-700" aria-hidden="true" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Next safe action</div>
          <h3 className="font-heading text-lg mt-0.5">{label}</h3>
          {reason ? <p className="mt-1 text-sm text-muted-foreground" data-testid="empty-next-reason">{reason}</p> : null}
          {hint ? <p className="mt-1 text-xs text-muted-foreground">{hint}</p> : null}
          <div className={`mt-3 inline-flex items-center gap-2 rounded-full border px-2 py-1 text-[11px] ${tone}`} data-testid="empty-next-status">
            <span className="font-semibold uppercase tracking-widest">{status}</span>
          </div>
          <div className="mt-4">
            <button
              type="button"
              className="btn btn-primary h-9 text-xs"
              onClick={() => onJump?.(nextAction?.target, nextAction)}
              disabled={!nextAction?.target}
              data-testid="empty-next-cta"
            >
              {ctaLabel}
              <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
