import React, { useMemo, useRef } from "react";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

const renderValue = (v) => (v == null || v === "" ? "—" : typeof v === "object" ? JSON.stringify(v) : String(v));
const getFieldDiff = (before, after) => {
  const b = before && typeof before === "object" ? before : {};
  const a = after && typeof after === "object" ? after : {};
  const keys = Array.from(new Set([...Object.keys(b), ...Object.keys(a)]));
  return keys.filter((k) => JSON.stringify(b[k]) !== JSON.stringify(a[k])).map((k) => ({ field: k, before: b[k], after: a[k] }));
};

export default function AuditTimelineDrawer({ open, title, items = [], onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  const trend = useMemo(() => ({
    success: items.filter((i) => i.event_type?.includes("verify") && !(i.notes || "").includes("failed")).length,
    failure: items.filter((i) => i.event_type?.includes("verify") && (i.notes || "").includes("failed")).length,
  }), [items]);
  if (!open) return null;
  return <div className="fixed inset-0 z-50 flex justify-end"><div className="absolute inset-0 bg-black/30" onClick={onClose} /><aside ref={panelRef} tabIndex={-1} className="relative h-full w-full max-w-2xl bg-[#FBF6EF] border-l border-border p-4 overflow-auto"><div className="flex items-center justify-between"><h2 className="font-heading text-lg">{title} history</h2><button ref={closeRef} className="btn btn-ghost text-xs" onClick={onClose}>Close</button></div><div className="soft-card p-3 mt-3 text-xs">{items.length ? <>Verification trend: success {trend.success} · failed {trend.failure}</> : "No historical checks recorded yet"}</div>{!items.length ? <div className="text-sm text-muted-foreground mt-4">No history entries found yet.</div> : <div className="mt-4 space-y-3">{items.map((ev) => { const diffs = getFieldDiff(ev.before, ev.after); return <div key={ev.id} className="soft-card p-3"><div className="text-xs text-muted-foreground">{ev.created_at || "—"} · {ev.event_type}</div><div className="text-xs">actor: {ev.actor?.email || ev.actor?.id || "system"}</div>{ev.notes ? <div className="text-xs mt-1">notes: {renderValue(ev.notes)}</div> : null}{diffs.length ? <table className="w-full mt-2 text-xs"><thead><tr><th className="text-left">Field</th><th className="text-left">Before</th><th className="text-left">After</th></tr></thead><tbody>{diffs.map((d) => <tr key={d.field}><td>{d.field}</td><td>{renderValue(d.before)}</td><td>{renderValue(d.after)}</td></tr>)}</tbody></table> : <div className="text-xs mt-1">No field-level changes captured.</div>}</div>; })}</div>}</aside></div>;
}
