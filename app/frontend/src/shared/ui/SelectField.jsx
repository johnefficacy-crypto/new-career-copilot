import React from "react";
import FormField from "./FormField";

const SelectField = React.forwardRef(function SelectField(
  { label, error, helper, required, className = "", children, ...props },
  ref
) {
  return (
    <FormField label={label} error={error} helper={helper} required={required}>
      <select
        ref={ref}
        className={`w-full px-3 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none ${className}`}
        {...props}
      >
        {children}
      </select>
    </FormField>
  );
});

export default SelectField;