import React from "react";

export default function RowActions({ actions = [], groupLabel = "Row actions" }) {
  return (
    <div role="group" aria-label={groupLabel} className="flex flex-wrap gap-1.5">
      {actions.map((a) => (
        <button key={a.ariaLabel} type="button" aria-label={a.ariaLabel} title={a.title || undefined} disabled={a.disabled} onClick={a.onClick} className={a.primary ? "btn btn-primary" : "btn btn-ghost"}>
          {a.label}
        </button>
      ))}
    </div>
  );
}
