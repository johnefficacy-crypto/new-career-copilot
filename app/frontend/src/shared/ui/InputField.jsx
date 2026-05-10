import React from "react";
import FormField from "./FormField";

const InputField = React.forwardRef(function InputField(
  { label, error, helper, required, className = "", ...props },
  ref
) {
  return (
    <FormField label={label} error={error} helper={helper} required={required}>
      <input
        ref={ref}
        className={`w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm outline-none ${className}`}
        {...props}
      />
    </FormField>
  );
});

export default InputField;