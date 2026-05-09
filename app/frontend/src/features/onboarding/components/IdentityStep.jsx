import React from "react";
import { useFormContext } from "react-hook-form";
import { InputField, SelectField } from "../../../shared/ui";
import { CATEGORY_OPTIONS, GENDER_OPTIONS, INDIAN_STATE_OPTIONS, PWBD_OPTIONS } from "../../../lib/profileFields";

export default function IdentityStep({ showErrors }) {
  const { register, formState: { errors, touchedFields } } = useFormContext();
  const err = (name) => (showErrors || touchedFields[name]) ? errors[name]?.message : undefined;
  return <div className="grid md:grid-cols-2 gap-4"><InputField label="Full name" required {...register("name")} error={err("name")} /><InputField label="Date of birth" required placeholder="YYYY-MM-DD" {...register("date_of_birth")} error={err("date_of_birth")} /><SelectField label="Gender" required {...register("gender")} error={err("gender")}><option value="">Not provided</option>{GENDER_OPTIONS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}</SelectField><SelectField label="Category" required {...register("category")} error={err("category")}><option value="">Not provided</option>{CATEGORY_OPTIONS.map((c) => <option key={c} value={c}>{c}</option>)}</SelectField><SelectField label="PwBD status" {...register("pwbd_status")}><option value="">Not provided</option>{PWBD_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}</SelectField><SelectField label="Domicile state" required {...register("state")} error={err("state")}><option value="">Not provided</option>{INDIAN_STATE_OPTIONS.map((s) => <option key={s} value={s}>{s.replaceAll("_", " ")}</option>)}</SelectField></div>;
}
