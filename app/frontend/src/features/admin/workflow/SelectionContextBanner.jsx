import React from "react";
import { X } from "lucide-react";

// Sticky banner that surfaces the admin's currently selected source / queue
// item / recruitment as small chips. Each chip has its own clear button so
// admins can drop one selection without losing the others when scrolling
// through the right-hand workspace.
//
// Only renders when at least one selection is active. Position is sticky
// inside the parent column; parent decides the offset.
export default function SelectionContextBanner({
  source,
  queueItem,
  recruitment,
  onClearSource,
  onClearQueue,
  onClearRecruitment,
}) {
  const items = [];
  if (source) {
    items.push({
      key: "source",
      kind: "Source",
      label: source.org || source.source_name || source.id,
      detail: source.source_type || source.kind || null,
      onClear: onClearSource,
      testId: "ctx-chip-source",
    });
  }
  if (queueItem) {
    items.push({
      key: "queue",
      kind: "Queue",
      label: queueItem.recruitment || queueItem.extracted_data?.title || queueItem.source_name || queueItem.id,
      detail: queueItem.status || "pending",
      onClear: onClearQueue,
      testId: "ctx-chip-queue",
    });
  }
  if (recruitment) {
    items.push({
      key: "recruitment",
      kind: "Recruitment",
      label: recruitment.name || recruitment.id,
      detail: recruitment.publish_status || null,
      onClear: onClearRecruitment,
      testId: "ctx-chip-recruitment",
    });
  }

  if (!items.length) return null;

  return (
    <div
      className="sticky top-0 z-30 -mx-1 flex flex-wrap items-center gap-2 rounded-2xl border border-border bg-[#FBF6EF]/95 px-3 py-2 backdrop-blur"
      data-testid="selection-context-banner"
    >
      <span className="text-[10px] font-semibold uppercase tracking-[0.22em] text-muted-foreground">Context</span>
      {items.map((item) => (
        <span
          key={item.key}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-white/80 pl-2 pr-1 py-0.5 text-[11px]"
          data-testid={item.testId}
        >
          <span className="font-mono text-[9px] uppercase text-muted-foreground">{item.kind}</span>
          <span className="font-semibold max-w-[180px] truncate">{item.label}</span>
          {item.detail ? <span className="text-muted-foreground">· {item.detail}</span> : null}
          {item.onClear ? (
            <button
              type="button"
              onClick={item.onClear}
              className="ml-0.5 rounded-full p-0.5 hover:bg-clay-100"
              aria-label={`Clear ${item.kind} selection`}
              data-testid={`${item.testId}-clear`}
            >
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
