import React from "react";
import { Eyebrow, StatusDot } from "../../../shared/ui/studyos";

// Mirrors the prototype MetricsRow card: grained soft-card, eyebrow label,
// serif value, a small delta line and a status dot in the top-right.
const DELTA_TONE = {
  sage: "text-sage-700",
  amber: "text-[#6F5A22]",
  clay: "text-clay-700",
};

export default function StudyMetricCard({ label, value, hint, delta, tone = "clay", state }) {
  const deltaText = delta ?? hint;
  return (
    <div className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5" data-testid={`metric-${label}`}>
      <Eyebrow>{label}</Eyebrow>
      <div className="font-heading text-[22px] mt-1.5 leading-none">
        {value === null || value === undefined || value === "" ? "—" : value}
      </div>
      {deltaText ? (
        <div className={`text-[11px] mt-2 ${DELTA_TONE[tone] || DELTA_TONE.clay}`}>{deltaText}</div>
      ) : null}
      {state ? (
        <div className="absolute top-3 right-3">
          <StatusDot state={state} label="" />
        </div>
      ) : null}
    </div>
  );
}
