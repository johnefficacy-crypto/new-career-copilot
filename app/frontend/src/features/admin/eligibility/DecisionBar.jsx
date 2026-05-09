import React, { useState } from "react";

export default function DecisionBar({ item, busy, onPromote, onReject }) {
  const [notes, setNotes] = useState("");
  const [err, setErr] = useState("");

  return (
    <div className="sticky bottom-0 bg-[#FBF6EF] border-t border-border p-4 space-y-2">
      <textarea value={notes} onChange={(e) => { setNotes(e.target.value); if (e.target.value.trim()) setErr(""); }} placeholder="Rejection notes (required for reject)" className="w-full px-3 py-2 rounded-lg border border-border bg-white/80 text-sm" rows={3} />
      {err && <div className="text-xs text-destructive">{err}</div>}
      <div className="flex gap-2 justify-end">
        <button type="button" disabled={busy} className="btn btn-ghost text-xs" data-testid={`reject-${item.id}`} onClick={() => { if (!notes.trim()) { setErr("Notes are required to reject."); return; } onReject(notes); }}>Reject</button>
        <button type="button" disabled={busy} className="btn btn-primary text-xs" data-testid={`promote-${item.id}`} onClick={() => { if (window.confirm(`Promote "${item.recruitment}"?`)) onPromote(); }}>Promote</button>
      </div>
    </div>
  );
}
