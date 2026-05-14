import React from "react";

// Renders a confidence/priority score as a tone-coded pill.
// Accepts either a 0..1 confidence or a 0..100 score (set `scale`).
export default function ConfidencePill({ value, scale = "ratio", label }) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) {
    return <span className="pill pill-dusk" title="no score"><span>—</span></span>;
  }
  const num = Number(value);
  const ratio = scale === "percent" ? num / 100 : num;
  const tone = ratio >= 0.75 ? "pill-sage" : ratio >= 0.45 ? "pill-amber" : "pill-clay";
  const display =
    scale === "percent" ? `${Math.round(num)}` : `${Math.round(ratio * 100)}%`;
  return (
    <span className={`pill ${tone}`} title={label ? `${label}: ${display}` : display}>
      {label ? <span className="opacity-70">{label}</span> : null}
      <span className="tabular-nums">{display}</span>
    </span>
  );
}
