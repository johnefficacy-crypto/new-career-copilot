import React, { useMemo, useState } from "react";
import { X } from "lucide-react";

// Inline panel (not a modal) to keep the admin inside the Operations
// Console. Promote remains backend-gated; submitting this just flips
// official_source_resolved=true on the queue row.
export default function OfficialSourceResolver({ open, sources = [], queueItem, busy, onClose, onSubmit }) {
  const verifiedSources = useMemo(
    () => (sources || []).filter((s) => s.is_verified && (s.source_type !== "aggregator") && !s.discovery_only && s.is_active !== false),
    [sources],
  );
  const [sourceId, setSourceId] = useState("");
  const [notificationUrl, setNotificationUrl] = useState(queueItem?.raw_extracted_item?.official_notification_url || "");
  const [applyUrl, setApplyUrl] = useState(queueItem?.raw_extracted_item?.official_apply_url || "");
  const [pdfUrl, setPdfUrl] = useState(queueItem?.raw_extracted_item?.source_pdf_url || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);

  if (!open) return null;

  const submit = async () => {
    setError(null);
    if (!sourceId) {
      setError("Pick a verified source.");
      return;
    }
    try {
      await onSubmit?.({
        source_id: sourceId,
        official_notification_url: notificationUrl || null,
        official_apply_url: applyUrl || null,
        source_pdf_url: pdfUrl || null,
        notes: notes || null,
      });
    } catch (e) {
      setError(e?.message || "Resolve failed");
    }
  };

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="official-source-resolver">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Resolve official source</div>
          <h3 className="font-heading text-lg">Link a verified official source</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Aggregator candidates cannot be used as official proof. Pick a verified, non-aggregator source; the
            backend will flip the promotion gate but will not auto-promote.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-8 w-8 p-0" onClick={onClose} aria-label="Close resolver">
          <X className="h-4 w-4" />
        </button>
      </div>

      {error ? <div className="mt-3 rounded-xl border border-destructive/30 bg-white/70 p-2 text-xs text-destructive">{error}</div> : null}

      <div className="mt-3 space-y-2 text-xs">
        <label className="block">
          <div className="mb-1 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground">Verified source</div>
          <select className="w-full rounded-lg border border-border bg-white px-2 py-1" value={sourceId} onChange={(e) => setSourceId(e.target.value)} data-testid="resolver-source-select">
            <option value="">Select verified source...</option>
            {verifiedSources.map((s) => <option key={s.id} value={s.id}>{s.org || s.source_name} · {s.source_type}</option>)}
          </select>
          {verifiedSources.length === 0 ? (
            <div className="mt-1 text-[11px] text-amber-700">
              No verified non-aggregator sources are available. Verify one from the Source Registry first.
            </div>
          ) : null}
        </label>
        <UrlField label="Official notification URL" value={notificationUrl} onChange={setNotificationUrl} testId="resolver-notification-url" />
        <UrlField label="Official apply URL" value={applyUrl} onChange={setApplyUrl} testId="resolver-apply-url" />
        <UrlField label="Source PDF URL" value={pdfUrl} onChange={setPdfUrl} testId="resolver-pdf-url" />
        <label className="block">
          <div className="mb-1 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground">Notes</div>
          <textarea className="w-full rounded-lg border border-border bg-white px-2 py-1" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </label>
      </div>

      <div className="mt-3 flex flex-wrap justify-end gap-2">
        <button type="button" className="btn btn-ghost h-8 text-xs" onClick={onClose} disabled={busy}>Cancel</button>
        <button
          type="button"
          className="btn btn-primary h-8 text-xs"
          onClick={submit}
          disabled={busy || !sourceId}
          data-testid="resolver-submit"
        >
          {busy ? "Resolving..." : "Mark official source resolved"}
        </button>
      </div>
    </section>
  );
}

function UrlField({ label, value, onChange, testId }) {
  return (
    <label className="block">
      <div className="mb-1 font-semibold uppercase tracking-widest text-[10px] text-muted-foreground">{label}</div>
      <input type="url" className="w-full rounded-lg border border-border bg-white px-2 py-1" value={value} onChange={(e) => onChange(e.target.value)} data-testid={testId} />
    </label>
  );
}
