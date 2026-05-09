import React from "react";

function CompletionCard({ title, data }) {
  if (!data) return <div className="p-3 border rounded-xl text-sm text-muted-foreground">{title}: Not provided</div>;
  return <div className="p-3 border rounded-xl text-sm space-y-1"><div className="font-medium capitalize">{title}</div><div>{data.completion_pct}% complete</div><div className="text-xs text-muted-foreground">Missing: {(data.missing_fields || []).length ? data.missing_fields.join(", ") : "None"}</div><div className="text-xs text-muted-foreground">Why: {data.why_it_matters || "Not provided"}</div><div className="text-xs">Next: {data.next_action || "Not provided"}</div></div>;
}

export default function CompletionSidebar({ completion }) {
  return <aside className="space-y-4"><div className="soft-card rounded-2xl p-5"><div className="font-semibold mb-2">Completion status</div>{["identity_profile", "education_profile", "preferences_profile", "study_profile", "application_profile"].map((k) => <CompletionCard key={k} title={k.replaceAll("_", " ")} data={completion?.[k]} />)}</div></aside>;
}
