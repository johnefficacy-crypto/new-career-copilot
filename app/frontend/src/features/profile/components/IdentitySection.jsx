import React from "react";
import { InputField, SelectField } from "../../../shared/ui";
import { GENDER_OPTIONS } from "../../../lib/profileFields";
import { Grid, Section } from "./shared";

export default function IdentitySection({ form, set }) {
  return <Section title="Identity" helper="Used for deterministic identity checks."><Grid><InputField label="Name" value={form.name || ""} onChange={(e) => set("name", e.target.value)} /><InputField label="Phone" value={form.phone || ""} onChange={(e) => set("phone", e.target.value)} placeholder="Not provided" /><SelectField label="Gender" value={form.gender || ""} onChange={(e) => set("gender", e.target.value)}>{GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</SelectField><InputField label="Date of birth" value={form.date_of_birth || ""} onChange={(e) => set("date_of_birth", e.target.value)} placeholder="YYYY-MM-DD" /></Grid></Section>;
}
