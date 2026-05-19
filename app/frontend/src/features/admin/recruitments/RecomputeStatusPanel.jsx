import React, { useCallback, useEffect, useState } from "react";
import { Loader2, PlayCircle, RefreshCw, RotateCcw } from "lucide-react";
import { api } from "../../../lib/api";

function statusBadge(status) {
  const s = (status || "").toLowerCase();
  if (s === "failed") return { cls: "badge blocker", text: "failed" };
  if (s === "processing") return { cls: "badge pending", text: "processing" };
  if (s === "processed") return { cls: "badge resolved", text: "processed" };
  if (s === "stalled") return { cls: "badge pending", text: "stalled" };
  return { cls: "badge neutral", text: s || "pending" };
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
    } catch (e) { setError(e); } finally { setRetryBusyId(null); }
  };

  const fanout = async () => {
    if (!recruitmentId) return;
    if (!window.confirm(`Recompute eligibility for every onboarded user against "${recruitmentName || recruitmentId}"?\n\nThis enqueues one row per onboarded profile (capped at 10,000). The worker drains asynchronously.`)) return;
    setFanoutBusy(true);
    setError(null);
    try {
      await api.post(`/api/admin/recruitments/${recruitmentId}/recompute-eligibility`, { reason: "admin_drawer_manual" });
      await load();
    } catch (e) { setError(e); } finally { setFanoutBusy(false); }
  };

  if (!open) return null;
  const counts = data?.counts || {};
  const failedCount = counts.failed ?? 0;

  return (
    <section className="card" data-testid="recompute-status-panel">
      <div className="card-head-col">
        <div className="lbl">Eligibility recompute</div>
        <h3 className="oc-title">Queue · {recruitmentName || recruitmentId}</h3>
        <div className="anno" style={{ marginTop: 2 }}>
          Failed rows can be retried individually. Manual fan-out enqueues a fresh recompute for every onboarded user.
        </div>
      </div>
      <div className="card-body stack">
        <div className="row">
          <span className="impact-pill"><span className="lbl">pending</span><strong>{counts.pending ?? 0}</strong></span>
          <span className="impact-pill"><span className="lbl">queued</span><strong>{counts.queued ?? 0}</strong></span>
          <span className="impact-pill warn"><span className="lbl">processing</span><strong>{counts.processing ?? 0}</strong></span>
          <span className="impact-pill bad"><span className="lbl">failed</span><strong>{failedCount}</strong></span>
          <span className="impact-pill ok"><span className="lbl">processed</span><strong>{counts.processed ?? 0}</strong></span>
          <span style={{ marginLeft: "auto", fontSize: 11 }}>
            <span className="lbl">view</span>{" "}
            <select className="input" style={{ display: "inline-block", width: "auto", padding: "3px 6px", fontSize: 11 }} value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
              <option value="failed">Failed only</option>
              <option value="processing">Processing</option>
              <option value="queued">Queued</option>
              <option value="pending">Pending</option>
              <option value="processed">Processed</option>
              <option value="all">All</option>
            </select>
          </span>
        </div>

        {error ? <div className="err-row">{error.message}</div> : null}

        {(data?.items || []).length === 0 && !loading ? (
          <div className="anno">{statusFilter === "failed" ? "No failed recomputes for this recruitment." : "No rows match this view."}</div>
        ) : null}

        {(data?.items || []).length ? (
          <div className="card">
            {(data?.items || []).map((row) => {
              const badge = statusBadge(row.status);
              const canRetry = ["failed", "stalled"].includes((row.status || "").toLowerCase());
              return (
                <div key={row.id} style={{ padding: "10px 12px", borderBottom: "1px solid var(--rule-soft)" }}>
                  <div className="row" style={{ justifyContent: "space-between" }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row">
                        <span className={badge.cls}>{badge.text}</span>
                        <span className="mono" style={{ fontSize: 11 }}>{String(row.id || "").slice(0, 10)}</span>
                        <span className="anno">user {String(row.user_id || "").slice(0, 8)}{row.attempt_count ? ` · attempts: ${row.attempt_count}` : ""}</span>
                      </div>
                      {row.last_error || row.error_message ? (
                        <div className="err-row" style={{ marginTop: 6 }}>{row.last_error || row.error_message}</div>
                      ) : null}
                      <div className="anno" style={{ marginTop: 4 }}>
                        queued {row.queued_at ? new Date(row.queued_at).toLocaleString("en-IN") : "—"}
                        {row.processed_at ? ` · processed ${new Date(row.processed_at).toLocaleString("en-IN")}` : ""}
                        {row.reason ? ` · ${row.reason}` : ""}
                      </div>
                    </div>
                    {canRetry ? (
                      <button type="button" className="btn small" onClick={() => retry(row.id)} disabled={retryBusyId === row.id} data-testid={`retry-${row.id}`}>
                        {retryBusyId === row.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <RotateCcw className="h-3 w-3" />} Retry
                      </button>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        ) : null}

        {failedCount > 5 ? (
          <div className="warn-row">⚠ {failedCount} failed recomputes. Inspect worker logs before retrying individually.</div>
        ) : null}
      </div>
      <div className="card-foot">
        <button type="button" className="btn ghost small" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />} Refresh
        </button>
        <button type="button" className="btn primary small" onClick={fanout} disabled={fanoutBusy}>
          {fanoutBusy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <PlayCircle className="h-3.5 w-3.5" />} Recompute now
        </button>
      </div>
    </section>
  );
}
