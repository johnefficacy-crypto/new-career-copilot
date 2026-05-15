import React from "react";
import { StatusDot } from "./studyos";

// Calm one-line banner version of <StatusDot>. Used at the top of any
// surface that is not fully live yet, so the aspirant knows a panel is
// preview / partial / not-connected before they read it.
//
// state ∈ "live" | "partial" | "preview" | "not-connected"
// detail is optional secondary copy (e.g. "Backend hookup pending").
export default function SurfaceStateBanner({ state = "preview", label, detail, testId }) {
  if (state === "live") return null;
  return (
    <div
      className="rounded-xl border border-[#E7DECB] bg-[#FBF6EF] px-3 py-2 flex items-center gap-3 text-[12px]"
      data-testid={testId}
    >
      <StatusDot state={state} label={label} />
      {detail ? <span className="text-clay-700">· {detail}</span> : null}
    </div>
  );
}
