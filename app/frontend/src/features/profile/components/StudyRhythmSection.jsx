import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField, SelectField } from "../../../shared/ui";
import { PREPARATION_MODE_OPTIONS } from "../../../lib/profileFields";
import { Grid, Section } from "./shared";

export default function StudyRhythmSection() { const { register, formState: { errors, touchedFields } } = useFormContext(); const err = (k) => touchedFields[k] ? errors[k]?.message : undefined; return <Section title="Study rhythm" helper="Used for plan pacing and backlog signals."><Grid><SelectField label="Preparation mode" {...register("study_mode")}><option value="">Not provided</option>{PREPARATION_MODE_OPTIONS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</SelectField><InputField label="Weekly hours goal" {...register("weekly_hours_goal")} error={err("weekly_hours_goal")} /><InputField label="Target exam year" {...register("target_exam_year")} error={err("target_exam_year")} /></Grid></Section>; }
