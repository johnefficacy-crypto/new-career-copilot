import React from "react";
import { Eyebrow, StatusDot } from "../../../shared/ui/studyos";

// Mirrors the prototype MetricsRow card: grained soft-card, eyebrow label,
// serif value, a small delta line and a status dot in the top-right.
//
// Distinguishes 0 from missing telemetry: callers can pass `unknown` (or
// `hasData={false}`) to render "—" when the metric isn't reported yet,
// even if `value === 0`. Without this flag, a brand-new user metric
// reporting genuine zero is indistinguishable from "no telemetry yet."
const DELTA_TONE = {
  sage: "text-sage-700",
  amber: "text-[#6F5A22]",
  clay: "text-clay-700",
};

export default function StudyMetricCard({
  label,
  value,
  hint,
  delta,
  tone = "clay",
  state,
  unknown,
  hasData,
}) {
  const deltaText = delta ?? hint;
  const isUnknown =
    unknown === true ||
    hasData === false ||
    value === null ||
    value === undefined ||
    value === "";
  return (
    <div className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5" data-testid={`metric-${label}`}>
      <Eyebrow>{label}</Eyebrow>
      <div className="font-heading text-[22px] mt-1.5 leading-none">
        {isUnknown ? "—" : value}
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
