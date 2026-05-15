import React, { useCallback, useEffect, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, RefreshCw, X } from "lucide-react";
import { api } from "../../../lib/api";
import { useFocusTrap } from "../../../shared/a11y/useFocusTrap";

// Opens from the "Recent runs" list on the Scraper page. Polls GET
// /api/admin/scrape/runs/{run_id} so an in-flight run is observable
// without forcing the admin to refresh the whole page. Per-source rows
// are derived from scrape_queue at the backend and include errors taken
// from scrape_runs.error_log keyed by source name.

const REFRESH_INTERVAL_MS = 4000;
const TERMINAL_STATES = new Set(["completed", "failed", "partial"]);

function StatusPill({ status }) {
  const lower = (status || "").toLowerCase();
  const tone = lower === "completed" ? "sage" : lower === "failed" ? "destructive" : lower === "partial" ? "amber" : "muted";
  const klass = {
    sage: "border-sage-300 bg-sage-50 text-sage-900",
    destructive: "border-destructive/30 bg-white/70 text-destructive",
    amber: "border-amber-300 bg-amber-50 text-amber-900",
    muted: "border-border bg-white/70 text-muted-foreground",
  }[tone];
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${klass}`}>{lower || "unknown"}</span>;
}

function PerSourceRow({ row }) {
  const errors = row.errors || [];
  return (
    <tr className="border-t border-border align-top">
      <td className="px-2 py-1.5">
        <div className="font-semibold">{row.source_name || "Unknown"}</div>
        {errors.length ? (
          <div className="mt-1 space-y-1">
            {errors.map((err, i) => (
              <div key={i} className="rounded border border-destructive/30 bg-white/70 p-1.5 text-[11px] text-destructive">
                <AlertTriangle className="mr-1 inline h-3 w-3" />
                {err.error || "error"}
              </div>
            ))}
          </div>
        ) : null}
      </td>
      <td className="px-2 py-1.5 font-mono">{row.items_total}</td>
      <td className="px-2 py-1.5 font-mono">{row.items_pending}</td>
      <td className="px-2 py-1.5 font-mono">{row.items_duplicate}</td>
      <td className="px-2 py-1.5 font-mono">{row.items_promoted}</td>
      <td className="px-2 py-1.5 font-mono">{row.items_rejected}</td>
      <td className="px-2 py-1.5 font-mono">{row.items_official_unresolved}</td>
      <td className="px-2 py-1.5 font-mono">{row.quality_min != null ? `${row.quality_min} – ${row.quality_max}` : "—"}</td>
    </tr>
  );
}

export default function ScrapeRunDetailDrawer({ runId, open, onClose }) {
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

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30" data-testid="scrape-run-detail-drawer">
      <div className="absolute inset-0" onClick={onClose} />
      <aside ref={panelRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby="scrape-run-detail-title" className="relative h-full w-full max-w-3xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Scrape run detail</div>
            <h2 id="scrape-run-detail-title" className="font-heading text-2xl">Run {runId ? String(runId).slice(0, 8) : ""}</h2>
            <p className="mt-1 text-xs text-muted-foreground">Per-source counts, errors, and quality range for this scrape pass.</p>
          </div>
          <button ref={closeRef} className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close run detail"><X className="h-4 w-4" /></button>
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2 text-xs">
          {data ? <StatusPill status={data.status} /> : null}
          {data?.triggered_by ? <span className="rounded-full border border-border bg-white/70 px-2 py-0.5">trigger: {data.triggered_by}</span> : null}
          {data?.started_at ? <span className="text-muted-foreground">started {new Date(data.started_at).toLocaleString("en-IN")}</span> : null}
          {data?.finished_at ? <span className="text-muted-foreground">· finished {new Date(data.finished_at).toLocaleString("en-IN")}</span> : null}
          <button type="button" className="ml-auto btn btn-ghost h-8 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
        </div>

        {inFlight ? (
          <div className="mt-3 flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
            <Loader2 className="h-3.5 w-3.5 animate-spin" />
            Run is still in progress. This view refreshes every {REFRESH_INTERVAL_MS / 1000}s.
          </div>
        ) : null}

        {error ? (
          <div className="mt-3 rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">
            Failed to load run detail: {error.message}
          </div>
        ) : null}

        {data ? (
          <>
            <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
              <Metric label="Sources checked" value={data.sources_checked} />
              <Metric label="Items found" value={data.items_found} />
              <Metric label="Items new" value={data.items_new} />
              <Metric label="Items duplicate" value={data.items_duplicate} tone={data.items_duplicate ? "warn" : undefined} />
            </div>

            <section className="mt-5 soft-card rounded-2xl p-4">
              <h3 className="font-semibold">Per-source breakdown</h3>
              {(data.per_source || []).length === 0 ? (
                <p className="mt-2 text-xs text-muted-foreground">No queue rows linked to this run yet.</p>
              ) : (
                <div className="mt-3 overflow-auto rounded-xl border border-border bg-white/70">
                  <table className="w-full min-w-[680px] text-xs">
                    <thead className="bg-[#FBF6EF] text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                      <tr>
                        <th className="px-2 py-1.5">Source</th>
                        <th className="px-2 py-1.5">Total</th>
                        <th className="px-2 py-1.5">Pending</th>
                        <th className="px-2 py-1.5">Dup</th>
                        <th className="px-2 py-1.5">Promoted</th>
                        <th className="px-2 py-1.5">Rejected</th>
                        <th className="px-2 py-1.5">Official unresolved</th>
                        <th className="px-2 py-1.5">Quality range</th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.per_source.map((row) => (
                        <PerSourceRow key={row.source_id || row.source_name} row={row} />
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </section>

            {(data.error_log || []).length ? (
              <section className="mt-5 soft-card rounded-2xl p-4">
                <h3 className="font-semibold flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-destructive" /> Run error log</h3>
                <ul className="mt-2 space-y-1 text-xs">
                  {data.error_log.map((err, i) => (
                    <li key={i} className="rounded-lg border border-destructive/30 bg-white/70 p-2">
                      <div className="font-semibold">{err.source || "unknown source"}</div>
                      <div className="text-destructive">{err.error || "error"}</div>
                      {err.at ? <div className="text-[10px] text-muted-foreground">{new Date(err.at).toLocaleString("en-IN")}</div> : null}
                    </li>
                  ))}
                </ul>
              </section>
            ) : (
              <div className="mt-3 flex items-center gap-2 text-xs text-muted-foreground">
                <CheckCircle2 className="h-3.5 w-3.5 text-sage-700" /> No errors recorded for this run.
              </div>
            )}
          </>
        ) : null}
      </aside>
    </div>
  );
}

function Metric({ label, value, tone }) {
  const toneClass = tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="soft-card rounded-xl p-3">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-heading text-2xl ${toneClass}`}>{value ?? 0}</div>
    </div>
  );
}
