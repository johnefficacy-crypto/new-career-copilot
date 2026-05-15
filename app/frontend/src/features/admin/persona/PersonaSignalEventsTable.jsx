import React from "react";
import { JsonPreview } from "../../../shared/ui";

// Raw persona signal events list. Extracted from the AdminPersona page so the
// Signal Events tab has a dedicated, testable component.
export default function PersonaSignalEventsTable({ items }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return (
      <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
        No events match the current filter.
      </div>
    );
  }
  return (
    <ul className="space-y-2" data-testid="persona-signal-events-table">
      {rows.map((ev) => (
        <li key={ev.id} className="soft-card rounded-2xl p-3 text-sm">
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs">{ev.event_type}</span>
            <span className="text-[10px] text-muted-foreground">{ev.created_at}</span>
          </div>
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span className="font-mono">user_id · {ev.user_id}</span>
            <span className="text-[10px] uppercase tracking-wider">
              {ev.processed ? "processed" : "unprocessed"}
            </span>
          </div>
          <JsonPreview label="payload" value={ev.payload} />
        </li>
      ))}
    </ul>
  );
}
