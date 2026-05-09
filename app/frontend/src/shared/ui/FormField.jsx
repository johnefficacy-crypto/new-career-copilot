import React, { cloneElement, isValidElement, useId } from "react";

export default function FormField({ label, error, helper, required, children }) {
  const generatedId = useId();
  const childId = isValidElement(children) ? children.props.id : undefined;
  const controlId = childId || generatedId;

  const child = isValidElement(children)
    ? cloneElement(children, {
      id: controlId,
      "aria-invalid": Boolean(error),
      "aria-describedby": [helper ? `${controlId}-helper` : null, error ? `${controlId}-error` : null].filter(Boolean).join(" ") || undefined,
    })
    : children;

  return (
    <div className="space-y-1.5">
      {label && <label htmlFor={controlId} className="text-[11px] uppercase tracking-widest text-muted-foreground block">{label}{required && <span className="text-destructive"> *</span>}</label>}
      {child}
      {helper && <p id={`${controlId}-helper`} className="text-xs text-muted-foreground">{helper}</p>}
      {error && <p id={`${controlId}-error`} className="text-xs text-destructive">{error}</p>}
    </div>
  );
}
