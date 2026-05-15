import React, { useMemo, useState } from "react";
import { StatusBadge } from "../../../shared/ui";

// Post-scoped high-risk fields (mirror app/backend/app/scraping/promotion_gate.py
// POST_SCOPED_FIELDS). Reviewers must verify each post individually because the
// canonical value can differ per post; a single global verification cannot
// satisfy the gate. Keep this list in sync with the backend constant.
const POST_SCOPED_FIELDS = new Set(["requires_domicile"]);

// Field-type registry drives the correction input. Adding a field here
// upgrades the UI from a free text box to a typed control without any
// backend change: ReviewBody.corrected_value already accepts string,
// int, float, and bool.
const FIELD_TYPES = {
  apply_start_date: "date",
  apply_end_date: "date",
  notification_date: "date",
  total_vacancies: "integer",
  min_age: "integer",
  max_age: "integer",
  official_notification_url: "url",
  official_apply_url: "url",
  requires_domicile: "boolean",
};

function fieldType(name) {
  return FIELD_TYPES[name] || "text";
}

function parseCorrection(type, raw) {
  if (raw === "" || raw == null) return null;
  if (type === "integer") {
    const n = Number(raw);
    if (!Number.isFinite(n) || !Number.isInteger(n)) throw new Error("Enter a whole number.");
    return n;
  }
  if (type === "number") {
    const n = Number(raw);
    if (!Number.isFinite(n)) throw new Error("Enter a number.");
    return n;
  }
  if (type === "boolean") return raw === "true";
  if (type === "url") {
    try { new URL(raw); return raw; } catch { throw new Error("Enter a valid URL (https://…)."); }
  }
  if (type === "date") {
    // <input type="date"> already enforces YYYY-MM-DD; trust it and pass through.
    return raw;
  }
  return raw;
}

function formatValue(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

function CorrectionInput({ type, value, onChange, ariaLabel }) {
  if (type === "boolean") {
    return (
      <select className="min-w-[180px] flex-1 rounded-lg border border-border bg-white px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
        <option value="">Select…</option>
        <option value="true">Yes / true</option>
        <option value="false">No / false</option>
      </select>
    );
  }
  const inputType = type === "date" ? "date" : type === "url" ? "url" : (type === "integer" || type === "number") ? "number" : "text";
  const step = type === "integer" ? "1" : undefined;
  return (
    <input
      type={inputType}
      step={step}
      className="min-w-[180px] flex-1 rounded-lg border border-border bg-white px-2 py-1"
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={type === "date" ? "YYYY-MM-DD" : type === "url" ? "https://…" : "Corrected value"}
      aria-label={ariaLabel}
    />
  );
}

function EvidenceSnippet({ details }) {
  if (!details) return null;
  const text = details.evidence_text;
  const page = details.page_number ?? details.source_page;
  const conf = details.confidence;
  const reviewerNotes = details.reviewer_notes;
  if (!text && page == null && conf == null && !reviewerNotes) return null;
  return (
    <details className="mt-2 rounded-lg border border-border bg-white/70 p-2 text-[11px]">
      <summary className="cursor-pointer font-semibold text-muted-foreground">
        Evidence
        {page != null ? ` · p.${page}` : ""}
        {conf != null ? ` · confidence ${Math.round(Number(conf) * 100)}%` : ""}
      </summary>
      {text ? <blockquote className="mt-2 whitespace-pre-wrap border-l-2 border-border pl-2 text-foreground/80">{text}</blockquote> : <div className="mt-2 italic text-muted-foreground">No source snippet captured.</div>}
      {reviewerNotes ? <div className="mt-2"><b>Reviewer notes:</b> {reviewerNotes}</div> : null}
    </details>
  );
}

function FieldRow({ field, label, value, status, details, entityScope, onFieldAction }) {
  const type = fieldType(field);
  const [correction, setCorrection] = useState("");
  const [editing, setEditing] = useState(false);
  const [rejectingOpen, setRejectingOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [localError, setLocalError] = useState("");
  const heading = label || field;
  const labelText = status || "unverified";
  const compact = ["verified", "corrected"].includes(labelText) && !editing && !rejectingOpen;

  const submit = (action) => {
    setLocalError("");
    if (action === "reject") {
      const reason = rejectReason.trim();
      if (!reason) { setLocalError("Reason is required to reject."); return; }
      onFieldAction(field, "reject", null, { ...entityScope, notes: reason });
      setRejectingOpen(false);
      setRejectReason("");
      return;
    }
    let parsed;
    try { parsed = parseCorrection(type, correction); }
    catch (e) { setLocalError(e.message); return; }
    if (action === "correct" && parsed == null) { setLocalError("Enter a corrected value."); return; }
    onFieldAction(field, action, parsed, entityScope);
    setEditing(false);
  };

  if (compact) {
    return (
      <div className="rounded-xl border border-border bg-white/60 p-2 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <span className="font-semibold text-sage-700">✓ {heading}</span>
            <span className="ml-2 text-muted-foreground">{labelText}</span>
            {labelText === "corrected" ? <span className="ml-2 break-words">Corrected value: {formatValue(details?.corrected_value ?? value)}</span> : null}
          </div>
          <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => setEditing(true)}>{labelText === "corrected" ? "Edit correction" : "Edit"}</button>
        </div>
        <EvidenceSnippet details={details} />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-border bg-white/60 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <b>{heading}</b>: <span className="break-words">{formatValue(value)}</span>
        </div>
        <StatusBadge status={labelText} label={labelText} />
      </div>
      <EvidenceSnippet details={details} />
      {localError ? <div className="mt-2 text-[11px] text-destructive">{localError}</div> : null}
      {!rejectingOpen ? (
        <div className="mt-2 flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => submit("verify")}>Verify</button>
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => { setRejectingOpen(true); setLocalError(""); }}>Reject</button>
          <CorrectionInput type={type} value={correction} onChange={setCorrection} ariaLabel={`Corrected value for ${heading}`} />
          <button type="button" className="btn btn-ghost h-8 text-xs" disabled={correction === "" || correction == null} onClick={() => submit("correct")}>Correct</button>
          {editing ? <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => setEditing(false)}>Cancel</button> : null}
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <textarea
            value={rejectReason}
            onChange={(e) => { setRejectReason(e.target.value); if (e.target.value.trim()) setLocalError(""); }}
            placeholder="Why is this evidence wrong? (required)"
            className="w-full rounded-lg border border-border bg-white px-2 py-1 text-xs"
            rows={2}
            aria-label={`Rejection reason for ${heading}`}
          />
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost h-8 text-xs" onClick={() => { setRejectingOpen(false); setRejectReason(""); setLocalError(""); }}>Cancel</button>
            <button type="button" className="btn btn-primary h-8 text-xs" onClick={() => submit("reject")}>Confirm reject</button>
          </div>
        </div>
      )}
    </div>
  );
}

function findDetail(detailsList, field, entityScope) {
  if (!Array.isArray(detailsList)) return null;
  const wantType = (entityScope?.entity_type || "other").toLowerCase();
  const wantKey = (entityScope?.entity_key || "").trim().toLowerCase() || null;
  return detailsList.find((d) => {
    if ((d?.field_name || "") !== field) return false;
    const et = (d?.entity_type || "other").toLowerCase();
    const ek = (d?.entity_key || "").trim().toLowerCase() || null;
    return et === wantType && ek === wantKey;
  }) || null;
}

function statusFromDetail(detail) {
  return detail?.reviewer_status || "unverified";
}

function ReviewSection({ title, description, fields, extracted, evidence, evidenceDetails, onFieldAction }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {fields.map((field) => {
        if (POST_SCOPED_FIELDS.has(field)) {
          const posts = Array.isArray(extracted?.posts) ? extracted.posts : [];
          if (!posts.length) {
            // No posts in the extracted payload: backend gate falls back to
            // the recruitment-level rule, so we expose a single global row.
            const detail = findDetail(evidenceDetails, field, { entity_type: "other", entity_key: null });
            return (
              <FieldRow
                key={field}
                field={field}
                label={field}
                value={extracted?.[field]}
                status={statusFromDetail(detail) || evidence?.[field] || "unverified"}
                details={detail}
                entityScope={{ entity_type: "other", entity_key: null }}
                onFieldAction={onFieldAction}
              />
            );
          }
          return (
            <div key={field} className="space-y-2 rounded-xl border border-border bg-white/30 p-2">
              <div className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">{field} · per post</div>
              {posts.map((post, idx) => {
                const postName = (post?.post_name || "").trim();
                const entityScope = { entity_type: "post", entity_key: postName || `post-${idx}` };
                const detail = findDetail(evidenceDetails, field, entityScope);
                return (
                  <FieldRow
                    key={`${field}:${idx}:${postName}`}
                    field={field}
                    label={`${field} · ${postName || `Post #${idx + 1}`}`}
                    value={post?.[field]}
                    status={statusFromDetail(detail)}
                    details={detail}
                    entityScope={entityScope}
                    onFieldAction={onFieldAction}
                  />
                );
              })}
            </div>
          );
        }
        const detail = findDetail(evidenceDetails, field, { entity_type: "other", entity_key: null });
        return (
          <FieldRow
            key={field}
            field={field}
            label={field}
            value={extracted?.[field]}
            status={statusFromDetail(detail) || evidence?.[field] || "unverified"}
            details={detail}
            entityScope={{ entity_type: "other", entity_key: null }}
            onFieldAction={onFieldAction}
          />
        );
      })}
    </section>
  );
}

export default function FieldReviewGroup({ extracted, evidence, evidenceDetails, requiredFields, recommendedFields, onFieldAction }) {
  // Memoize so a parent re-render doesn't churn the row state (collapsed
  // verified rows would jump back open on every keystroke elsewhere).
  const required = useMemo(() => requiredFields || [], [requiredFields]);
  const recommended = useMemo(() => recommendedFields || [], [recommendedFields]);
  const details = useMemo(() => evidenceDetails || [], [evidenceDetails]);

  return (
    <div className="space-y-5">
      <ReviewSection
        title="Required before promotion"
        description="Backend promotion blocks until these high-risk fields are verified or corrected."
        fields={required}
        extracted={extracted}
        evidence={evidence}
        evidenceDetails={details}
        onFieldAction={onFieldAction}
      />
      <ReviewSection
        title="Recommended review"
        description="Review these fields for quality, but they are not promotion blockers unless the backend reports one."
        fields={recommended}
        extracted={extracted}
        evidence={evidence}
        evidenceDetails={details}
        onFieldAction={onFieldAction}
      />
    </div>
  );
}
