import React, { useState } from "react";
import { StatusBadge } from "../../../shared/ui";

function FieldRow({ field, value, status, onFieldAction }) {
  const [correction, setCorrection] = useState("");
  const [editing, setEditing] = useState(false);
  const label = status || "unverified";
  const compact = ["verified", "corrected"].includes(label) && !editing;
  if (compact) {
    return (
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-border bg-white/60 p-2 text-xs">
        <div className="min-w-0">
          <span className="font-semibold text-sage-700">✓ {field}</span>
          <span className="ml-2 text-muted-foreground">{label}</span>
          {label === "corrected" ? <span className="ml-2 break-words">Corrected value: {String(value ?? "-")}</span> : null}
        </div>
        <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={() => setEditing(true)}>{label === "corrected" ? "Edit correction" : "Edit"}</button>
      </div>
    );
  }
  return (
    <div className="rounded-xl border border-border bg-white/60 p-3 text-xs">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <b>{field}</b>: <span className="break-words">{String(value ?? "-")}</span>
        </div>
        <StatusBadge status={label} label={label} />
      </div>
      <div className="mt-2 flex flex-wrap gap-2">
        <button className="btn btn-ghost h-8 text-xs" onClick={() => onFieldAction(field, "verify")}>Verify</button>
        <button className="btn btn-ghost h-8 text-xs" onClick={() => onFieldAction(field, "reject")}>Reject</button>
        <input className="min-w-[180px] flex-1 rounded-lg border border-border bg-white px-2 py-1" value={correction} onChange={(e) => setCorrection(e.target.value)} placeholder="Corrected value" />
        <button className="btn btn-ghost h-8 text-xs" disabled={!correction} onClick={() => { onFieldAction(field, "correct", correction); setEditing(false); }}>Correct</button>
        {editing ? <button className="btn btn-ghost h-8 text-xs" onClick={() => setEditing(false)}>Cancel</button> : null}
      </div>
    </div>
  );
}

function ReviewSection({ title, description, fields, extracted, evidence, onFieldAction }) {
  return (
    <section className="space-y-3">
      <div>
        <h4 className="text-sm font-semibold">{title}</h4>
        {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      </div>
      {fields.map((field) => (
        <FieldRow
          key={field}
          field={field}
          value={extracted?.[field]}
          status={evidence?.[field] || "unverified"}
          onFieldAction={onFieldAction}
        />
      ))}
    </section>
  );
}

export default function FieldReviewGroup({ extracted, evidence, requiredFields, recommendedFields, onFieldAction }) {
  return (
    <div className="space-y-5">
      <ReviewSection
        title="Required before promotion"
        description="Backend promotion blocks until these high-risk fields are verified or corrected."
        fields={requiredFields}
        extracted={extracted}
        evidence={evidence}
        onFieldAction={onFieldAction}
      />
      <ReviewSection
        title="Recommended review"
        description="Review these fields for quality, but they are not promotion blockers unless the backend reports one."
        fields={recommendedFields}
        extracted={extracted}
        evidence={evidence}
        onFieldAction={onFieldAction}
      />
    </div>
  );
}
