import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField, SelectField } from "../../../shared/ui";
import { EDUCATION_LEVEL_OPTIONS, MARKS_TYPE_OPTIONS } from "../../../lib/profileFields";

export default function EducationStep({ showErrors }) {
  const { register, watch, formState: { errors, touchedFields } } = useFormContext();
  const marksType = watch("marks_type");
  const err = (name) => (showErrors || touchedFields[name]) ? errors[name]?.message : undefined;
  return <div className="grid md:grid-cols-2 gap-4"><SelectField label="Education level" required {...register("education_level")} error={err("education_level")}><option value="">Not provided</option>{EDUCATION_LEVEL_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</SelectField><InputField label="Qualification / degree" required {...register("qualification")} error={err("qualification")} /><InputField label="Stream (optional)" {...register("stream")} /><InputField label="Passing year" required type="number" {...register("qualification_year")} error={err("qualification_year")} /><SelectField label="Marks type" {...register("marks_type")}>{MARKS_TYPE_OPTIONS.map((m) => <option key={m} value={m}>{m.toUpperCase()}</option>)}</SelectField>{marksType === "percentage" ? <InputField label="Percentage" type="number" {...register("percentage")} error={err("percentage")} /> : <InputField label="CGPA" type="number" step="0.01" {...register("cgpa")} error={err("cgpa")} />}</div>;
}
