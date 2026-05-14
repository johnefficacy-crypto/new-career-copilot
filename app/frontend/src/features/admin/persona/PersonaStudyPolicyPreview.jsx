import React from "react";

const SIZE_LABEL = { small: "Small", medium: "Medium", large: "Large" };

export default function PersonaStudyPolicyPreview({ policy }) {
  if (!policy || !Object.keys(policy).length) {
    return (
      <div className="soft-card rounded-2xl p-4 text-xs text-muted-foreground">
        No study policy in this snapshot.
      </div>
    );
  }
  const mix = policy.task_mix || {};
  const constraints = policy.constraints || {};
  const sizeLabel = SIZE_LABEL[policy.preferred_task_size] || "—";
  const constraintBadges = Object.entries(constraints)
    .filter(([, v]) => v === true)
    .map(([k]) => k.replaceAll("_", " "));

  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        Study policy preview
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-xs text-muted-foreground">Daily target</div>
          <div className="font-medium text-clay-800">
            {policy.daily_minutes_target ? `${policy.daily_minutes_target} min` : "—"}
          </div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Max tasks / day</div>
          <div className="font-medium text-clay-800">{policy.max_tasks_per_day ?? "—"}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Preferred size</div>
          <div className="font-medium text-clay-800">{sizeLabel}</div>
        </div>
        <div>
          <div className="text-xs text-muted-foreground">Nudge style</div>
          <div className="font-medium text-clay-800">
            {(policy.nudge_style || "").replaceAll("_", " ") || "—"}
          </div>
        </div>
      </div>
      {Object.keys(mix).length ? (
        <div className="mt-3 flex flex-wrap gap-1">
          {Object.entries(mix).map(([k, v]) => (
            <span
              key={k}
              className="pill text-[10px] uppercase tracking-wider bg-clay-50 text-clay-700 px-2 py-0.5 rounded-full"
            >
              {k.replaceAll("_", " ")} {Math.round(Number(v || 0) * 100)}%
            </span>
          ))}
        </div>
      ) : null}
      {constraintBadges.length ? (
        <div className="mt-2 flex flex-wrap gap-1">
          {constraintBadges.map((c) => (
            <span
              key={c}
              className="pill text-[10px] uppercase tracking-wider bg-sage-50 text-sage-700 px-2 py-0.5 rounded-full"
            >
              {c}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
