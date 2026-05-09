import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField } from "../../../shared/ui";
import { Grid, Section } from "./shared";

export default function EducationSection() { const { register, formState: { errors, touchedFields } } = useFormContext(); const err = (k) => touchedFields[k] ? errors[k]?.message : undefined; return <Section title="Education" helper="Qualification and marks drive post-level matching."><Grid><InputField label="Education level" {...register("education_level")} /><InputField label="Qualification" {...register("qualification")} /><InputField label="Stream" {...register("stream")} /><InputField label="Passing year" {...register("qualification_year")} error={err("qualification_year")} /><InputField label="Percentage" {...register("percentage")} /><InputField label="CGPA" {...register("cgpa")} /></Grid></Section>; }
