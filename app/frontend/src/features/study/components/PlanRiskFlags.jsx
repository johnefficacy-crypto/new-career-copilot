import React from "react";
import { Eyebrow, Pill } from "../../../shared/ui/studyos";

// PlanRiskFlags — calm, non-shaming list of rule-based flags returned by
// the timeline service. Severities map to tone-only pills (no red alert
// bars) — copy carries the meaning.
const SEVERITY_TONE = {
  low: "outline",
  medium: "amber",
  high: "rose",
};

export default function PlanRiskFlags({ flags }) {
  const rows = Array.isArray(flags) ? flags : [];
  if (!rows.length) {
    return (
      <div data-testid="plan-risk-flags-empty">
        <Eyebrow>Plan risk flags</Eyebrow>
        <p className="mt-2 text-[12.5px] text-clay-700">
          Nothing flagged for this cycle right now. Keep logging — the planner watches the
          curve and surfaces issues here calmly when they appear.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-2" data-testid="plan-risk-flags">
      <Eyebrow>Plan risk flags</Eyebrow>
      <ul className="space-y-2">
        {rows.map((f, i) => (
          // Defensive composite key — the backend's `code` is intended to be
          // unique per flag, but if two flags share the same code (e.g. two
          // `subject_behind` rows for different subjects) React would
          // silently drop the duplicate. Suffix with index + first slice of
          // the subject / reason to keep keys unique without depending on
          // backend uniqueness guarantees.
          <li
            key={`${f.code || "flag"}-${(f.subject || f.reason || "").slice(0, 32)}-${i}`}
            className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3"
            data-testid={`plan-risk-${f.code}`}
          >
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="font-heading text-[14px] text-clay-900">{f.label}</div>
              <Pill tone={SEVERITY_TONE[f.severity] || "outline"}>
                {(f.severity || "low") + " severity"}
              </Pill>
            </div>
            {f.reason ? (
              <p className="text-[12.5px] text-clay-700 mt-1">{f.reason}</p>
            ) : null}
            {f.suggested_action ? (
              <p className="text-[12px] text-clay-900 mt-1.5">
                <span className="eyebrow !text-[10px] mr-1">Suggested</span>
                {f.suggested_action}
              </p>
            ) : null}
          </li>
        ))}
      </ul>
    </div>
  );
}
