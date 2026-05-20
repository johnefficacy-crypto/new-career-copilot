import React, { useCallback, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { useToast } from "../../../shared/ui";

const RESOLVE_SUCCESS_TOAST =
  "Official proof attached. Next: verify remaining fields / promote to draft.";

// Mirror of backend ``source_drafts._OFFICIAL_URL_FIELDS`` so we can
// detect the same set of candidate hosts client-side.
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

function findSourceByHost(sources, host) {
  if (!host) return null;
  for (const s of sources || []) {
    if (hostOf(s?.official_url) === host) return s;
  }
  return null;
}

// Adds a draft (idempotent), verifies it, then links it to the queue
// item via /resolve-official-source. Returns { ok, source, message }.
async function addVerifyLink({ queueId, host, sourceUrl, existingSourceId }) {
  let sourceId = existingSourceId;
  let sourceRow = null;

  if (!sourceId) {
    // Use the queue-bound draft endpoint so notes record the queue_id.
    const draftRes = await api.post(`/api/admin/scrape/items/${queueId}/draft-sources`, {});
    const candidates = [...(draftRes?.created || []), ...(draftRes?.existing || [])];
    const match = candidates.find((c) => hostOf(c?.official_url) === host);
    if (!match) {
      return { ok: false, message: `Failed to create draft for ${host}.` };
    }
    sourceId = match.id;
    sourceRow = match;
  }

  // Verify the source. The backend runs URL probes + domain checks and
  // updates verification_status to "verified" / "failed" / "needs_review".
  const verifyRes = await api.post(`/api/admin/sources/${sourceId}/verify`, {});
  const errs = verifyRes?.errors || [];
  if (errs.length) {
    return {
      ok: false,
      source: sourceRow,
      message: `Verify failed for ${host}: ${errs.join("; ")}`,
    };
  }

  // Link. The endpoint rejects unverified picks at 409 — we just
  // verified, so this should succeed unless the verify came back with
  // only warnings (status="needs_review"). In that case the admin needs
  // to manually verify from the registry; surface the message.
  try {
    await api.post(`/api/admin/scrape/items/${queueId}/resolve-official-source`, {
      source_id: sourceId,
    });
  } catch (e) {
    return {
      ok: false,
      source: sourceRow,
      message: e?.message || `Link failed for ${host}.`,
    };
  }

  return { ok: true, source: sourceRow, message: `Linked ${host} as official source.` };
}

export default function OfficialSourceQuickResolver({
  queueItem,
  sources = [],
  busy,
  onChanged,
  onSourcesChanged,
}) {
  const extracted = useMemo(
    () => queueItem?.raw_extracted_item || queueItem?.extracted_data || {},
    [queueItem],
  );
  const detected = useMemo(() => detectCandidateHosts(extracted), [extracted]);

  const eligibleDraftSources = useMemo(
    () => (sources || []).filter(
      (s) => s.source_type !== "aggregator" && !s.discovery_only && s.is_active !== false && !s.is_verified,
    ),
    [sources],
  );

  const toast = useToast();
  const [working, setWorking] = useState(null); // host being processed
  const [info, setInfo] = useState(null);
  const [error, setError] = useState(null);
  const [showManual, setShowManual] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualType, setManualType] = useState("official_html");

  const refresh = useCallback(async () => {
    await onSourcesChanged?.();
    await onChanged?.();
  }, [onSourcesChanged, onChanged]);

  const addVerifyLinkHost = useCallback(async (host, sourceUrl, existingSourceId) => {
    if (!queueItem?.id || !host) return;
    setWorking(host);
    setError(null);
    setInfo(null);
    try {
      const res = await addVerifyLink({
        queueId: queueItem.id,
        host, sourceUrl, existingSourceId,
      });
      if (res.ok) {
        setInfo(res.message);
        toast.success(RESOLVE_SUCCESS_TOAST);
      } else {
        setError(res.message);
      }
      await refresh();
    } catch (e) {
      setError(e?.message || `Link failed for ${host}.`);
    } finally {
      setWorking(null);
    }
  }, [queueItem?.id, refresh, toast]);

  const submitManual = useCallback(async () => {
    setError(null); setInfo(null);
    if (!manualName.trim() || !manualUrl.trim()) {
      setError("Name and URL are required.");
      return;
    }
    let host = null;
    try {
      const u = new URL(manualUrl.trim());
      if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("scheme");
      host = (u.hostname || "").toLowerCase();
    } catch {
      setError("Official URL must be a valid http(s) link.");
      return;
    }
    setWorking(host);
    try {
      const createRes = await api.post(`/api/admin/sources`, {
        source_name: manualName.trim(),
        official_url: manualUrl.trim(),
        source_type: manualType,
        is_active: true,
        is_verified: false,
        verification_status: "needs_review",
      });
      const newId = createRes?.item?.id || createRes?.id;
      if (!newId) {
        setError("Source created but id missing from response.");
        return;
      }
      await onSourcesChanged?.();
      const res = await addVerifyLink({
        queueId: queueItem.id, host, sourceUrl: manualUrl.trim(),
        existingSourceId: newId,
      });
      if (res.ok) {
        setInfo(res.message);
        toast.success(RESOLVE_SUCCESS_TOAST);
      } else {
        setError(res.message);
      }
      setManualName(""); setManualUrl("");
      setShowManual(false);
      await refresh();
    } catch (e) {
      setError(e?.message || "Create + link failed.");
    } finally {
      setWorking(null);
    }
  }, [manualName, manualUrl, manualType, queueItem?.id, onSourcesChanged, refresh, toast]);

  if (!queueItem) return null;

  const hostStatus = (host) => {
    const existing = findSourceByHost(sources, host);
    if (!existing) return { kind: "missing", source: null };
    if (existing.is_verified) return { kind: "verified", source: existing };
    return { kind: "draft", source: existing };
  };

  return (
    <div
      style={{
        background: "var(--pending-bg)",
        border: "1px solid var(--pending)",
        borderRadius: 3,
        padding: "10px 12px",
      }}
      data-testid="official-source-quick-resolver"
    >
      <div className="lbl" style={{ color: "var(--pending)", marginBottom: 4 }}>
        Recruiting body missing from source registry
      </div>
      <div className="field-sub" style={{ color: "var(--pending)", marginBottom: 8 }}>
        Promotion is blocked until an official, verified source is linked. Pick a host below
        to create the registry entry, verify it, and link it in one click.
      </div>

      {error ? <div className="err-row" role="alert" style={{ marginBottom: 8 }}>{error}</div> : null}
      {info ? <div className="warn-row" data-testid="quick-resolver-info" style={{ marginBottom: 8 }}>{info}</div> : null}

      {detected.length > 0 ? (
        <div className="stack" style={{ gap: 6, marginBottom: 8 }}>
          {detected.map((c) => {
            const status = hostStatus(c.host);
            const isWorking = working === c.host;
            const label =
              status.kind === "verified"
                ? "Link as official source"
                : status.kind === "draft"
                  ? "Verify & link"
                  : "Add & link as official source";
            return (
              <div
                key={c.host}
                className="row"
                style={{
                  justifyContent: "space-between",
                  alignItems: "center",
                  background: "var(--paper)",
                  border: "1px solid var(--rule)",
                  borderRadius: 4,
                  padding: "6px 10px",
                }}
                data-testid={`quick-host-${c.host}`}
              >
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontFamily: "var(--fmono)", fontSize: 12, color: "var(--ink)" }}>
                    {c.host}
                  </div>
                  <div className="field-sub" style={{ marginTop: 2 }}>
                    {status.kind === "verified"
                      ? "in registry · verified"
                      : status.kind === "draft"
                        ? "in registry · draft (not yet verified)"
                        : "not in registry"}
                  </div>
                </div>
                <button
                  type="button"
                  className="btn primary small"
                  onClick={() => addVerifyLinkHost(c.host, c.url, status.source?.id)}
                  disabled={busy || Boolean(working)}
                  data-testid={`quick-action-${c.host}`}
                >
                  {isWorking ? "Working…" : label}
                </button>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="field-sub" style={{ marginBottom: 8 }}>
          The scraped extraction has no candidate official URLs. Add the recruiting body manually below.
        </div>
      )}

      {eligibleDraftSources.length > 0 ? (
        <div className="anno" style={{ marginBottom: 8 }}>
          Existing unverified drafts in the registry:{" "}
          {eligibleDraftSources.slice(0, 5).map((s, i) => (
            <span key={s.id}>
              <button
                type="button"
                className="btn ghost small"
                style={{ padding: "2px 6px", marginRight: 4 }}
                onClick={() => addVerifyLinkHost(hostOf(s.official_url) || s.source_name, s.official_url, s.id)}
                disabled={busy || Boolean(working)}
                data-testid={`quick-existing-${s.id}`}
                title="Verify and link this draft"
              >
                {s.source_name || hostOf(s.official_url)}
              </button>
            </span>
          ))}
        </div>
      ) : null}

      <button
        type="button"
        className="btn small"
        onClick={() => setShowManual((v) => !v)}
        data-testid="quick-toggle-manual"
      >
        {showManual ? "− Cancel manual add" : "+ Add manually"}
      </button>

      {showManual ? (
        <div
          style={{
            marginTop: 8,
            background: "var(--paper)",
            border: "1px solid var(--rule)",
            borderRadius: 4,
            padding: 10,
          }}
          data-testid="quick-manual-form"
        >
          <div className="stack" style={{ gap: 6 }}>
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Recruiting body name</div>
              <input
                className="input"
                value={manualName}
                onChange={(e) => setManualName(e.target.value)}
                placeholder="Union Public Service Commission"
                data-testid="quick-manual-name"
              />
            </div>
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Official website URL</div>
              <input
                className="input"
                type="url"
                value={manualUrl}
                onChange={(e) => setManualUrl(e.target.value)}
                placeholder="https://upsc.gov.in/"
                data-testid="quick-manual-url"
              />
            </div>
            <div>
              <div className="lbl" style={{ marginBottom: 4 }}>Source type</div>
              <select
                className="input"
                value={manualType}
                onChange={(e) => setManualType(e.target.value)}
                data-testid="quick-manual-type"
              >
                <option value="official_html">official_html</option>
                <option value="official_pdf">official_pdf</option>
                <option value="rss">rss</option>
                <option value="api">api</option>
                <option value="sitemap">sitemap</option>
              </select>
            </div>
            <div className="row" style={{ justifyContent: "flex-end", gap: 6 }}>
              <button
                type="button"
                className="btn small"
                onClick={() => { setShowManual(false); setManualName(""); setManualUrl(""); }}
                disabled={Boolean(working)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn primary small"
                onClick={submitManual}
                disabled={busy || Boolean(working) || !manualName.trim() || !manualUrl.trim()}
                data-testid="quick-manual-submit"
              >
                {working ? "Working…" : "Add, verify & link"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
