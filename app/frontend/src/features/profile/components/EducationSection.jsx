import React from "react";
import { InputField } from "../../../shared/ui";
import { Grid, Section } from "./shared";

export default function EducationSection({ form, set }) { return <Section title="Education" helper="Qualification and marks drive post-level matching."><Grid><InputField label="Education level" value={form.education_level || ""} onChange={(e) => set("education_level", e.target.value)} /><InputField label="Qualification" value={form.qualification || ""} onChange={(e) => set("qualification", e.target.value)} /><InputField label="Stream" value={form.stream || ""} onChange={(e) => set("stream", e.target.value)} /><InputField label="Passing year" value={form.qualification_year || ""} onChange={(e) => set("qualification_year", e.target.value)} /><InputField label="Percentage" value={form.percentage || ""} onChange={(e) => set("percentage", e.target.value)} /><InputField label="CGPA" value={form.cgpa || ""} onChange={(e) => set("cgpa", e.target.value)} /></Grid></Section>; }
