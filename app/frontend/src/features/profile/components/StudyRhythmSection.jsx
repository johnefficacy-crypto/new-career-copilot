import React from "react";
import { InputField, SelectField } from "../../../shared/ui";
import { PREPARATION_MODE_OPTIONS } from "../../../lib/profileFields";
import { Grid, Section } from "./shared";

export default function StudyRhythmSection({ form, set }) { return <Section title="Study rhythm" helper="Used for plan pacing and backlog signals."><Grid><SelectField label="Preparation mode" value={form.study_mode || ""} onChange={(e) => set("study_mode", e.target.value)}><option value="">Not provided</option>{PREPARATION_MODE_OPTIONS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</SelectField><InputField label="Weekly hours goal" value={form.weekly_hours_goal || ""} onChange={(e) => set("weekly_hours_goal", e.target.value)} /><InputField label="Target exam year" value={form.target_exam_year || ""} onChange={(e) => set("target_exam_year", e.target.value)} /></Grid></Section>; }
