import React from "react";
import { useFormContext } from "react-hook-form";
import { CheckboxField, InputField, SelectField } from "../../../shared/ui";
import { CATEGORY_OPTIONS, INDIAN_STATE_OPTIONS, PWBD_OPTIONS } from "../../../lib/profileFields";
import { Grid, Section } from "./shared";

export default function ReservationSection() {
  const { register, watch, setValue, formState: { errors, touchedFields } } = useFormContext();
  const err = (k) => touchedFields[k] ? errors[k]?.message : undefined;
  return <Section title="Reservation & domicile" helper="Impacts reservation and state-specific eligibility rules."><Grid><SelectField label="Category" {...register("category")} error={err("category")}><option value="">Not provided</option>{CATEGORY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</SelectField><SelectField label="PwBD status" {...register("pwbd_status")}><option value="">Not provided</option>{PWBD_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}</SelectField><SelectField label="Domicile state" {...register("state")} error={err("state")}><option value="">Not provided</option>{INDIAN_STATE_OPTIONS.map((v) => <option key={v} value={v}>{v.replaceAll("_", " ")}</option>)}</SelectField><InputField label="Nationality" {...register("nationality")} placeholder="Not provided" /><CheckboxField label="Ex-serviceman" checked={!!watch("ex_serviceman")} onChange={(e) => setValue("ex_serviceman", e.target.checked, { shouldDirty: true, shouldTouch: true })} /><InputField label="Service years" {...register("service_years")} error={err("service_years")} placeholder="Not provided" /><CheckboxField label="Government employee" checked={!!watch("govt_employee")} onChange={(e) => setValue("govt_employee", e.target.checked, { shouldDirty: true, shouldTouch: true })} /></Grid></Section>;
}
