import React from "react";
import {
  Eyebrow,
  MiniBar,
  Pill,
  TrustStamp,
} from "../../../shared/ui/studyos";

// CycleSubjectProgress — per-subject planned vs actual progress over the
// full exam cycle. All numbers come from the backend; the component is
// pure presentation.
export default function CycleSubjectProgress({ subjects }) {
  const rows = Array.isArray(subjects) ? subjects : [];
  if (!rows.length) {
    return (
      <p className="text-[12.5px] text-clay-700" data-testid="cycle-subject-empty">
        Per-subject progress will appear once tasks are scheduled across the cycle.
      </p>
    );
  }
  return (
    <div className="space-y-2.5" data-testid="cycle-subject-progress">
      <Eyebrow>Subjects · across the cycle</Eyebrow>
      <ul className="space-y-2">
        {rows.map((s) => {
          const actual = Number(s.actual_pct || 0);
          const planned = Number(s.planned_pct || 100);
          const ratio = planned ? Math.max(0, Math.min(1, actual / planned)) : 0;
          const onTrack = ratio >= 0.85;
          return (
            <li
              key={s.subject_id || s.subject_name}
              className="grid grid-cols-[140px_1fr_auto] gap-3 items-center text-[12.5px]"
            >
              <div className="min-w-0">
                <div className="truncate text-clay-900">{s.subject_name}</div>
                <div className="num-mono text-[10.5px] text-clay-700">
                  {s.actual_hours ?? 0}h done / {s.planned_hours ?? 0}h planned
                </div>
              </div>
              <div className="flex items-center gap-2">
                <MiniBar pct={ratio} width={undefined} height={9} />
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <span className="num-mono text-[11px] text-clay-700">
                  {actual}%
                </span>
                {onTrack ? (
                  <Pill tone="sage">on track</Pill>
                ) : actual === 0 ? (
                  <Pill tone="outline">not started</Pill>
                ) : (
                  <Pill tone="amber">behind</Pill>
                )}
                <TrustStamp kind={s.trust_status === "locked" ? "locked" : "preview"} />
              </div>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
