import React from "react";
import { Eyebrow, Pill } from "../../../shared/ui/studyos";

// PhaseBandTimeline — the dedicated panel form of the cycle's five study
// phases, shown as a vertical list so each band's dates + intent are
// readable at a glance. Bands come from the backend (no client-side
// invention) and never claim to be official exam phases.
const COPY = {
  Foundation: "Build the base — concept blocks, slow learning blocks.",
  Coverage: "Cover the syllabus end-to-end at a sustainable pace.",
  Revision: "Spaced revision — return to weak topics on schedule.",
  "Mock-intensive": "Mocks + correction tasks dominate the week.",
  "Final sprint": "Pattern locking, calm pacing, no new topics.",
};

function fmt(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export default function PhaseBandTimeline({ bands, today }) {
  const rows = Array.isArray(bands) ? bands : [];
  if (!rows.length) {
    return (
      <p className="text-[12.5px] text-clay-700" data-testid="phase-bands-empty">
        Study phases are derived from the cycle start and exam date. They will appear once both
        are locked.
      </p>
    );
  }
  const todayMs = today ? new Date(today).valueOf() : Date.now();
  return (
    <div className="space-y-2" data-testid="phase-band-timeline">
      <Eyebrow>Study phases · derived from cycle bounds</Eyebrow>
      <ul className="space-y-1.5">
        {rows.map((b) => {
          const startMs = b.start ? new Date(b.start).valueOf() : null;
          const endMs = b.end ? new Date(b.end).valueOf() : null;
          let state = "upcoming";
          if (startMs !== null && endMs !== null) {
            if (todayMs >= endMs) state = "past";
            else if (todayMs >= startMs) state = "current";
          }
          return (
            <li
              key={b.name}
              className="grid grid-cols-[14px_140px_1fr_auto] gap-3 items-center text-[12.5px] py-1.5"
            >
              <span
                className="w-2.5 h-2.5 rounded-sm"
                style={{ background: b.color || "#A68057" }}
                aria-hidden="true"
              />
              <span className="font-heading text-[14px] leading-tight">{b.name}</span>
              <span className="text-clay-700">{COPY[b.name] || ""}</span>
              <span className="flex items-center gap-2 shrink-0">
                <span className="num-mono text-[10.5px] text-clay-700">
                  {fmt(b.start)} → {fmt(b.end)}
                </span>
                {state === "current" ? (
                  <Pill tone="ink">Current</Pill>
                ) : state === "past" ? (
                  <Pill tone="outline">Past</Pill>
                ) : (
                  <Pill tone="dusk">Upcoming</Pill>
                )}
              </span>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
