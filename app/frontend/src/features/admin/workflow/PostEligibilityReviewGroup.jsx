import React, { useState } from "react";
import { StatusBadge } from "../../../shared/ui";

const POST_FIELDS = [
  { key: "post_name", label: "Post name" },
  { key: "vacancies", label: "Vacancies", type: "number" },
  { key: "min_age", label: "Min age", type: "number" },
  { key: "max_age", label: "Max age", type: "number" },
  { key: "education_required", label: "Education required" },
  { key: "disciplines", label: "Disciplines (comma list)" },
  { key: "unit_code", label: "Unit code" },
  { key: "unit_name", label: "Unit name" },
  { key: "unit_location_state", label: "Unit location state" },
  { key: "unit_location_city", label: "Unit location city" },
  { key: "language_requirements", label: "Language requirements (comma list)" },
];

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
  const [editing, setEditing] = useState(false);
  const path = `posts.${postIndex}.${field.key}`;
  const label = status || "unverified";
  const compact = ["verified", "corrected"].includes(label) && !editing;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white/60 p-2 text-xs">
        <div className="min-w-0">
          <span className="font-semibold text-sage-700">✓ {field.label}</span>
          <span className="ml-2 text-muted-foreground">{label}</span>
        </div>
        <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => setEditing(true)}>Edit</button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-white/60 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <b>{field.label}</b>: <span className="break-words">{String(value ?? "-")}</span>
          <code className="ml-2 rounded bg-white/70 px-1.5 py-0.5 text-[10px] text-muted-foreground">{path}</code>
        </div>
        <StatusBadge status={label} label={label} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-ghost h-8 text-xs" onClick={() => onFieldAction(path, "verify")}>Verify</button>
        <button className="btn btn-ghost h-8 text-xs" onClick={() => onFieldAction(path, "reject")}>Reject</button>
        <input
          className="min-w-[180px] flex-1 rounded-lg border border-border bg-white px-2 py-1"
          value={correction}
          onChange={(e) => setCorrection(e.target.value)}
          placeholder={`Corrected ${field.label.toLowerCase()}`}
        />
        <button
          className="btn btn-ghost h-8 text-xs"
          disabled={!correction}
          onClick={() => {
            onFieldAction(path, "correct", coerceCorrection(correction, field.type));
            setEditing(false);
            setCorrection("");
          }}
        >Correct</button>
        {editing ? <button className="btn btn-ghost h-8 text-xs" onClick={() => setEditing(false)}>Cancel</button> : null}
      </div>
    </div>
  );
}

// Renders one card per post in extracted_data.posts[] with verify/correct/reject
// controls per eligibility-critical field. Correction calls onFieldAction with
// a dotted path (posts.<i>.<field>) so the backend can patch the nested value
// instead of writing a flat key like "posts.0.min_age".
export default function PostEligibilityReviewGroup({ posts, evidence, onFieldAction }) {
  const list = Array.isArray(posts) ? posts : [];
  if (list.length === 0) {
    return (
      <p className="text-sm text-muted-foreground" data-testid="post-eligibility-empty">
        No post-level records extracted. The extractor did not detect a posts[] structure.
      </p>
    );
  }
  return (
    <div className="space-y-4" data-testid="post-eligibility-review">
      {list.map((post, postIndex) => (
        <section key={postIndex} className="rounded-2xl border border-border bg-white/40 p-3" data-testid={`post-card-${postIndex}`}>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-sm font-semibold">
              Post #{postIndex + 1} {post?.post_name ? `· ${post.post_name}` : ""}
            </h4>
            <span className="text-[10px] text-muted-foreground">posts[{postIndex}]</span>
          </div>
          <div className="mt-3 space-y-2">
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
        </section>
      ))}
    </div>
  );
}
