import React, { useId } from "react";

export default function CheckboxField({ label, helper, error, id, className = "", ...props }) {
  const generatedId = useId();
  const controlId = id || generatedId;
  return (
    <div className="space-y-1">
      <label htmlFor={controlId} className={`inline-flex items-center gap-2 text-sm ${className}`}>
        <input id={controlId} type="checkbox" aria-invalid={Boolean(error)} {...props} />
        <span>{label}</span>
      </label>
      {helper && <p className="text-xs text-muted-foreground">{helper}</p>}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
