import React from "react";
import { Eyebrow, SectionHeader, MiniBar, StatusDot } from "../../../shared/ui/studyos";
import { StudyCard } from "../../../shared/ui/studyos";

const SIZE_LABEL = { small: "Small", medium: "Medium", large: "Large" };

// Mirrors the prototype StudyPolicyPreview: 3-column grid of daily target,
// task-mix bars and constraints. Generated from the persona snapshot.
export default function StudyPolicyPreview({ policy }) {
  if (!policy || !Object.keys(policy).length) return null;
  const mix = policy.task_mix || {};
  const constraints = policy.constraints || {};
  const sizeLabel = SIZE_LABEL[policy.preferred_task_size] || "—";
  const constraintBadges = Object.entries(constraints)
    .filter(([, v]) => v === true)
    .map(([k]) => k.replaceAll("_", " "));
  const mixEntries = Object.entries(mix);

  return (
    <StudyCard data-testid="study-policy-preview">
      <SectionHeader
        eyebrow="Study policy preview"
        title="The rules behind today's task selection."
        sub="Generated from your persona snapshot. Adjust it from Plan preferences."
        right={<StatusDot state="partial" label="Persona-derived" />}
      />
      <div className="grid md:grid-cols-3 gap-5">
        <div>
          <Eyebrow>Daily target</Eyebrow>
          <div className="font-heading text-[18px] mt-1.5">
            {policy.daily_minutes_target ? `${policy.daily_minutes_target} min` : "—"}
          </div>
          <div className="text-[12px] text-clay-700 mt-1">
            Max {policy.max_tasks_per_day ?? "—"} tasks · prefer {sizeLabel.toLowerCase()}
            {policy.nudge_style
              ? ` · ${String(policy.nudge_style).replaceAll("_", " ")} nudges`
              : ""}
          </div>
        </div>
        <div>
          <Eyebrow>Task mix</Eyebrow>
          {mixEntries.length ? (
            <div className="mt-2 space-y-1.5">
              {mixEntries.map(([k, v]) => {
                const pct = Math.round(Number(v || 0) * 100);
                return (
                  <div key={k} className="flex items-center gap-2 text-[12px]">
                    <span className="w-[110px] text-clay-800 capitalize">
                      {k.replaceAll("_", " ")}
                    </span>
                    <MiniBar pct={pct / 100} width={110} />
                    <span className="num-mono text-[11px] text-clay-700">{pct}%</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <p className="mt-2 text-[12px] text-clay-700">No task mix configured.</p>
          )}
        </div>
        <div>
          <Eyebrow>Constraints</Eyebrow>
          {constraintBadges.length ? (
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-clay-800">
              {constraintBadges.map((c) => (
                <li key={c} className="flex items-start gap-2 capitalize">
                  <span className="text-sage-600 mt-0.5" aria-hidden="true">·</span>
                  <span>{c}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-[12px] text-clay-700">No special constraints.</p>
          )}
        </div>
      </div>
    </StudyCard>
  );
}
