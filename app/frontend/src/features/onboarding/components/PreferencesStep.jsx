import React from "react";
import { CheckCircle2 } from "lucide-react";
import { useFormContext } from "react-hook-form";
import { CheckboxField, SelectField } from "../../../shared/ui";
import { EXAM_FAMILY_OPTIONS, INDIAN_STATE_OPTIONS, SECTOR_OPTIONS } from "../../../lib/profileFields";

function Chip({ active, onClick, children }) { return <button type="button" onClick={onClick} className={`text-left p-3 rounded-xl border-2 transition ${active ? "border-clay-500 bg-clay-50" : "border-border hover:border-clay-300"}`}><div className="flex items-center justify-between"><div className="font-semibold">{children}</div>{active && <CheckCircle2 className="h-4 w-4 text-sage-600" />}</div></button>; }

export default function PreferencesStep({ toggleArray, showErrors }) {
  const { watch, setValue, formState: { errors, touchedFields } } = useFormContext();
  const goalExams = watch("goal_exams") || [];
  const preferredSectors = watch("preferred_sectors") || [];
  const preferredStates = watch("preferred_states") || [];
  const willingToRelocate = watch("willing_to_relocate");

  return <div className="space-y-5"><div><div className="text-xs mb-2 text-muted-foreground">Target exam families</div><div className="grid md:grid-cols-2 gap-3">{EXAM_FAMILY_OPTIONS.map((e) => <Chip key={e} active={goalExams.includes(e)} onClick={() => toggleArray("goal_exams", e)}>{e.replaceAll("_", " ")}</Chip>)}</div></div><div><div className="text-xs mb-2 text-muted-foreground">Preferred sectors</div><div className="grid md:grid-cols-2 gap-3">{SECTOR_OPTIONS.map((s) => <Chip key={s} active={preferredSectors.includes(s)} onClick={() => toggleArray("preferred_sectors", s)}>{s.replaceAll("_", " ")}</Chip>)}</div></div>{(showErrors || touchedFields.goal_exams || touchedFields.preferred_sectors) && errors.goal_exams && <div className="text-xs text-destructive">{errors.goal_exams.message}</div>}<SelectField label="Preferred states" value="" onChange={(e) => e.target.value && toggleArray("preferred_states", e.target.value, 6)}><option value="">Select state to add</option>{INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</SelectField><div className="text-xs text-muted-foreground">Selected: {preferredStates.length ? preferredStates.map((s) => s.replaceAll("_", " ")).join(", ") : "Not provided"}</div><CheckboxField label="Willing to relocate" checked={!!willingToRelocate} onChange={(e) => setValue("willing_to_relocate", e.target.checked, { shouldDirty: true, shouldTouch: true })} /></div>;
}
