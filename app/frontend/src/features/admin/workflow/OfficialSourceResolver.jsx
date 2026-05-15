import React, { useMemo, useState } from "react";

export default function OfficialSourceResolver({ open, sources = [], queueItem, busy, onClose, onSubmit }) {
  const verifiedSources = useMemo(
    () => (sources || []).filter((s) => s.is_verified && s.source_type !== "aggregator" && !s.discovery_only && s.is_active !== false),
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
    if (!sourceId) { setError("Pick a verified source."); return; }
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
    <section className="card" data-testid="official-source-resolver">
      <div className="card-head-col">
        <div className="lbl">Resolve official source</div>
        <h3 className="oc-title">Link a verified official source</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Aggregator candidates cannot be used as official proof. The backend will flip the promotion gate but will not auto-promote.
        </div>
      </div>
      <div className="card-body stack">
        {error ? <div className="err-row">{error}</div> : null}
        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Verified source</div>
          <select className="input" value={sourceId} onChange={(e) => setSourceId(e.target.value)} data-testid="resolver-source-select">
            <option value="">Select verified source…</option>
            {verifiedSources.map((s) => (
              <option key={s.id} value={s.id}>{s.org || s.source_name} · {s.source_type || s.kind || "official"}</option>
            ))}
          </select>
          {verifiedSources.length === 0 ? (
            <div className="warn-row" style={{ marginTop: 6 }}>
              No verified non-aggregator sources are available. Verify one from the Source Registry first.
            </div>
          ) : null}
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Official notification URL</div>
          <input className="input" type="url" value={notificationUrl} onChange={(e) => setNotificationUrl(e.target.value)} data-testid="resolver-notification-url" />
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Official apply URL</div>
          <input className="input" type="url" placeholder="https://..." value={applyUrl} onChange={(e) => setApplyUrl(e.target.value)} data-testid="resolver-apply-url" />
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Source PDF URL</div>
          <input className="input" type="url" placeholder="https://..." value={pdfUrl} onChange={(e) => setPdfUrl(e.target.value)} data-testid="resolver-pdf-url" />
        </div>
        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Notes</div>
          <textarea className="input" placeholder="Why this source resolves the official proof requirement" value={notes} onChange={(e) => setNotes(e.target.value)} />
        </div>
      </div>
      <div className="card-foot">
        <button type="button" className="btn small" onClick={onClose} disabled={busy}>Cancel</button>
        <button type="button" className="btn primary small" onClick={submit} disabled={busy || !sourceId} data-testid="resolver-submit">
          {busy ? "Resolving…" : "Mark official source resolved"}
        </button>
      </div>
    </section>
  );
}
