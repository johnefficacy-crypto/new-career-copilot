import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";

export default function JsonPreview({ label, value, defaultOpen = false, max = 4000 }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const text = (() => {
    try {
      return JSON.stringify(value, null, 2);
    } catch {
      return String(value);
    }
  })();
  const truncated = text.length > max;
  const display = truncated ? `${text.slice(0, max)}\n… (truncated)` : text;
  return (
    <div className="mt-2 text-xs">
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
        {label || "JSON"}
      </button>
      {open ? (
        <pre className="mt-2 rounded-xl bg-clay-50 p-3 text-[11px] leading-snug overflow-x-auto whitespace-pre-wrap break-all">
          {display}
        </pre>
      ) : null}
    </div>
  );
}
