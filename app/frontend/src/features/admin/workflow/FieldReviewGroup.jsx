import React, { useMemo, useState } from "react";

const POST_SCOPED_FIELDS = new Set(["requires_domicile"]);

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

function fieldType(name) { return FIELD_TYPES[name] || "text"; }

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
  if (type === "date") return raw;
  return raw;
}

function formatValue(v) {
  if (v == null || v === "") return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

const STATUS_BADGE = {
  verified: { cls: "badge resolved", text: "verified" },
  unverified: { cls: "badge blocker", text: "unverified" },
  rejected: { cls: "badge neutral", text: "rejected" },
  corrected: { cls: "badge info", text: "corrected" },
  suggested: { cls: "badge pending", text: "suggested" },
};

function CorrectionInput({ type, value, onChange, ariaLabel }) {
  if (type === "boolean") {
    return (
      <select className="input" style={{ flex: 1, minWidth: 140, fontSize: 11.5, padding: "5px 8px" }} value={value} onChange={(e) => onChange(e.target.value)} aria-label={ariaLabel}>
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
      className="input"
      style={{ flex: 1, minWidth: 140, fontSize: 11.5, padding: "5px 8px" }}
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
  if (!text && page == null && conf == null) return null;
  const parts = [];
  if (page != null) parts.push(`page ${page}`);
  if (conf != null) parts.push(`confidence ${Math.round(Number(conf) * 100)}%`);
  return (
    <div className="fld-evidence">
      {parts.length ? <span>{parts.join(" · ")} · </span> : null}
      {text ? `"${text}"` : "No source snippet captured."}
    </div>
  );
}

function FieldRow({ field, label, value, status, details, entityScope, onFieldAction }) {
  const type = fieldType(field);
  const [correction, setCorrection] = useState("");
  const [rejectingOpen, setRejectingOpen] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [localError, setLocalError] = useState("");
  const heading = label || field;
  const statusKey = (status || "unverified");
  const meta = STATUS_BADGE[statusKey] || { cls: "badge neutral", text: statusKey };

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
  };

  const isCorrected = statusKey === "corrected";
  const correctedValue = details?.corrected_value;

  return (
    <div className="fld" id={`field-${field}`} data-field={field}>
      <div className="fld-head">
        <span className="fld-key">{heading}</span>
        <span className={meta.cls}>{meta.text}</span>
      </div>
      <div className="fld-val">
        {isCorrected && correctedValue != null && correctedValue !== value ? (
          <>
            <span style={{ textDecoration: "line-through", color: "var(--ink-mute)" }}>{formatValue(value)}</span>
            {" → "}
            <strong>{formatValue(correctedValue)}</strong>
          </>
        ) : (
          formatValue(value)
        )}
      </div>
      <EvidenceSnippet details={details} />
      {localError ? <div className="err-row" style={{ marginTop: 6 }}>{localError}</div> : null}
      {statusKey === "verified" ? null : (
        !rejectingOpen ? (
          <div className="row" style={{ marginTop: 8 }}>
            <button type="button" className="btn small" onClick={() => submit("verify")}>Verify</button>
            <button type="button" className="btn small" onClick={() => { setRejectingOpen(true); setLocalError(""); }}>Reject</button>
            <CorrectionInput type={type} value={correction} onChange={setCorrection} ariaLabel={`Corrected value for ${heading}`} />
            <button type="button" className="btn small" disabled={correction === "" || correction == null} onClick={() => submit("correct")}>Correct</button>
          </div>
        ) : (
          <div className="stack" style={{ marginTop: 8 }}>
            <textarea
              className="input"
              value={rejectReason}
              onChange={(e) => { setRejectReason(e.target.value); if (e.target.value.trim()) setLocalError(""); }}
              placeholder="Why is this evidence wrong? (required)"
              rows={2}
              aria-label={`Rejection reason for ${heading}`}
            />
            <div className="row" style={{ justifyContent: "flex-end" }}>
              <button type="button" className="btn small" onClick={() => { setRejectingOpen(false); setRejectReason(""); setLocalError(""); }}>Cancel</button>
              <button type="button" className="btn primary small" onClick={() => submit("reject")}>Confirm reject</button>
            </div>
          </div>
        )
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
  // Return undefined when there is no evidence row at all, so the caller
  // can fall back to the flat ``field_evidence_status`` map. Returning a
  // hard-coded "unverified" here used to swallow the verified status
  // that lived on the flat map when the relational detail wasn't shipped
  // on the queue row.
  return detail?.reviewer_status || undefined;
}

function ReviewSection({ title, description, fields, extracted, evidence, evidenceDetails, onFieldAction }) {
  if (!fields.length) return null;
  return (
    <div>
      <div className="lbl" style={{ marginBottom: 6 }}>{title}</div>
      {description ? <div className="anno" style={{ marginBottom: 6 }}>{description}</div> : null}
      <div className="card fld-list" style={{ marginTop: 6 }}>
        {fields.map((field) => {
          if (POST_SCOPED_FIELDS.has(field)) {
            const posts = Array.isArray(extracted?.posts) ? extracted.posts : [];
            if (!posts.length) {
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
              <div key={field} className="fld" id={`field-${field}`} data-field={field} style={{ background: "var(--paper-sunk)" }}>
                <div className="fld-head">
                  <span className="fld-key">{field} · per post</span>
                  <span className="badge pending">per post · unverified</span>
                </div>
                <div style={{ marginTop: 8 }}>
                  {posts.map((post, idx) => {
                    const postName = (post?.post_name || "").trim();
                    const entityScope = { entity_type: "post", entity_key: postName || `post-${idx}` };
                    const detail = findDetail(evidenceDetails, field, entityScope);
                    return (
                      <FieldRow
                        key={`${field}:${idx}:${postName}`}
                        field={field}
                        label={`${postName || `Post #${idx + 1}`}`}
                        value={post?.[field]}
                        status={statusFromDetail(detail)}
                        details={detail}
                        entityScope={entityScope}
                        onFieldAction={onFieldAction}
                      />
                    );
                  })}
                </div>
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
      </div>
    </div>
  );
}

export default function FieldReviewGroup({ extracted, evidence, evidenceDetails, requiredFields, recommendedFields, onFieldAction }) {
  const required = useMemo(() => requiredFields || [], [requiredFields]);
  const recommended = useMemo(() => recommendedFields || [], [recommendedFields]);
  const details = useMemo(() => evidenceDetails || [], [evidenceDetails]);

  return (
    <div className="stack">
      <ReviewSection
        title="Field evidence · required before promotion"
        description="Backend promotion blocks until these high-risk fields are verified or corrected."
        fields={required}
        extracted={extracted}
        evidence={evidence}
        evidenceDetails={details}
        onFieldAction={onFieldAction}
      />
      <ReviewSection
        title="Recommended review"
        description="Review for quality. Not blockers unless the backend reports one."
        fields={recommended}
        extracted={extracted}
        evidence={evidence}
        evidenceDetails={details}
        onFieldAction={onFieldAction}
      />
    </div>
  );
}
