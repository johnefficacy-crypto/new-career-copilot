import React from "react";
import {
  MiniBar,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard,
} from "../../../shared/ui/studyos";

const SUBJECT_COLORS = [
  "#54794E",
  "#A68057",
  "#524864",
  "#BE9C6B",
  "#94B28A",
  "#8F86A1",
  "#6C5038",
];

// MasteryDistribution — per-subject mastery bars with a target marker.
// Reads the same /api/study/subjects rows as SubjectCards, but presents
// them as a single comparison view so users can see who's above target.
export default function MasteryDistribution({ items, target = 65 }) {
  const rows = Array.isArray(items) ? items : [];
  return (
    <StudyCard data-testid="mastery-distribution">
      <SectionHeader
        eyebrow="Mastery distribution"
        title="Where you stand, by subject."
        sub={`Subjects below the ${target}% target trigger weak-area drills.`}
        right={<StatusDot state="live" label="" />}
      />
      {rows.length === 0 ? (
        <p className="text-[12.5px] text-clay-700">
          No subject mastery yet. Run a few focus sessions or log a mock to start the curve.
        </p>
      ) : (
        <ul className="space-y-2.5">
          {rows.map((s, i) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0)));
            const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
            const onTarget = pct >= target;
            return (
              <li
                key={s.subject_id || s.subject}
                className="grid grid-cols-[120px_1fr_60px_90px] gap-3 items-center text-[12.5px]"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2 h-2 rounded-sm shrink-0"
                    style={{ background: color }}
                    aria-hidden="true"
                  />
                  <span className="truncate text-clay-900">{s.subject}</span>
                </div>
                <div className="relative">
                  <MiniBar pct={pct / 100} width={undefined} color={color} height={9} />
                  <div
                    className="absolute top-0 bottom-0 w-px"
                    style={{ left: `${target}%`, background: "rgba(46,34,24,0.4)" }}
                    title={`Target ${target}%`}
                    aria-hidden="true"
                  />
                </div>
                <span className="num-mono text-[11px] text-clay-700 text-right">
                  {pct}%
                </span>
                {onTarget ? (
                  <Pill tone="sage">on target</Pill>
                ) : (
                  <Pill tone="amber">below {target}%</Pill>
                )}
              </li>
            );
          })}
        </ul>
      )}
      <div className="rule mt-4 pt-3 text-[11.5px] text-clay-700">
        Target line comes from your study policy. Subjects below target trigger weak-area
        drills in the next plan compile.
      </div>
    </StudyCard>
  );
}
