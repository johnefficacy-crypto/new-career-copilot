import React from "react";
import { X } from "lucide-react";

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
      detail: source.source_type || source.kind || (source.is_verified ? "verified" : null),
      onClear: onClearSource,
      testId: "ctx-chip-source",
    });
  } else {
    items.push({ key: "source-empty", kind: "Source", label: "none", detail: null, testId: "ctx-chip-source-empty" });
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
  } else {
    items.push({ key: "queue-empty", kind: "Queue", label: "none", detail: null, testId: "ctx-chip-queue-empty" });
  }
  if (recruitment) {
    items.push({
      key: "recruitment",
      kind: "Recruit",
      label: recruitment.name || recruitment.id,
      detail: recruitment.publish_status || null,
      onClear: onClearRecruitment,
      testId: "ctx-chip-recruitment",
    });
  } else {
    items.push({ key: "recruitment-empty", kind: "Recruit", label: "none", detail: null, testId: "ctx-chip-recruitment-empty" });
  }

  return (
    <div className="ctx-strip" data-testid="selection-context-banner">
      <span className="lbl" style={{ alignSelf: "center" }}>context</span>
      {items.map((item) => (
        <span key={item.key} className="ctx-chip" data-testid={item.testId}>
          <span className="ctx-kind">{item.kind}</span>
          <strong>{item.label}</strong>
          {item.detail ? <span style={{ color: "var(--ink-mute)" }}>· {item.detail}</span> : null}
          {item.onClear ? (
            <button type="button" onClick={item.onClear} aria-label={`Clear ${item.kind}`} data-testid={`${item.testId}-clear`}>
              <X className="h-3 w-3" />
            </button>
          ) : null}
        </span>
      ))}
    </div>
  );
}
