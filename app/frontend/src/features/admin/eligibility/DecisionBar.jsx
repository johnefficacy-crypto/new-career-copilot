import React, { useState } from "react";

export default function DecisionBar({ item, busy, onPromote, onReject }) {
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");
  const blockers = item?.unverified_fields || [];
  const canPromote = item?.promotable !== false && blockers.length === 0;

  return (
    <div className="sticky bottom-0 bg-[#FBF6EF] border-t border-border p-4 space-y-2">
      <textarea value={notes} onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setErr(""); }} placeholder="Rejection notes (required for reject)" className="w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm" rows={3} />
      {err && <div className="text-xs text-destructive">{err}</div>}
      {!canPromote && <div className="rounded-lg border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">Promote blocked. Verify or correct required fields in this drawer first: {blockers.join(", ")}.</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" disabled={busy} className="btn btn-ghost text-xs" data-testid={`reject-${item.id}`} onClick={() => { if (!notes.trim()) { setErr("Notes are required to reject candidate."); return; } onReject(notes); }}>Reject candidate</button>
        <button type="button" disabled={busy || !canPromote} className="btn btn-primary text-xs" data-testid={`promote-${item.id}`} onClick={() => { if (window.confirm(`Promote "${item.recruitment}" to recruitment draft? This does not publish or send alerts.`)) onPromote(); }}>Promote to recruitment draft</button>
      </div>
    </div>
  );
}
