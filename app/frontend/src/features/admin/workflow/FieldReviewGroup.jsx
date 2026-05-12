import React, { useState } from "react";
import { StatusBadge } from "../../../shared/ui";

function FieldRow({ field, value, status, onFieldAction }) {
  const [correction, setCorrection] = useState("");
  const label = status || "unverified";
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
        <button className="btn btn-ghost h-8 text-xs" disabled={!correction} onClick={() => onFieldAction(field, "correct", correction)}>Correct</button>
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
