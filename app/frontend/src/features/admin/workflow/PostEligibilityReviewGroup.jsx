import React, { useState } from "react";

const POST_FIELDS = [
  { key: "post_name", label: "Post name" },
  { key: "vacancies", label: "Vacancies", type: "number" },
  { key: "min_age", label: "Min age", type: "number" },
  { key: "max_age", label: "Max age", type: "number" },
  { key: "education_required", label: "Education required" },
  { key: "disciplines", label: "Disciplines" },
  { key: "unit_code", label: "Unit code" },
  { key: "unit_name", label: "Unit name" },
  { key: "unit_location_state", label: "Unit state" },
  { key: "unit_location_city", label: "Unit city" },
  { key: "language_requirements", label: "Languages" },
];

const STATUS_BADGE = {
  verified: { cls: "badge resolved", text: "verified" },
  unverified: { cls: "badge blocker", text: "unverified" },
  rejected: { cls: "badge neutral", text: "rejected" },
  corrected: { cls: "badge info", text: "corrected" },
};

function coerceCorrection(value, type) {
  if (value === "" || value == null) return value;
  if (type === "number") {
    const n = Number(value);
    if (!Number.isFinite(n)) return value;
    return n;
  }
  return value;
}

function PostFieldRow({ postIndex, field, value, status, onFieldAction }) {
  const [correction, setCorrection] = useState("");
  const path = `posts.${postIndex}.${field.key}`;
  const statusKey = status || "unverified";
  const meta = STATUS_BADGE[statusKey] || { cls: "badge neutral", text: statusKey };

  return (
    <div className="fld">
      <div className="fld-head">
        <span className="fld-key">{field.label} <span className="anno">· {path}</span></span>
        <span className={meta.cls}>{meta.text}</span>
      </div>
      <div className="fld-val">{value == null || value === "" ? "—" : String(value)}</div>
      {statusKey === "verified" ? null : (
        <div className="row" style={{ marginTop: 8 }}>
          <button type="button" className="btn small" onClick={() => onFieldAction(path, "verify")}>Verify</button>
          <button type="button" className="btn small" onClick={() => onFieldAction(path, "reject")}>Reject</button>
          <input
            className="input"
            style={{ flex: 1, minWidth: 140, fontSize: 11.5, padding: "5px 8px" }}
            value={correction}
            onChange={(e) => setCorrection(e.target.value)}
            placeholder={`Corrected ${field.label.toLowerCase()}`}
          />
          <button
            type="button"
            className="btn small"
            disabled={!correction}
            onClick={() => {
              onFieldAction(path, "correct", coerceCorrection(correction, field.type));
              setCorrection("");
            }}
          >Correct</button>
        </div>
      )}
    </div>
  );
}

export default function PostEligibilityReviewGroup({ posts, evidence, onFieldAction }) {
  const list = Array.isArray(posts) ? posts : [];
  if (list.length === 0) {
    return <div className="anno" data-testid="post-eligibility-empty">No post-level records extracted.</div>;
  }
  return (
    <div className="stack" data-testid="post-eligibility-review">
      {list.map((post, postIndex) => (
        <div key={postIndex} className="post-card" data-testid={`post-card-${postIndex}`}>
          <div className="row" style={{ justifyContent: "space-between", marginBottom: 8 }}>
            <div className="row">
              <span className="lbl">post {postIndex}</span>
              <strong style={{ fontSize: 13 }}>{post?.post_name || `Post #${postIndex + 1}`}</strong>
            </div>
            <span className="row-sub">posts[{postIndex}]</span>
          </div>
          <div className="card fld-list">
            {POST_FIELDS.map((field) => {
              const value = post?.[field.key];
              const renderValue = Array.isArray(value) ? value.join(", ") : value;
              const status = evidence?.[`posts.${postIndex}.${field.key}`];
              return (
                <PostFieldRow
                  key={field.key}
                  postIndex={postIndex}
                  field={field}
                  value={renderValue}
                  status={status}
                  onFieldAction={onFieldAction}
                />
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}
