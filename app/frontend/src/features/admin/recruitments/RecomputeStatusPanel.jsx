import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, Loader2, PlayCircle, RefreshCw, RotateCcw } from "lucide-react";
import { api } from "../../../lib/api";

// Shows the eligibility_recompute_queue health for a single recruitment.
// Failed rows expose a Retry button that calls
// POST /api/admin/eligibility-recompute-queue/{id}/retry. Manual fan-out
// is exposed via "Recompute now" which hits the new
// POST /api/admin/recruitments/{id}/recompute-eligibility.

function StatusPill({ status }) {
  const lower = (status || "").toLowerCase();
  const klass = {
    failed: "border-destructive/30 bg-white/70 text-destructive",
    processing: "border-amber-300 bg-amber-50 text-amber-900",
    queued: "border-border bg-white/70 text-muted-foreground",
    pending: "border-border bg-white/70 text-muted-foreground",
    processed: "border-sage-300 bg-sage-50 text-sage-900",
    stalled: "border-amber-300 bg-amber-50 text-amber-900",
  }[lower] || "border-border bg-white/70 text-muted-foreground";
  return <span className={`rounded-full border px-2 py-0.5 text-[11px] ${klass}`}>{lower || "unknown"}</span>;
}

function CountChip({ label, value, tone }) {
  const toneClass = tone === "bad" ? "text-destructive" : tone === "warn" ? "text-amber-700" : "";
  return (
    <div className="rounded-lg border border-border bg-white/70 px-2 py-1 text-xs">
      <span className="uppercase tracking-widest text-[10px] text-muted-foreground">{label}</span>{" "}
      <span className={`font-semibold ${toneClass}`}>{value ?? 0}</span>
    </div>
  );
}

export default function RecomputeStatusPanel({ recruitmentId, recruitmentName, open = true }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [fanoutBusy, setFanoutBusy] = useState(false);
  const [retryBusyId, setRetryBusyId] = useState(null);
  const [statusFilter, setStatusFilter] = useState("failed");

  const load = useCallback(async () => {
    if (!recruitmentId) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams();
      params.set("recruitment_id", recruitmentId);
      if (statusFilter && statusFilter !== "all") params.set("status", statusFilter);
      params.set("limit", "25");
      const r = await api.get(`/api/admin/eligibility-recompute-queue?${params.toString()}`);
      setData(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [recruitmentId, statusFilter]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const retry = async (rowId) => {
    setRetryBusyId(rowId);
    try {
      await api.post(`/api/admin/eligibility-recompute-queue/${rowId}/retry`, {});
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setRetryBusyId(null);
    }
  };

  const fanout = async () => {
    if (!recruitmentId) return;
    // Conservative cap. The backend enforces this server-side too, but
    // we mirror it client-side so the admin sees the limit immediately.
    if (!window.confirm(`Recompute eligibility for every onboarded user against "${recruitmentName || recruitmentId}"?\n\nThis enqueues one row per onboarded profile (capped at 10,000). The worker drains asynchronously.`)) return;
    setFanoutBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/recruitments/${recruitmentId}/recompute-eligibility`, { reason: "admin_drawer_manual" });
      await load();
    } catch (e) {
      setError(e);
    } finally {
      setFanoutBusy(false);
    }
  };

  if (!open) return null;
  const counts = data?.counts || {};
  const failedCount = counts.failed ?? 0;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="recompute-status-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Eligibility recompute</div>
          <h3 className="font-heading text-lg">Recompute queue for this recruitment</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Failed rows can be retried individually. Manual fan-out enqueues a fresh recompute for every onboarded user.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" className="btn btn-ghost h-8 text-xs" onClick={load} disabled={loading}>
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
          </button>
          <button type="button" className="btn btn-primary h-8 text-xs" onClick={fanout} disabled={fanoutBusy}>
            {fanoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Recompute now
          </button>
        </div>
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <CountChip label="Pending" value={counts.pending} />
        <CountChip label="Queued" value={counts.queued} />
        <CountChip label="Processing" value={counts.processing} tone={(counts.processing ?? 0) > 0 ? "warn" : undefined} />
        <CountChip label="Failed" value={failedCount} tone={failedCount > 0 ? "bad" : undefined} />
        <CountChip label="Processed" value={counts.processed} />
        <label className="ml-auto text-xs">
          <span className="mr-1 uppercase tracking-widest text-[10px] text-muted-foreground">View</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="rounded-lg border border-border bg-white/80 px-2 py-1 text-xs">
            <option value="failed">Failed only</option>
            <option value="processing">Processing</option>
            <option value="queued">Queued</option>
            <option value="pending">Pending</option>
            <option value="processed">Processed</option>
            <option value="all">All</option>
          </select>
        </label>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">
          {error.message}
        </div>
      ) : null}

      <div className="mt-3 space-y-2">
        {(data?.items || []).length === 0 && !loading ? (
          <div className="rounded-xl border border-border bg-white/70 p-2 text-xs text-muted-foreground">
            {statusFilter === "failed" ? (
              <span className="inline-flex items-center gap-1"><CheckCircle2 className="h-3.5 w-3.5 text-sage-700" /> No failed recomputes for this recruitment.</span>
            ) : (
              "No rows match this view."
            )}
          </div>
        ) : null}
        {(data?.items || []).map((row) => (
          <div key={row.id} className="rounded-xl border border-border bg-white/70 p-2 text-xs">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <StatusPill status={row.status} />
                  <span className="font-mono text-[11px]">{String(row.id || "").slice(0, 8)}</span>
                  <span className="text-muted-foreground">user {String(row.user_id || "").slice(0, 8)}</span>
                  {row.attempt_count ? <span className="text-amber-700">attempts: {row.attempt_count}</span> : null}
                </div>
                {row.last_error || row.error_message ? (
                  <div className="mt-1 break-words text-destructive">{row.last_error || row.error_message}</div>
                ) : null}
                <div className="mt-0.5 text-[10px] text-muted-foreground">
                  queued {row.queued_at ? new Date(row.queued_at).toLocaleString("en-IN") : "?"}
                  {row.processed_at ? ` · processed ${new Date(row.processed_at).toLocaleString("en-IN")}` : ""}
                  {row.reason ? ` · ${row.reason}` : ""}
                </div>
              </div>
              {(row.status || "").toLowerCase() === "failed" || (row.status || "").toLowerCase() === "stalled" ? (
                <button
                  type="button"
                  className="btn btn-ghost h-7 text-[11px]"
                  onClick={() => retry(row.id)}
                  disabled={retryBusyId === row.id}
                  data-testid={`retry-${row.id}`}
                >
                  {retryBusyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Retry
                </button>
              ) : null}
            </div>
          </div>
        ))}
      </div>

      {failedCount > 5 ? (
        <div className="mt-3 flex items-start gap-2 rounded-xl border border-amber-300 bg-amber-50 p-2 text-xs text-amber-900">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <div>Many failed recomputes ({failedCount}). Inspect the worker logs before retrying individually.</div>
        </div>
      ) : null}
    </section>
  );
}
