import React, { useState } from "react";
import { ChevronDown, ChevronRight, FileSearch } from "lucide-react";

// Generic, collapsible evidence drawer. Renders a list of evidence entries
// and/or arbitrary children. Persona and Exam Intelligence wrap this with
// domain-specific variants (PersonaEvidenceDrawer, ExamEvidenceDrawer).
//
// `items` entries may be:
//   - a plain string  ->  rendered as a bullet line
//   - an object { type?, label, value?, status? }
function EvidenceRow({ entry }) {
  if (entry == null) return null;
  if (typeof entry === "string") {
    return <li className="text-xs text-clay-800">• {entry}</li>;
  }
  const { type, label, value, status } = entry;
  return (
    <li className="flex items-start justify-between gap-3 rounded-xl bg-clay-50 px-3 py-2">
      <div className="min-w-0">
        {type ? (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">
            {String(type).replaceAll("_", " ")}
          </div>
        ) : null}
        <div className="text-xs text-clay-800 break-words">{label}</div>
      </div>
      <div className="text-right shrink-0">
        {value !== undefined && value !== null ? (
          <div className="text-xs font-medium text-clay-800 tabular-nums">{String(value)}</div>
        ) : null}
        {status ? (
          <div className="text-[10px] uppercase tracking-wider text-muted-foreground">{status}</div>
        ) : null}
      </div>
    </li>
  );
}

export default function EvidenceDrawer({
  label = "Evidence",
  items,
  count,
  defaultOpen = false,
  emptyText = "No evidence recorded.",
  children,
  testId,
}) {
  const [open, setOpen] = useState(!!defaultOpen);
  const rows = Array.isArray(items) ? items : [];
  const total = count ?? rows.length;
  return (
    <div className="mt-2 text-xs" data-testid={testId}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1 text-muted-foreground hover:text-clay-700"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <ChevronRight className="h-3.5 w-3.5" aria-hidden="true" />
        )}
        <FileSearch className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
        {total ? <span className="text-clay-600">({total})</span> : null}
      </button>
      {open ? (
        <div className="mt-2 space-y-2">
          {rows.length ? (
            <ul className="space-y-1.5">
              {rows.map((entry, i) => (
                <EvidenceRow key={i} entry={entry} />
              ))}
            </ul>
          ) : !children ? (
            <p className="text-muted-foreground">{emptyText}</p>
          ) : null}
          {children}
        </div>
      ) : null}
    </div>
  );
}
