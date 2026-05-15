import React, { useRef } from "react";
import DecisionBar from "./DecisionBar";
import { StatusBadge } from "../../../shared/ui";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";
import EvidenceDiffViewer from "./EvidenceDiffViewer";
import FieldReviewGroup from "../workflow/FieldReviewGroup";
import NextActionCallout from "../workflow/NextActionCallout";
import { HIGH_RISK_QUEUE_FIELDS, RECOMMENDED_REVIEW_FIELDS, getNextActionForQueueItem } from "../workflow/adminWorkflowContract";

function Row({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded-xl border border-border bg-white/60 p-3">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-1 break-words text-sm">{String(value)}</div>
    </div>
  );
}

export default function EligibilityReviewDrawer({ item, open, onClose, busy, onPromote, onReject, onFieldAction }) {
  const containerRef = useRef(null);
  const closeButtonRef = useRef(null);
  useFocusTrap({ active: open && !!item, containerRef, onEscape: onClose, initialFocusRef: closeButtonRef });

  if (!open || !item) return null;
  const confidence = Number(item.confidence || 0);
  const hasSource = Boolean(item.source);
  const timelineAction = item.status === "approved" ? "Promoted" : item.status === "rejected" ? "Rejected" : "Pending";
  const optionalKeys = ["source_provenance", "official_url", "notification_url", "snapshot_url"];
  const blockers = item.unverified_fields || [];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside ref={containerRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="eligibility-review-title" className="relative flex h-full w-full max-w-3xl flex-col overflow-y-auto border-l border-border bg-[#FBF6EF]">
        <div className="flex items-start justify-between gap-3 border-b border-border p-4">
          <div>
            <div className="text-[11px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Promotion queue candidate</div>
            <h2 id="eligibility-review-title" className="mt-1 font-heading text-xl font-semibold">{item.recruitment || "Untitled recruitment"}</h2>
            <p className="mt-1 text-sm text-muted-foreground">This is scraped data awaiting promotion into a canonical recruitment draft. Promotion does not publish or send alerts.</p>
          </div>
          <button ref={closeButtonRef} className="btn btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>

        <div className="flex-1 space-y-4 p-4">
          <NextActionCallout message={getNextActionForQueueItem(item)} tone={blockers.length ? "warn" : "info"} />

          <section className="grid gap-3 md:grid-cols-3">
            <Row label="Source" value={item.source || "-"} />
            <Row label="Added" value={item.added ? new Date(item.added).toLocaleString("en-IN") : "-"} />
            <div className="rounded-xl border border-border bg-white/60 p-3">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Confidence</div>
              <StatusBadge status={confidence < 0.7 ? "pending" : "verified"} label={`${Math.round(confidence * 100)}% confidence`} />
            </div>
          </section>

          {!hasSource && <div className="rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">Warning: Source missing.</div>}
          {confidence < 0.7 && <div className="rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">Warning: Low confidence item.</div>}

          <section className="soft-card rounded-2xl p-4">
            <h3 className="font-semibold">Field review</h3>
            <p className="mt-1 text-sm text-muted-foreground">Verify or correct required fields here before promotion. Recommended fields improve draft quality but are not blockers unless the backend reports them.</p>
            <div className="mt-4">
              <FieldReviewGroup
                extracted={item.raw_extracted_item}
                evidence={item.field_evidence_status || {}}
                evidenceDetails={item.field_evidence_details || []}
                requiredFields={HIGH_RISK_QUEUE_FIELDS}
                recommendedFields={RECOMMENDED_REVIEW_FIELDS}
                onFieldAction={(field, action, correctedValue, scope) => onFieldAction?.(item.id, field, action, correctedValue, scope)}
              />
            </div>
          </section>

          <EvidenceDiffViewer extracted={item.raw_extracted_item} normalized={item.normalized_item} previous={item.previous_extraction} />

          <section className="soft-card p-3 text-xs space-y-1">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Evidence timeline</div>
            <div>Added: {item.added ? new Date(item.added).toLocaleString("en-IN") : "-"}</div>
            <div>Source: {item.source || "-"}</div>
            <div>Confidence: {Math.round(confidence * 100)}%</div>
            <div>Action: {timelineAction}</div>
            {item.reviewed_at ? <div>Action time: {new Date(item.reviewed_at).toLocaleString("en-IN")}</div> : null}
            {item.reviewer_notes ? <div>Notes: {item.reviewer_notes}</div> : null}
          </section>

          {optionalKeys.map((key) => <Row key={key} label={key.replaceAll("_", " ")} value={typeof item[key] === "object" ? JSON.stringify(item[key], null, 2) : item[key]} />)}
        </div>

        <DecisionBar item={item} busy={busy} onPromote={onPromote} onReject={onReject} />
      </aside>
    </div>
  );
}
