import React from "react";
import { InputField, SelectField } from "../../../shared/ui";
import { PREPARATION_MODE_OPTIONS } from "../../../lib/profileFields";

export default function StudyStep({ form, set, errors }) { return <div className="grid md:grid-cols-2 gap-4"><SelectField label="Preparation mode" value={form.study_mode} onChange={(e) => set("study_mode", e.target.value)}><option value="">Not provided</option>{PREPARATION_MODE_OPTIONS.map((p) => <option key={p} value={p}>{p.replaceAll("_", " ")}</option>)}</SelectField><InputField label="Weekly hours goal" type="number" value={form.weekly_hours_goal} onChange={(e) => set("weekly_hours_goal", e.target.value)} error={errors.weekly_hours_goal} /><InputField label="Target exam year" type="number" value={form.target_exam_year} onChange={(e) => set("target_exam_year", e.target.value)} error={errors.target_exam_year} /></div>; }
