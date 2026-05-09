import React from "react";

export default function OnboardingProgress({ step, total }) {
  const progress = ((step + 1) / total) * 100;
  return <><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Step {step + 1} of {total}</div><div className="h-1 rounded-full bg-clay-100 overflow-hidden"><div className="h-full bg-clay-500 transition-all" style={{ width: `${progress}%` }} /></div></>;
}
