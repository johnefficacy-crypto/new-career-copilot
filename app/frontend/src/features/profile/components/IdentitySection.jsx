import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField, SelectField } from "../../../shared/ui";
import { GENDER_OPTIONS } from "../../../lib/profileFields";
import { getDOBInputBounds } from "../../../shared/forms/dateParsers";
import { Grid, Section } from "./shared";

export default function IdentitySection() {
  const { register, formState: { errors, touchedFields } } = useFormContext();
  const err = (k) => touchedFields[k] ? errors[k]?.message : undefined;
  const dobBounds = getDOBInputBounds();
  return <Section title="Identity" helper="Used for deterministic identity checks."><Grid><InputField label="Name" {...register("name")} error={err("name")} /><InputField label="Phone" {...register("phone")} placeholder="Not provided" /><SelectField label="Gender" {...register("gender")} error={err("gender")}><option value="">Not provided</option>{GENDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}</SelectField><InputField label="Date of birth" type="date" min={dobBounds.min} max={dobBounds.max} {...register("date_of_birth")} error={err("date_of_birth")} /></Grid></Section>;
}
