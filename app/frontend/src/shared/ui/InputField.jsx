import React from "react";
import FormField from "./FormField";

export default function InputField({ label, error, helper, required, className = "", ...props }) {
  return (
    <FormField label={label} error={error} helper={helper} required={required}>
      <input className={`w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none ${className}`} {...props} />
    </FormField>
  );
}
