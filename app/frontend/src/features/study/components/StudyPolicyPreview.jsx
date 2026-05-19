import React from "react";
import { Eyebrow, SectionHeader, MiniBar, StatusDot } from "../../../shared/ui/studyos";
import { StudyCard } from "../../../shared/ui/studyos";

const SIZE_LABEL = { small: "Small", medium: "Medium", large: "Large" };

// Build a display row for each constraint. Supports:
//   - boolean: `{no_late_night_study: true}`      → "no late night study"
//   - number / string: `{min_break_minutes: 15}`  → "min break minutes · 15"
//   - array (e.g. tags): `{quiet_hours: ["22-06"]}` → "quiet hours · 22-06"
//   - object `{label, value}`: rendered as the explicit pair
// The prior truthy-only filter silently dropped every non-boolean,
// hiding numeric constraints the policy engine may emit.
function formatConstraint([key, raw]) {
  if (raw == null || raw === false) return null;
  const label = key.replaceAll("_", " ");
  if (raw === true) return { label, value: null };
  if (Array.isArray(raw)) {
    if (raw.length === 0) return null;
    return { label, value: raw.join(", ") };
  }
  if (typeof raw === "object") {
    const explicit = raw.label || label;
    const value = raw.value ?? raw.minutes ?? raw.hours ?? null;
    return { label: explicit, value };
  }
  return { label, value: String(raw) };
}

export default function StudyPolicyPreview({ policy }) {
  if (!policy || !Object.keys(policy).length) return null;
  const mix = policy.task_mix || {};
  const constraints = policy.constraints || {};
  const sizeLabel = SIZE_LABEL[policy.preferred_task_size] || "—";
  const constraintRows = Object.entries(constraints)
    .map(formatConstraint)
    .filter(Boolean);
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
          {constraintRows.length ? (
            <ul className="mt-2 space-y-1.5 text-[12.5px] text-clay-800">
              {constraintRows.map((c, i) => (
                <li
                  key={`${c.label}-${i}`}
                  className="flex items-start gap-2"
                >
                  <span className="text-sage-600 mt-0.5" aria-hidden="true">·</span>
                  <span className="capitalize">{c.label}</span>
                  {c.value != null && c.value !== "" ? (
                    <span className="num-mono text-[11px] text-clay-700 ml-auto">
                      {c.value}
                    </span>
                  ) : null}
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
