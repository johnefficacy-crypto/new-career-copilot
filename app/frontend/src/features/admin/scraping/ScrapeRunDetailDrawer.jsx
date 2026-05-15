import React, { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw, X } from "lucide-react";
import { api } from "../../../lib/api";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

const REFRESH_INTERVAL_MS = 4000;
const TERMINAL_STATES = new Set(["completed", "failed", "partial"]);

function statusBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "completed") return { cls: "badge resolved", text: "complete" };
  if (s === "failed") return { cls: "badge blocker", text: "failed" };
  if (s === "partial") return { cls: "badge pending", text: "partial" };
  if (s === "running") return { cls: "badge info", text: "running" };
  return { cls: "badge neutral", text: s || "unknown" };
}

function fmtTime(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("en-IN", { hour12: false });
}

export default function ScrapeRunDetailDrawer({ runId, open, onClose, triggeredBy }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: open, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });

  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!runId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/api/admin/scrape/runs/${runId}`);
      setData(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [runId]);

  useEffect(() => {
    if (!open || !runId) return;
    load();
    const status = (data?.status || "").toLowerCase();
    if (status && TERMINAL_STATES.has(status)) return;
    const handle = setInterval(load, REFRESH_INTERVAL_MS);
    return () => clearInterval(handle);
  }, [open, runId, load, data?.status]);

  if (!open) return null;

  const status = (data?.status || "").toLowerCase();
  const inFlight = status && !TERMINAL_STATES.has(status);
  const badge = statusBadge(data?.status);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(26, 24, 21, 0.35)" }} data-testid="scrape-run-detail-drawer">
      <div className="absolute inset-0" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="scrape-run-detail-title"
        className="oc"
        style={{ position: "relative", height: "100%", width: "min(100%, 720px)", overflow: "auto", borderLeft: "1px solid var(--rule)" }}
      >
        <div style={{ padding: "16px 20px" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start", marginBottom: 12 }}>
            <div>
              <div className="lbl">Scrape run detail</div>
              <h2 id="scrape-run-detail-title" className="oc-title disp" style={{ fontSize: 22, marginTop: 4 }}>
                Run · {runId ? String(runId).slice(0, 8) : ""}
              </h2>
            </div>
            <button ref={closeRef} className="btn small" onClick={onClose} aria-label="Close run detail"><X className="h-4 w-4" /></button>
          </div>

          <div className="card">
            <div className="card-head-col">
              <div className="row" style={{ gap: 5 }}>
                <span className={badge.cls}>{badge.text}</span>
                {(triggeredBy || data?.triggered_by) ? (
                  <span className="row-sub">triggered by · {triggeredBy || data?.triggered_by}</span>
                ) : null}
              </div>
              <h3 className="oc-title" style={{ fontSize: 17 }}>
                Run · {runId ? String(runId).slice(0, 8) : ""}{data?.source_name ? ` · ${data.source_name}` : ""}
              </h3>
              <div className="row-sub">
                {data?.started_at ? `started ${fmtTime(data.started_at)}` : ""}
                {data?.finished_at ? ` · finished ${fmtTime(data.finished_at)}` : ""}
                {inFlight ? ` · auto-refresh ${REFRESH_INTERVAL_MS / 1000}s` : ""}
              </div>
            </div>
            <div className="card-body stack">
              {inFlight ? (
                <div className="warn-row" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Run still in progress. Refreshes every {REFRESH_INTERVAL_MS / 1000}s.
                </div>
              ) : null}
              {error ? <div className="err-row">Failed to load run detail · {error.message}</div> : null}
              {data ? (
                <>
                  <div className="grid4">
                    <div className="field big">
                      <div className="field-lbl">sources checked</div>
                      <div className="field-val">{data.sources_checked ?? 0}</div>
                    </div>
                    <div className="field big">
                      <div className="field-lbl">items found</div>
                      <div className="field-val">{data.items_found ?? 0}</div>
                    </div>
                    <div className="field big good">
                      <div className="field-lbl">items new</div>
                      <div className="field-val">{data.items_new ?? 0}</div>
                    </div>
                    <div className="field big warn">
                      <div className="field-lbl">duplicate</div>
                      <div className="field-val">{data.items_duplicate ?? 0}</div>
                    </div>
                  </div>

                  <div>
                    <div className="lbl" style={{ marginBottom: 6 }}>Per-source breakdown</div>
                    <div className="card">
                      {(data.per_source || []).length === 0 ? (
                        <div className="empty">No queue rows linked to this run yet.</div>
                      ) : (
                        <table className="t">
                          <thead>
                            <tr>
                              <th style={{ width: "32%" }}>Source</th>
                              <th className="num">Pending</th>
                              <th className="num">Dup</th>
                              <th className="num">Promoted</th>
                              <th className="num">Rejected</th>
                              <th className="num">Quality</th>
                            </tr>
                          </thead>
                          <tbody>
                            {data.per_source.map((row) => (
                              <tr key={row.source_id || row.source_name}>
                                <td>
                                  <div className="row-ttl">{row.source_name || "Unknown"}</div>
                                  <div className="row-sub">{row.adapter_type || row.source_type || "—"}</div>
                                </td>
                                <td className="num">{row.items_pending ?? 0}</td>
                                <td className="num">{row.items_duplicate ?? 0}</td>
                                <td className="num">{row.items_promoted ?? 0}</td>
                                <td className="num">{row.items_rejected ?? 0}</td>
                                <td className="num">{row.quality_min != null ? `${row.quality_min} – ${row.quality_max}` : "—"}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      )}
                    </div>
                  </div>

                  {(data.error_log || []).length ? (
                    <div>
                      <div className="lbl" style={{ marginBottom: 6 }}>Errors · {data.error_log.length}</div>
                      <div className="stack">
                        {data.error_log.map((err, i) => (
                          <div key={i} className="err-row">
                            {err.source || "unknown source"} · {err.error || "error"}
                            {err.at ? ` · ${fmtTime(err.at)}` : ""}
                          </div>
                        ))}
                      </div>
                    </div>
                  ) : (
                    <div className="anno">No errors recorded for this run.</div>
                  )}
                </>
              ) : null}
            </div>
            <div className="card-foot">
              <button type="button" className="btn ghost small" onClick={load} disabled={loading}>
                {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
              </button>
              <button type="button" className="btn small" disabled>Export trace</button>
              {(data?.error_log || []).length ? <button type="button" className="btn small">Re-run failed sources</button> : null}
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}
