import React from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { Pill } from "../../../shared/ui/studyos";

const TREND = {
  up: { Icon: TrendingUp, cls: "text-sage-600" },
  down: { Icon: TrendingDown, cls: "text-dusk-600" },
  flat: { Icon: Minus, cls: "text-clay-600" },
};

// SubjectCard — single grained tile rendering subject progress + trend.
// Pure presentational: progress / trend / pills come from the server.
// `target` is the mastery threshold (0..100); the per-card pill must use
// the same number as the cohort-wide MasteryDistribution target so the
// two surfaces on the same page never contradict each other.
export default function SubjectCard({ s, color, onSelect, target = 65 }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0)));
  const targetPct = Number.isFinite(Number(target)) && Number(target) > 0 ? Number(target) : 65;
  const trend = TREND[s.trend] || TREND.flat;
  const TrendIcon = trend.Icon;
  const active = !!onSelect;
  const RootTag = active ? "button" : "div";
  return (
    <RootTag
      type={active ? "button" : undefined}
      onClick={active ? () => onSelect(s) : undefined}
      className={
        "text-left rounded-xl border border-[#E7DECB] bg-white/60 p-3.5 transition " +
        (active ? "hover:border-[#A68057] cursor-pointer" : "")
      }
      data-testid={`subject-card-${s.subject_id || s.subject}`}
    >
      <div className="flex items-center justify-between">
        <span
          className="w-2.5 h-2.5 rounded-sm"
          style={{ background: color }}
          aria-hidden="true"
        />
        <span
          className={`flex items-center gap-1 text-[10.5px] ${trend.cls}`}
          title={`Trend: ${s.trend || "flat"}`}
        >
          <TrendIcon className="h-3 w-3" aria-hidden="true" />
          {s.trend || "flat"}
        </span>
      </div>
      <div className="font-heading text-[16px] mt-1.5 leading-tight">{s.subject}</div>
      <div className="mt-2 h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-clay-700">
        <span className="num-mono">{pct}% closed</span>
        {pct < targetPct ? (
          <Pill tone="amber">below {targetPct}%</Pill>
        ) : (
          <Pill tone="sage">on target</Pill>
        )}
      </div>
      {s.weak_count ? (
        <div className="mt-1.5 text-[10.5px] text-[#7A3925]">
          {s.weak_count} weak topic{s.weak_count === 1 ? "" : "s"}
        </div>
      ) : null}
    </RootTag>
  );
}
