import React, { useEffect, useState } from "react";
import { RotateCcw, Play, X as XIcon, FileText } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

const STATUSES = ["pending", "generating", "ready", "failed"];

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function statusClass(s) {
  if (s === "ready") return "bg-emerald-100 text-emerald-900";
  if (s === "failed") return "bg-red-100 text-red-900";
  if (s === "generating") return "bg-amber-100 text-amber-900";
  if (s === "pending") return "bg-muted text-muted-foreground";
  return "bg-muted";
}

export default function AdminStudyOsReports() {
  const [filterStatus, setFilterStatus] = useState("");
  const [filterUser, setFilterUser] = useState("");
  const [showExpired, setShowExpired] = useState(false);
  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (filterStatus) params.set("status", filterStatus);
      if (filterUser) params.set("user_id", filterUser);
      if (showExpired) params.set("expired", "true");
      const r = await api.get(`/api/admin/study-os/reports/queue?${params}`);
      setQueue(r);
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function retry(id) {
    const reason = window.prompt("Reason for retry (≥8 chars)?");
    if (!reason || reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    try {
      const r = await api.post(`/api/admin/study-os/reports/${encodeURIComponent(id)}/retry`, {
        reason: reason.trim(),
      });
      setStatus({ ok: true, message: `Retried. status=${r.status}. audit_id=${r.audit_id}` });
      load();
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    }
  }

  async function cancel(id) {
    const reason = window.prompt("Reason for cancel (≥8 chars)?");
    if (!reason || reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    if (!window.confirm("Cancel this job? It will land as 'failed' with an admin marker.")) return;
    try {
      const r = await api.post(`/api/admin/study-os/reports/${encodeURIComponent(id)}/cancel`, {
        reason: reason.trim(),
      });
      setStatus({ ok: true, message: `Cancelled. status=${r.status}. audit_id=${r.audit_id}` });
      load();
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    }
  }

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5" data-testid="admin-studyos-reports">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · report jobs
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Report Job Admin</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Track every <code>report_exports</code> row. Retry failed jobs to flip them back to pending; cancel
          pending/generating jobs to mark them failed with an admin marker. Counts per status are surfaced
          so the failed pile is visible at a glance.
        </p>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
          >
            <option value="">All</option>
            {STATUSES.map((s) => (
              <option key={s} value={s}>{s}</option>
            ))}
          </select>
        </label>
        <label>
          <span className="block text-xs text-muted-foreground mb-1">User ID (optional)</span>
          <input
            type="text"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono"
            placeholder="any user"
          />
        </label>
        <label className="inline-flex items-center gap-2 text-xs">
          <input
            type="checkbox"
            checked={showExpired}
            onChange={(e) => setShowExpired(e.target.checked)}
          />
          Expired only
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}>
          <RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Apply"}
        </button>
      </div>

      {queue?.counts ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(queue.counts).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${statusClass(k)}`}>
              {k}: <span className="font-mono">{v}</span>
            </span>
          ))}
        </div>
      ) : null}

      {status ? (
        <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">
          {status.message}
        </div>
      ) : null}

      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <section className="rounded border border-border/60 bg-card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">type</th>
              <th className="text-left p-2">fmt</th>
              <th className="text-left p-2">status</th>
              <th className="text-left p-2">user_id</th>
              <th className="text-left p-2">requested</th>
              <th className="text-left p-2">completed</th>
              <th className="text-left p-2">error</th>
              <th className="text-left p-2">actions</th>
            </tr>
          </thead>
          <tbody>
            {!queue?.items?.length ? (
              <tr><td colSpan={8} className="p-3 text-muted-foreground text-center">No jobs.</td></tr>
            ) : queue.items.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="p-2 flex items-center gap-1"><FileText className="h-3 w-3 text-muted-foreground" /> {r.report_type}</td>
                <td className="p-2">{r.format}</td>
                <td className="p-2"><span className={`px-1.5 rounded ${statusClass(r.status)}`}>{r.status}</span></td>
                <td className="p-2 font-mono">{r.user_id?.slice(0, 8)}…</td>
                <td className="p-2">{fmt(r.requested_at)}</td>
                <td className="p-2">{fmt(r.completed_at)}</td>
                <td className="p-2 max-w-[18ch] truncate" title={r.error_message || ""}>{r.error_message || "—"}</td>
                <td className="p-2 space-x-2">
                  {r.status === "failed" ? (
                    <button
                      type="button"
                      className="text-[11px] underline hover:no-underline"
                      onClick={() => retry(r.id)}
                      data-testid={`retry-${r.id}`}
                    >
                      <Play className="inline h-3 w-3" /> Retry
                    </button>
                  ) : null}
                  {r.status === "pending" || r.status === "generating" ? (
                    <button
                      type="button"
                      className="text-[11px] underline hover:no-underline text-red-700"
                      onClick={() => cancel(r.id)}
                      data-testid={`cancel-${r.id}`}
                    >
                      <XIcon className="inline h-3 w-3" /> Cancel
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  );
}
