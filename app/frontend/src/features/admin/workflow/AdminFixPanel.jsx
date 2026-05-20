import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import FieldReviewGroup from "./FieldReviewGroup";
import PostEligibilityReviewGroup from "./PostEligibilityReviewGroup";
import BlockerList from "./BlockerList";
import ConflictResolver from "./ConflictResolver";
import PromotionPreviewPanel from "./PromotionPreviewPanel";
import OfficialSourceQuickResolver from "./OfficialSourceQuickResolver";
import RecruitmentCriteriaPanel from "../recruitments/RecruitmentCriteriaPanel";
import RecruitmentBlockerFixForm from "../recruitments/RecruitmentBlockerFixForm";
import { HIGH_RISK_QUEUE_FIELDS, RECOMMENDED_REVIEW_FIELDS } from "./adminWorkflowContract";
import { scoreToPct, isLowQuality } from "./scoreUtils";

// Scroll a field-row anchor into view + briefly highlight it. The
// PromotionPreviewPanel blocker pills and the inline error callouts
// all dispatch through this so the admin doesn't have to hunt for
// the right row in a long table.
function scrollToFieldAnchor(field) {
  if (!field || typeof document === "undefined") return;
  const target = document.getElementById(`field-${field}`);
  if (!target) return;
  target.scrollIntoView({ behavior: "smooth", block: "center" });
  target.classList.add("fld-flash");
  window.setTimeout(() => target.classList.remove("fld-flash"), 1400);
}

const AGGREGATOR_KINDS = new Set(["aggregator", "aggregator_listing"]);

function conflictIsAggregatorOnly(conflict) {
  const candidates = conflict?.candidates || [];
  if (!candidates.length) return false;
  return candidates.every((c) => AGGREGATOR_KINDS.has((c?.source_kind || "").toLowerCase()));
}

// Source-tier mapping: A = official, B = institutional, C = aggregator.
function tierForItem(item) {
  const tier = (item?.source_tier || "").toUpperCase();
  if (tier === "A" || tier === "B" || tier === "C") return tier;
  const kind = (item?.source_type || item?.source_kind || "").toLowerCase();
  if (kind === "aggregator") return "C";
  if (kind === "institutional" || kind === "institution") return "B";
  return "A";
}

function statusBadge(item) {
  const status = (item?.status || "pending").toLowerCase();
  if (status === "approved") return { cls: "badge resolved", text: "resolved" };
  if (status === "rejected") return { cls: "badge neutral", text: "rejected" };
  if (status === "duplicate") return { cls: "badge neutral", text: "duplicate" };
  if (status === "merged") return { cls: "badge info", text: "merged" };
  if (item?.unverified_fields?.length || item?.official_source_resolved === false) {
    return { cls: "badge blocker", text: "unresolved" };
  }
  return { cls: "badge pending", text: "suggested" };
}

export default function AdminFixPanel({
  queueItem,
  recruitment,
  validateResult,
  sources = [],
  conflicts = [],
  conflictTarget = null,
  onQueueFieldAction,
  onPromote,
  onMergeIntoExisting,
  onMarkDuplicate,
  onRejectCandidate,
  onValidate,
  onVerify,
  onPublish,
  onSourcesChanged,
  onOpenConflict,
  onResolveConflict,
  onRejectConflict,
  onCloseConflict,
  busy,
}) {
  if (!queueItem && !recruitment) {
    return <FixPanelEmpty />;
  }
  const openConflicts = (conflicts || []).filter((c) => (c?.status || "open") === "open");
  return (
    <div className="stack" data-testid="admin-fix-panel">
      {queueItem ? (
        <QueueFixSection
          item={queueItem}
          conflicts={openConflicts}
          sources={sources}
          onFieldAction={onQueueFieldAction}
          onPromote={onPromote}
          onMergeIntoExisting={onMergeIntoExisting}
          onMarkDuplicate={onMarkDuplicate}
          onRejectCandidate={onRejectCandidate}
          onSourcesChanged={onSourcesChanged}
          onOpenConflict={onOpenConflict}
          onRejectConflict={onRejectConflict}
          busy={busy}
        />
      ) : null}
      {recruitment ? (
        <RecruitmentFixSection
          recruitment={recruitment}
          validateResult={validateResult}
          sources={sources}
          onSourcesChanged={onSourcesChanged}
          onValidate={onValidate}
          onVerify={onVerify}
          onPublish={onPublish}
          busy={busy}
        />
      ) : null}
      <ConflictResolver
        open={Boolean(conflictTarget)}
        conflict={conflictTarget}
        busy={busy}
        onClose={onCloseConflict}
        onSubmit={onResolveConflict}
        onReject={onRejectConflict ? (({ reason }) => onRejectConflict(conflictTarget?.id, { reason })) : undefined}
      />
    </div>
  );
}

function QueueFixSection({ item, conflicts = [], sources = [], onFieldAction, onPromote, onMergeIntoExisting, onMarkDuplicate, onRejectCandidate, onSourcesChanged, onOpenConflict, onRejectConflict, busy }) {
  const blockers = item.unverified_fields || [];
  const dups = item.duplicate_candidates || [];
  const officialUnresolved = item.official_source_resolved === false;
  const openConflicts = conflicts.filter((c) => (c?.status || "open") === "open");
  const dataQualityPct = scoreToPct(item.data_quality_score);
  const lowQuality = isLowQuality(item.data_quality_score);
  const tier = tierForItem(item);
  const status = statusBadge(item);
  const posts = (item.raw_extracted_item || item.normalized_item || {}).posts;
  const title = item.recruitment || item.raw_extracted_item?.title || item.normalized_item?.title || "Untitled candidate";
  const blockedFromPromote = blockers.length > 0 || officialUnresolved || openConflicts.length > 0 || !item.promotable;
  // Bump on every field action so PromotionPreviewPanel refetches and
  // the admin sees the updated draft + blocker checklist immediately.
  const [previewKey, setPreviewKey] = useState(0);
  const bumpPreview = useCallback(() => setPreviewKey((n) => n + 1), []);
  const queueFieldAction = useCallback((field, action, correctedValue, scope) => {
    const r = onQueueFieldActionSafe(onFieldAction, item.id, field, action, correctedValue, scope);
    bumpPreview();
    return r;
  }, [onFieldAction, item.id, bumpPreview]);

  // P2-2: when the official-source gate flips false → true for the SAME
  // item (admin just attached proof), scroll the promote bar into view so
  // the next action is obvious. Tracking the id alongside the flag stops
  // a scroll when the admin merely switches from an unresolved item to an
  // already-resolved one.
  const promoteBarRef = useRef(null);
  const prevRef = useRef({ id: item.id, resolved: item.official_source_resolved });
  useEffect(() => {
    const prev = prevRef.current;
    const now = item.official_source_resolved;
    prevRef.current = { id: item.id, resolved: now };
    if (prev.id === item.id && prev.resolved === false && now === true) {
      promoteBarRef.current?.scrollIntoView?.({ behavior: "smooth", block: "center" });
    }
  }, [item.id, item.official_source_resolved]);

  return (
    <section className="card" data-testid="queue-fix-section">
      <div className="card-head-col">
        <div className="row" style={{ gap: 5 }}>
          <span className={`badge tier-${tier.toLowerCase()}`}>{tier}</span>
          <span className={status.cls}>{status.text}</span>
          {item.source_type ? <span className="badge neutral">source · {item.source_type}</span> : null}
          {dataQualityPct != null ? (
            <span className={`badge ${lowQuality ? "pending" : "resolved"}`}>quality {dataQualityPct}%</span>
          ) : null}
        </div>
        <h3 className="oc-title" style={{ fontSize: 17 }}>{title}</h3>
        <div className="row-sub">
          queue_id {String(item.id || "").slice(0, 10)} · source {item.source || "unknown"}
        </div>
      </div>
      <div className="card-body stack">
        {officialUnresolved ? (
          <OfficialSourceQuickResolver
            queueItem={item}
            sources={sources}
            busy={busy}
            onChanged={bumpPreview}
            onSourcesChanged={onSourcesChanged}
          />
        ) : null}

        {openConflicts.length > 0 ? (
          <section className="card" data-testid="fix-panel-conflicts" id="fix-panel-conflicts">
            <div className="card-head">
              <div className="row" style={{ gap: 6 }}>
                <h4 className="oc-title">Consensus conflicts</h4>
                <span className="badge blocker">{openConflicts.length}</span>
              </div>
              <span className="row-sub">official sources disagree</span>
            </div>
            <div className="card-body stack">
              <div className="anno">
                Each row is a single canonical field with two or more candidate values.
                Pick the winning value, attach evidence, and resolve. Promotion stays blocked
                until every row is resolved or rejected.
              </div>
              {openConflicts.map((conflict) => {
                const aggregatorOnly = conflictIsAggregatorOnly(conflict);
                return (
                  <div
                    key={conflict.id}
                    className="fld"
                    data-testid={`conflict-row-${conflict.id}`}
                  >
                    <div className="fld-head">
                      <div>
                        <span className="fld-key" style={{ fontFamily: "var(--font-mono)" }}>
                          {conflict.field_key}
                        </span>
                        <div className="field-sub" style={{ marginTop: 3 }}>
                          {(conflict.candidates || []).length} candidate
                          {(conflict.candidates || []).length === 1 ? "" : "s"}
                          {aggregatorOnly ? " · aggregator dissent only" : ""}
                        </div>
                      </div>
                      <div className="row" style={{ gap: 6 }}>
                        <button
                          type="button"
                          className="btn small"
                          onClick={() => onOpenConflict?.(conflict)}
                          disabled={busy}
                          data-testid={`conflict-resolve-${conflict.id}`}
                        >
                          Resolve
                        </button>
                        {aggregatorOnly && onRejectConflict ? (
                          <button
                            type="button"
                            className="btn ghost small"
                            onClick={() => onRejectConflict(conflict.id, { reason: "aggregator value rejected by policy" })}
                            disabled={busy}
                            data-testid={`conflict-reject-${conflict.id}`}
                          >
                            Reject (aggregator value)
                          </button>
                        ) : null}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        ) : null}

        {blockers.length > 0 ? (
          <FieldReviewGroup
            extracted={item.raw_extracted_item || item.normalized_item || {}}
            evidence={item.field_evidence_status || {}}
            evidenceDetails={item.field_evidence_details || []}
            requiredFields={HIGH_RISK_QUEUE_FIELDS}
            recommendedFields={[]}
            onFieldAction={queueFieldAction}
          />
        ) : null}

        <details className="fx-disclosure" data-testid="fx-quality-review">
          <summary className="fx-disclosure-summary">Quality review</summary>
          <div style={{ marginTop: 10 }}>
            <FieldReviewGroup
              extracted={item.raw_extracted_item || item.normalized_item || {}}
              evidence={item.field_evidence_status || {}}
              evidenceDetails={item.field_evidence_details || []}
              requiredFields={[]}
              recommendedFields={RECOMMENDED_REVIEW_FIELDS}
              onFieldAction={queueFieldAction}
            />
          </div>
        </details>

        <details
          className="fx-disclosure"
          open={blockers.includes("requires_domicile")}
          data-testid="fx-post-eligibility"
        >
          <summary className="fx-disclosure-summary">Post-level eligibility review</summary>
          <div style={{ marginTop: 8 }}>
            <div className="anno" style={{ marginBottom: 6 }}>
              Eligibility matching relies on per-post age, education, and vacancy fields. Corrections use dotted paths (posts.0.min_age).
            </div>
            <PostEligibilityReviewGroup
              posts={posts}
              evidence={item.field_evidence_status || {}}
              onFieldAction={queueFieldAction}
            />
          </div>
        </details>

        <details className="fx-disclosure" data-testid="fx-promotion-preview">
          <summary className="fx-disclosure-summary">Promotion preview details</summary>
          <div style={{ marginTop: 8 }}>
            <PromotionPreviewPanel
              queueId={item.id}
              open
              refreshKey={previewKey}
              onScrollToField={scrollToFieldAnchor}
            />
          </div>
        </details>

        {dups.length ? (
          <div>
            <div className="lbl" style={{ marginBottom: 6 }}>Possible duplicates</div>
            <div className="card fld-list">
              {dups.slice(0, 5).map((d, i) => {
                const dupId = d.recruitment_id || d.id;
                return (
                  <div key={dupId || i} className="fld">
                    <div className="fld-head">
                      <span className="fld-key">{d.name || d.title || dupId}</span>
                      <div className="row">
                        <button type="button" className="btn small" onClick={() => onMergeIntoExisting?.(item, d)} disabled={busy}>Preview merge</button>
                        <button type="button" className="btn small" onClick={() => onMarkDuplicate?.(item, d)} disabled={busy}>Mark duplicate</button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}

        <div
          ref={promoteBarRef}
          className="promote-bar"
          style={{
            position: "sticky",
            bottom: 0,
            zIndex: 5,
            marginTop: 8,
            background: blockedFromPromote ? "var(--blocker-bg)" : "var(--resolved-bg)",
            border: `1px solid ${blockedFromPromote ? "var(--blocker)" : "var(--resolved)"}`,
            borderRadius: 3,
            padding: "10px 12px",
            boxShadow: "0 -4px 12px rgba(0,0,0,0.05)",
          }}
          data-testid="promote-bar"
        >
          <div className="row" style={{ justifyContent: "space-between" }}>
            <div>
              <div className="fld-key" style={{ color: blockedFromPromote ? "var(--blocker)" : "var(--resolved)" }}>
                {blockedFromPromote ? "Promote blocked" : "Ready to promote"}
              </div>
              <div className="field-sub" style={{ color: blockedFromPromote ? "var(--blocker)" : "var(--resolved)", marginTop: 3 }}>
                {blockedFromPromote
                  ? [
                      blockers.length ? `Verify ${blockers.length} required field${blockers.length === 1 ? "" : "s"}` : "",
                      officialUnresolved ? "Attach official proof" : "",
                      openConflicts.length ? `Resolve ${openConflicts.length} consensus conflict${openConflicts.length === 1 ? "" : "s"}` : "",
                    ].filter(Boolean).join(" · ")
                  : "All gates open. Promotion will create a recruitment draft."}
              </div>
            </div>
            <button
              type="button"
              className="btn primary"
              disabled={busy || blockedFromPromote}
              onClick={() => onPromote?.(item)}
              data-testid="fix-panel-promote"
            >
              Promote to draft
            </button>
          </div>
        </div>
      </div>
      <div className="card-foot">
        <button
          type="button"
          className="btn ghost small"
          disabled={busy || item.status === "rejected" || item.status === "approved"}
          onClick={() => onRejectCandidate?.(item)}
          data-testid="fix-panel-reject-candidate"
        >
          Reject candidate
        </button>
        {dups.length ? (
          <button type="button" className="btn small" disabled={busy} onClick={() => onMarkDuplicate?.(item, dups[0])}>Mark duplicate</button>
        ) : null}
      </div>
    </section>
  );
}

function onQueueFieldActionSafe(handler, id, field, action, correctedValue, scope) {
  try { return handler?.(id, field, action, correctedValue, scope); }
  catch (err) { console.error("queue field action failed", err); return undefined; }
}

function RecruitmentFixSection({ recruitment, validateResult, sources = [], onSourcesChanged, onValidate, onVerify, onPublish, busy }) {
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
  const status = recruitment.publish_status || "draft";
  const statusBadgeCls = status === "published" ? "badge resolved"
    : status === "verified" ? "badge info"
    : status === "needs_review" ? "badge pending" : "badge neutral";
  return (
    <section className="card" data-testid="recruitment-fix-section">
      <div className="card-head-col">
        <div className="row" style={{ gap: 5 }}>
          <span className="badge tier-a">A</span>
          <span className={statusBadgeCls}>{status}</span>
        </div>
        <h3 className="oc-title" style={{ fontSize: 17 }}>{recruitment.name || "Untitled recruitment"}</h3>
        <div className="row-sub">
          recruitment_id {String(recruitment.id || "").slice(0, 10)} · publish_status {status} · {blockers.length} blocker{blockers.length === 1 ? "" : "s"}
        </div>
      </div>
      <div className="card-body stack">
        <div className="grid2">
          <div className="field">
            <div className="field-lbl">organization</div>
            <div className="field-val">{recruitment.organization_name || recruitment.organization?.name || "—"}</div>
            {recruitment.organization?.is_verified ? <div className="field-sub seal">verified</div> : null}
          </div>
          <div className="field">
            <div className="field-lbl">apply window</div>
            <div className="field-val">{recruitment.apply_start_date || "—"} → {recruitment.apply_end_date || "—"}</div>
          </div>
          <div className="field">
            <div className="field-lbl">posts</div>
            <div className="field-val">{recruitment.post_count != null ? `${recruitment.post_count} post${recruitment.post_count === 1 ? "" : "s"}` : "—"}</div>
          </div>
          <div className="field">
            <div className="field-lbl">source provenance</div>
            <div className={recruitment.source_provenance_verified ? "field-val seal" : "field-val"}>
              {recruitment.source_provenance_verified ? "linked & verified" : (recruitment.source_provenance ? "linked" : "missing")}
            </div>
          </div>
        </div>

        <BlockerList blockers={blockers} empty="No publish blockers reported." />

        {nonCriteriaBlockers.length ? (
          <div data-testid="recruitment-blocker-fix-section">
            <RecruitmentBlockerFixForm
              recruitment={recruitment}
              blockers={nonCriteriaBlockers}
              sources={sources}
              onChanged={() => onValidate?.(recruitment)}
              onSourcesChanged={onSourcesChanged}
            />
          </div>
        ) : null}

        {(blockers.includes("posts_missing") || blockers.includes("eligibility_rules_missing")) ? (
          <div data-testid="recruitment-criteria-section">
            <RecruitmentCriteriaPanel recruitmentId={recruitment.id} onChanged={() => onValidate?.(recruitment)} />
          </div>
        ) : null}

        <div className="anno">
          Once blockers clear, validate-publish runs server-side. Mark verified opens publish gate. Publish triggers eligibility recompute fan-out.
        </div>
      </div>
      <div className="card-foot">
        <Link to={`/admin/recruitments?focus=${recruitment.id}`} className="btn ghost small">
          Open full editor <ExternalLink className="h-3 w-3" />
        </Link>
        <button
          type="button"
          className="btn small"
          disabled={busy}
          onClick={async () => { setReviewing(true); try { await onValidate?.(recruitment); } finally { setReviewing(false); } }}
          data-testid="fix-panel-validate"
        >
          {reviewing ? "Validating…" : "Validate publish readiness — server-side check"}
        </button>
        <button
          type="button"
          className="btn small"
          disabled={busy || !validateResult?.ready || status === "verified" || status === "published"}
          onClick={() => onVerify?.(recruitment)}
          data-testid="fix-panel-verify"
        >
          Mark verified
        </button>
        <button
          type="button"
          className="btn primary small"
          disabled={busy || status !== "verified"}
          onClick={() => onPublish?.(recruitment)}
          data-testid="fix-panel-publish"
        >
          Publish
        </button>
      </div>
    </section>
  );
}

function FixPanelEmpty() {
  return (
    <section className="next-action" data-testid="admin-fix-panel-empty">
      <div>
        <div className="lbl" style={{ marginBottom: 5 }}>Workspace</div>
        <h4 className="oc-title" style={{ color: "var(--paper)" }}>
          Pick a queue item or recruitment on the left to start working.
        </h4>
      </div>
    </section>
  );
}
