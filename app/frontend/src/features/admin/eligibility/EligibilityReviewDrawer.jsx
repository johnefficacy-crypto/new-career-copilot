import React from "react";
import DecisionBar from "./DecisionBar";
import { StatusBadge } from "../../../shared/ui";

function Row({ label, value }) {
  if (value == null || value === "") return null;
  return <div><div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="text-sm break-words">{String(value)}</div></div>;
}

export default function EligibilityReviewDrawer({ item, open, onClose, busy, onPromote, onReject }) {
  if (!open || !item) return null;
  const confidence = Number(item.confidence || 0);
  const hasSource = Boolean(item.source);

  const optionalKeys = ["evidence", "source_provenance", "official_url", "notification_url", "raw", "raw_payload", "snapshot_url"];

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-black/30" onClick={onClose} />
      <aside className="relative w-full max-w-xl bg-[#FBF6EF] border-l border-border h-full overflow-y-auto flex flex-col">
        <div className="p-4 border-b border-border flex items-start justify-between gap-3">
          <div><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Eligibility review</div><h2 className="font-heading text-xl font-semibold mt-1">{item.recruitment || "Untitled recruitment"}</h2></div>
          <button className="btn btn-ghost text-xs" onClick={onClose}>Close</button>
        </div>
        <div className="p-4 space-y-4 flex-1">
          <Row label="Source" value={item.source || "—"} />
          <Row label="Added" value={item.added ? new Date(item.added).toLocaleString("en-IN") : "—"} />
          <div className="space-y-1"><div className="text-[11px] uppercase tracking-widest text-muted-foreground">Confidence</div><StatusBadge status={confidence < 0.7 ? "pending" : "verified"} label={`${Math.round(confidence * 100)}% confidence`} /></div>
          {!hasSource && <div className="text-xs text-destructive">Warning: Source missing.</div>}
          {confidence < 0.7 && <div className="text-xs text-destructive">Warning: Low confidence item.</div>}
          {optionalKeys.map((k) => <Row key={k} label={k.replaceAll("_", " ")} value={typeof item[k] === "object" ? JSON.stringify(item[k], null, 2) : item[k]} />)}
        </div>
        <DecisionBar item={item} busy={busy} onPromote={onPromote} onReject={onReject} />
      </aside>
    </div>
  );
}
