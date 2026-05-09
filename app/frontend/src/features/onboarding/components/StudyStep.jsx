import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField, SelectField } from "../../../shared/ui";
import { PREPARATION_MODE_OPTIONS } from "../../../lib/profileFields";

export default function StudyStep({ showErrors }) { const { register, formState: { errors, touchedFields } } = useFormContext(); const err = (name) => (showErrors || touchedFields[name]) ? errors[name]?.message : undefined; return <div className="grid md:grid-cols-2 gap-4"><SelectField label="Preparation mode" {...register("study_mode")}><option value="">Not provided</option>{PREPARATION_MODE_OPTIONS.map((p) => <option key={p} value={p}>{p.replaceAll("_", " ")}</option>)}</SelectField><InputField label="Weekly hours goal" type="number" {...register("weekly_hours_goal")} error={err("weekly_hours_goal")} /><InputField label="Target exam year" type="number" {...register("target_exam_year")} error={err("target_exam_year")} /></div>; }
