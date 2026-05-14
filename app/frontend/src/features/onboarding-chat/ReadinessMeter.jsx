import React from "react";

// Capability readiness. These are LOCAL profile-readiness placeholders
// computed from answered fields — NOT eligibility match counts. We never
// render "matches X exams" here; only the deterministic backend may do
// that, and only when it has returned a real verdict.
const CAPABILITY_LABELS = {
  eligibility: "Eligibility readiness",
  study_os: "Study OS readiness",
  document: "Document readiness",
  community: "Community readiness",
};

const CAPABILITY_TONES = {
  eligibility: "bg-clay-500",
  study_os: "bg-sage-500",
  document: "bg-dusk-400",
  community: "bg-amber-500",
};

export default function ReadinessMeter({ readiness }) {
  const capabilities = readiness?.capabilities;
  if (!capabilities) return null;
  const entries = Object.keys(CAPABILITY_LABELS)
    .filter((key) => capabilities[key] != null)
    .map((key) => [key, capabilities[key]]);
  if (entries.length === 0) return null;

  return (
    <section
      data-testid="readiness-meter"
      className="soft-card rounded-2xl p-4"
      aria-label="Profile readiness"
    >
      <h3 className="font-heading font-semibold text-sm">Your profile readiness</h3>
      <p className="text-xs text-muted-foreground mt-0.5">
        Builds as you answer — this is profile readiness, not an eligibility verdict.
      </p>
      <div className="mt-3 space-y-2.5">
        {entries.map(([key, value]) => {
          const pct = Math.max(0, Math.min(100, Math.round(value)));
          return (
            <div key={key}>
              <div className="flex items-center justify-between text-xs mb-1">
                <span className="text-clay-700">{CAPABILITY_LABELS[key]}</span>
                <span className="text-muted-foreground tabular-nums">{pct}%</span>
              </div>
              <div className="h-1.5 w-full rounded-full bg-clay-100 overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-200 ease-out ${
                    CAPABILITY_TONES[key] || "bg-clay-500"
                  }`}
                  style={{ width: `${pct}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </section>
  );
}
