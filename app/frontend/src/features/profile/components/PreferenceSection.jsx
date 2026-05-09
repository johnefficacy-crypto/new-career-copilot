import React from "react";
import { useFormContext } from "react-hook-form";
import { CheckboxField, SelectField } from "../../../shared/ui";
import { EXAM_FAMILY_OPTIONS, INDIAN_STATE_OPTIONS, SECTOR_OPTIONS } from "../../../lib/profileFields";
import { Chips, Section } from "./shared";

export default function PreferenceSection() {
  const { watch, setValue } = useFormContext();
  const form = watch();
  const toggleArray = (k, value) => {
    const arr = form[k] || [];
    const next = arr.includes(value) ? arr.filter((x) => x !== value) : [...arr, value];
    setValue(k, next, { shouldDirty: true, shouldTouch: true });
  };
  return <Section title="Preferences" helper="Preferences improve recommendation relevance only."><div className="space-y-2"><div className="text-sm text-muted-foreground">Exam families</div><Chips options={EXAM_FAMILY_OPTIONS} values={form.goal_exams || []} onToggle={(v) => toggleArray("goal_exams", v)} /></div><div className="space-y-2"><div className="text-sm text-muted-foreground">Preferred sectors</div><Chips options={SECTOR_OPTIONS} values={form.preferred_sectors || []} onToggle={(v) => toggleArray("preferred_sectors", v)} /></div><SelectField label="Preferred states" value="" onChange={(e) => e.target.value && !(form.preferred_states || []).includes(e.target.value) && setValue("preferred_states", [...(form.preferred_states || []), e.target.value], { shouldDirty: true, shouldTouch: true })}><option value="">Select state to add</option>{INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</SelectField><div className="flex flex-wrap gap-2">{(form.preferred_states || []).length ? form.preferred_states.map((s) => <button key={s} type="button" onClick={() => setValue("preferred_states", form.preferred_states.filter((x) => x !== s), { shouldDirty: true, shouldTouch: true })} className="px-3 py-1 rounded-full border border-clay-300 bg-clay-50 text-xs">{s.replaceAll("_", " ")} ×</button>) : <span className="text-xs text-muted-foreground">Not provided</span>}</div><CheckboxField label="Willing to relocate" checked={!!form.willing_to_relocate} onChange={(e) => setValue("willing_to_relocate", e.target.checked, { shouldDirty: true, shouldTouch: true })} /></Section>;
}
