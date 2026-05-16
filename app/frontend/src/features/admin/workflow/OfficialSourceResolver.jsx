import React, { useMemo, useState } from "react";
import { api } from "../../../lib/api";

// Mirrors backend ``source_drafts._OFFICIAL_URL_FIELDS`` — only the
// shape-relevant subset, since the admin payload exposes the data
// shape from ``scrape_queue.extracted_data`` directly.
const OFFICIAL_URL_FIELDS = [
  "official_notification_url",
  "official_apply_url",
  "source_pdf_url",
  "notification_url",
];

const AGGREGATOR_HINTS = ["sarkari", "freejob", "jobalert"];

function hostOf(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return (u.hostname || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function looksAggregator(host) {
  if (!host) return false;
  return AGGREGATOR_HINTS.some((h) => host.includes(h));
}

function detectCandidateHosts(extracted) {
  if (!extracted || typeof extracted !== "object") return [];
  const seen = new Set();
  const out = [];
  for (const f of OFFICIAL_URL_FIELDS) {
    const url = extracted[f];
    const host = hostOf(url);
    if (!host || seen.has(host) || looksAggregator(host)) continue;
    seen.add(host);
    out.push({ host, url });
  }
  return out;
}

function hostsInRegistry(sources) {
  const out = new Set();
  for (const s of sources || []) {
    const h = hostOf(s?.official_url);
    if (h) out.add(h);
  }
  return out;
}

function statusLabel(source) {
  if (source?.is_verified) return null;
  if (source?.verification_status === "failed") return "failed";
  return "draft";
}

export default function OfficialSourceResolver({
  open,
  sources = [],
  queueItem,
  busy,
  onClose,
  onSubmit,
  onSourcesChanged,
}) {
  // Eligible-for-canonical: non-aggregator, not discovery-only, active.
  // We now include drafts (is_verified=false) so admins can verify in
  // place. The submit handler refuses unverified picks via the backend
  // gate, so showing them here only adds discoverability.
  const eligibleSources = useMemo(
    () => (sources || []).filter(
      (s) => s.source_type !== "aggregator" && !s.discovery_only && s.is_active !== false,
    ),
    [sources],
  );
  const verifiedSources = useMemo(
    () => eligibleSources.filter((s) => s.is_verified),
    [eligibleSources],
  );
  const extracted = useMemo(
    () => queueItem?.raw_extracted_item || queueItem?.extracted_data || {},
    [queueItem],
  );
  const detectedHosts = useMemo(() => detectCandidateHosts(extracted), [extracted]);
  const registeredHosts = useMemo(() => hostsInRegistry(sources), [sources]);
  const unknownHosts = useMemo(
    () => detectedHosts.filter((c) => !registeredHosts.has(c.host)),
    [detectedHosts, registeredHosts],
  );

  const [sourceId, setSourceId] = useState("");
  const [notificationUrl, setNotificationUrl] = useState(extracted.official_notification_url || "");
  const [applyUrl, setApplyUrl] = useState(extracted.official_apply_url || "");
  const [pdfUrl, setPdfUrl] = useState(extracted.source_pdf_url || "");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState(null);
  const [info, setInfo] = useState(null);
  const [creating, setCreating] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualType, setManualType] = useState("official_html");

  if (!open) return null;

  const selectedSource = sources.find((s) => s.id === sourceId) || null;
  const selectedIsUnverified = !!selectedSource && !selectedSource.is_verified;

  const submit = async () => {
    setError(null);
    setInfo(null);
    if (!sourceId) { setError("Pick a source."); return; }
    if (selectedIsUnverified) {
      setError("Source is a draft. Verify it before marking as official proof.");
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

  const draftAllUnknown = async () => {
    if (!queueItem?.id) { setError("No queue item selected."); return; }
    setError(null); setInfo(null); setCreating(true);
    try {
      const res = await api.post(`/api/admin/scrape/items/${queueItem.id}/draft-sources`, {});
      const created = res?.created || [];
      const existing = res?.existing || [];
      setInfo(`Drafts: ${created.length} created · ${existing.length} already registered.`);
      await onSourcesChanged?.();
      if (created.length === 1) setSourceId(created[0].id);
    } catch (e) {
      setError(e?.message || "Draft creation failed.");
    } finally {
      setCreating(false);
    }
  };

  const verifySelected = async () => {
    if (!sourceId) return;
    setError(null); setInfo(null); setVerifying(true);
    try {
      const res = await api.post(`/api/admin/sources/${sourceId}/verify`, {});
      const errs = res?.errors || [];
      const warns = res?.warnings || [];
      if (errs.length) {
        setError(`Verify failed: ${errs.join("; ")}`);
      } else if (warns.length) {
        setInfo(`Verify completed with warnings: ${warns.join("; ")}. Status set to needs_review.`);
      } else {
        setInfo("Source verified.");
      }
      await onSourcesChanged?.();
    } catch (e) {
      setError(e?.message || "Verify failed.");
    } finally {
      setVerifying(false);
    }
  };

  const submitManualAdd = async () => {
    setError(null); setInfo(null);
    if (!manualName.trim()) { setError("Source name required."); return; }
    if (!manualUrl.trim()) { setError("Official URL required."); return; }
    try {
      new URL(manualUrl.trim());
    } catch {
      setError("Official URL must be a valid http(s) link.");
      return;
    }
    setCreating(true);
    try {
      const res = await api.post(`/api/admin/sources`, {
        source_name: manualName.trim(),
        official_url: manualUrl.trim(),
        source_type: manualType,
        is_active: true,
        is_verified: false,
        verification_status: "needs_review",
      });
      const row = res?.item || res;
      setInfo(`Source created as draft. Verify it below.`);
      setManualName(""); setManualUrl("");
      setShowManualAdd(false);
      await onSourcesChanged?.();
      if (row?.id) setSourceId(row.id);
    } catch (e) {
      setError(e?.message || "Create source failed.");
    } finally {
      setCreating(false);
    }
  };

  const busyAny = busy || creating || verifying;

  return (
    <section className="card" data-testid="official-source-resolver">
      <div className="card-head-col">
        <div className="lbl">Resolve official source</div>
        <h3 className="oc-title">Link a verified official source</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          The "official source" is the government recruitment body's own publishing channel —
          e.g. <code>upsc.gov.in</code> for UPSC, <code>ibps.in</code> for IBPS — represented as a
          verified, non-aggregator row in <code>source_registry</code>.
          Aggregators (e.g. <code>sarkariresult.com</code>) only discover recruitments; their values cannot become canonical.
        </div>
      </div>
      <div className="card-body stack">
        {error ? <div className="err-row" role="alert">{error}</div> : null}
        {info ? <div className="warn-row" data-testid="resolver-info">{info}</div> : null}

        {unknownHosts.length > 0 ? (
          <div className="card" style={{ background: "var(--pending-bg)", padding: 10 }} data-testid="resolver-detected-hosts">
            <div className="lbl" style={{ marginBottom: 6 }}>
              Detected official hosts not in the registry
            </div>
            <div className="anno" style={{ marginBottom: 8 }}>
              These hosts came from the scraped extraction but aren't registered yet.
              Create them as drafts here; the scraper also creates these drafts automatically on new scrapes.
            </div>
            <div className="row" style={{ gap: 6, flexWrap: "wrap", marginBottom: 8 }}>
              {unknownHosts.map((c) => (
                <span key={c.host} className="badge pending" title={c.url}>{c.host}</span>
              ))}
            </div>
            <button
              type="button"
              className="btn small"
              onClick={draftAllUnknown}
              disabled={busyAny}
              data-testid="resolver-draft-all"
            >
              {creating ? "Creating drafts…" : `Create ${unknownHosts.length} draft source${unknownHosts.length === 1 ? "" : "s"}`}
            </button>
          </div>
        ) : null}

        <div>
          <div className="lbl" style={{ marginBottom: 5 }}>Source</div>
          <select
            className="input"
            value={sourceId}
            onChange={(e) => setSourceId(e.target.value)}
            data-testid="resolver-source-select"
          >
            <option value="">Select source…</option>
            {eligibleSources.length === 0 ? (
              <option value="" disabled>No non-aggregator sources available</option>
            ) : null}
            {eligibleSources.map((s) => {
              const status = statusLabel(s);
              return (
                <option key={s.id} value={s.id}>
                  {s.source_name || s.org} · {s.source_type || "official"}{status ? ` · ${status}` : ""}
                </option>
              );
            })}
          </select>
          {verifiedSources.length === 0 && eligibleSources.length > 0 ? (
            <div className="warn-row" style={{ marginTop: 6 }}>
              All listed sources are drafts. Verify one before submitting.
            </div>
          ) : null}
        </div>

        {selectedIsUnverified ? (
          <div className="warn-row" data-testid="resolver-unverified-warn" style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ flex: 1 }}>
              Selected source is a draft (<code>{selectedSource?.verification_status || "needs_review"}</code>).
              Verify before submit.
            </span>
            <button
              type="button"
              className="btn small"
              onClick={verifySelected}
              disabled={busyAny}
              data-testid="resolver-verify-selected"
            >
              {verifying ? "Verifying…" : "Verify now"}
            </button>
          </div>
        ) : null}

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

        <div>
          <button
            type="button"
            className="btn ghost small"
            onClick={() => setShowManualAdd((v) => !v)}
            data-testid="resolver-toggle-manual-add"
          >
            {showManualAdd ? "− Hide manual add" : "+ Add a new source manually"}
          </button>
        </div>

        {showManualAdd ? (
          <div className="card" style={{ padding: 10, background: "var(--paper-sunk)" }} data-testid="resolver-manual-add">
            <div className="lbl" style={{ marginBottom: 6 }}>Manual source draft</div>
            <div className="anno" style={{ marginBottom: 8 }}>
              Creates a row in <code>source_registry</code> as a draft. Verify it (button appears above) before submitting as official proof.
            </div>
            <div className="stack">
              <div>
                <div className="lbl" style={{ marginBottom: 4 }}>Source name</div>
                <input
                  className="input"
                  value={manualName}
                  onChange={(e) => setManualName(e.target.value)}
                  placeholder="Union Public Service Commission"
                  data-testid="resolver-manual-name"
                />
              </div>
              <div>
                <div className="lbl" style={{ marginBottom: 4 }}>Official URL</div>
                <input
                  className="input"
                  type="url"
                  value={manualUrl}
                  onChange={(e) => setManualUrl(e.target.value)}
                  placeholder="https://upsc.gov.in/"
                  data-testid="resolver-manual-url"
                />
              </div>
              <div>
                <div className="lbl" style={{ marginBottom: 4 }}>Source type</div>
                <select
                  className="input"
                  value={manualType}
                  onChange={(e) => setManualType(e.target.value)}
                  data-testid="resolver-manual-type"
                >
                  <option value="official_html">official_html</option>
                  <option value="official_pdf">official_pdf</option>
                  <option value="rss">rss</option>
                  <option value="api">api</option>
                  <option value="sitemap">sitemap</option>
                </select>
              </div>
              <div className="row" style={{ justifyContent: "flex-end" }}>
                <button
                  type="button"
                  className="btn small"
                  onClick={() => { setShowManualAdd(false); setManualName(""); setManualUrl(""); }}
                  disabled={busyAny}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={submitManualAdd}
                  disabled={busyAny || !manualName.trim() || !manualUrl.trim()}
                  data-testid="resolver-manual-submit"
                >
                  {creating ? "Creating…" : "Create draft source"}
                </button>
              </div>
            </div>
          </div>
        ) : null}
      </div>
      <div className="card-foot">
        <button type="button" className="btn small" onClick={onClose} disabled={busyAny}>Cancel</button>
        <button
          type="button"
          className="btn primary small"
          onClick={submit}
          disabled={busyAny || !sourceId || selectedIsUnverified}
          data-testid="resolver-submit"
        >
          {busy ? "Resolving…" : "Mark official source resolved"}
        </button>
      </div>
    </section>
  );
}
