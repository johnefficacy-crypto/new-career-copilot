import React from "react";
import { Eyebrow } from "../../../shared/ui/studyos";

// CycleProgressRail — horizontal rail showing notification → application
// → today → exam day milestones plus the five derived study-phase bands
// underneath. All dates are server-provided; this component never invents
// a milestone.
const KIND_COPY = {
  notification: "Notification",
  application_start: "Apps open",
  application_end: "Apps close",
  today: "Today",
  exam: "Exam day",
  phase: "Phase",
};

const KIND_TONE = {
  notification: "#A68057",
  application_start: "#A68057",
  application_end: "#A68057",
  today: "#2E2218",
  exam: "#33482F",
  phase: "#524864",
};

function rangeFor(milestones, phaseBands) {
  const datedMilestones = (milestones || []).filter((m) => m.date);
  const datedTimes = new Set();
  datedMilestones.forEach((m) => {
    const t = new Date(m.date).valueOf();
    if (!Number.isNaN(t)) datedTimes.add(t);
  });
  (phaseBands || []).forEach((b) => {
    if (b.start) {
      const t = new Date(b.start).valueOf();
      if (!Number.isNaN(t)) datedTimes.add(t);
    }
    if (b.end) {
      const t = new Date(b.end).valueOf();
      if (!Number.isNaN(t)) datedTimes.add(t);
    }
  });
  // Require at least two distinct dated points before rendering the rail.
  // A single milestone (or a phase band with identical start/end) used to
  // collapse the rail to a 1-day span with the "today" dot stuck at 0% or
  // 100%, with no indication of why.
  if (datedTimes.size < 2) return null;
  const arr = Array.from(datedTimes);
  return { min: Math.min(...arr), max: Math.max(...arr) };
}

function pctOf(dateStr, range) {
  if (!dateStr || !range) return null;
  const t = new Date(dateStr).valueOf();
  if (Number.isNaN(t)) return null;
  return Math.max(0, Math.min(100, ((t - range.min) / (range.max - range.min)) * 100));
}

export default function CycleProgressRail({ milestones, phaseBands }) {
  const range = rangeFor(milestones, phaseBands);
  if (!range) {
    return (
      <p className="text-[12.5px] text-clay-700">
        Cycle dates will appear here once an exam_start is locked.
      </p>
    );
  }
  const dated = (milestones || []).filter((m) => m.date && pctOf(m.date, range) !== null);

  return (
    <div className="space-y-3" data-testid="cycle-progress-rail">
      <div className="relative h-6">
        <div className="absolute inset-x-0 top-1/2 -translate-y-1/2 h-1 rounded-full bg-[#EFE2C9]" />
        {dated.map((m, i) => {
          const left = pctOf(m.date, range);
          const tone = KIND_TONE[m.kind] || "#6C5038";
          return (
            <div
              key={`${m.kind}-${m.date}-${i}`}
              className="absolute top-1/2 -translate-y-1/2 -translate-x-1/2"
              style={{ left: `${left}%` }}
              title={`${KIND_COPY[m.kind] || m.label} · ${m.date}`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full ring-2 ring-[#FBF6EF]"
                style={{ background: tone }}
                aria-hidden="true"
              />
            </div>
          );
        })}
      </div>

      <div className="relative h-5">
        {(phaseBands || []).map((b, i) => {
          const left = pctOf(b.start, range);
          const right = pctOf(b.end, range);
          if (left === null || right === null) return null;
          return (
            <div
              key={`${b.name}-${i}`}
              className="absolute top-0 bottom-0 rounded-md"
              style={{
                left: `${left}%`,
                width: `${Math.max(2, right - left)}%`,
                background: b.color || "#E7DECB",
                opacity: 0.55,
              }}
              title={`${b.name} · ${b.start} → ${b.end}`}
            />
          );
        })}
      </div>

      <ul className="flex flex-wrap gap-x-4 gap-y-1 text-[10.5px] text-clay-700">
        {dated.map((m, i) => (
          <li key={`leg-${m.kind}-${m.date}-${i}`} className="flex items-center gap-1.5">
            <span
              className="w-2 h-2 rounded-full"
              style={{ background: KIND_TONE[m.kind] || "#6C5038" }}
              aria-hidden="true"
            />
            <span>
              <strong className="text-clay-900">{KIND_COPY[m.kind] || m.label}</strong>{" "}
              <span className="num-mono">{m.date || "—"}</span>
            </span>
          </li>
        ))}
      </ul>

      {(phaseBands || []).length ? (
        <div>
          <Eyebrow>Study phases</Eyebrow>
          <ul className="flex flex-wrap gap-2 mt-1.5 text-[10.5px] text-clay-700">
            {phaseBands.map((b) => (
              <li
                key={b.name}
                className="inline-flex items-center gap-1.5 rounded-full border border-[#E7DECB] bg-white/70 px-2 py-0.5"
              >
                <span
                  className="w-2 h-2 rounded-sm"
                  style={{ background: b.color }}
                  aria-hidden="true"
                />
                {b.name}
                <span className="num-mono opacity-70">· {b.days}d</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
