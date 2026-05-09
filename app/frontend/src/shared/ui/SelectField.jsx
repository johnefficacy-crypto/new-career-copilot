import React from "react";
import FormField from "./FormField";

export default function SelectField({ label, error, helper, required, className = "", children, ...props }) {
  return (
    <FormField label={label} error={error} helper={helper} required={required}>
      <select className={`w-full px-3 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none ${className}`} {...props}>
        {children}
      </select>
    </FormField>
  );
}
