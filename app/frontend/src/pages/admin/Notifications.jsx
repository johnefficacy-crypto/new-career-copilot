import React, { useEffect, useState } from "react";
import { Bell, Power, Play, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminNotifications() {
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);
  const [gen, setGen] = useState({ dry_run: true, scope: "me", limit: 100 });

  async function load() {
    const [o, j] = await Promise.all([
      api.get("/api/admin/notifications"),
      api.get("/api/admin/jobs"),
    ]);
    setOverview(o);
    setJobs(j.jobs || []);
  }
  useEffect(() => {
    load().catch(() => {});
  }, []);

  async function toggleKill(paused) {
    setBusy("kill");
    setMsg(null);
    try {
      await api.post("/api/admin/notifications/kill-switch", { paused });
      setMsg(paused ? "Kill switch ON — outbound paused." : "Kill switch OFF — dispatch resumed.");
      await load();
    } catch (e) {
      setMsg(`Toggle failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runJob(id) {
    setBusy(id);
    setMsg(null);
    try {
      const r = await api.post(`/api/admin/jobs/run/${id}`, {});
      setMsg(
        r.ok
          ? `${id} ran: ${JSON.stringify(r.result)}`
          : `${id} failed: ${r.error}`
      );
      await load();
    } catch (e) {
      setMsg(`Run failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  async function runNextActions() {
    setBusy("next-actions");
    setMsg(null);
    try {
      const r = await api.post("/api/notifications/generate-next-actions", gen);
      setMsg(`next-actions ${r.dry_run ? "preview" : "generated"}: created=${r.created}, skipped=${r.skipped}, candidates=${r.candidates}, by_type=${JSON.stringify(r.by_type || {})}`);
    } catch (e) {
      setMsg(`Generate failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (!overview) return <div data-testid="notif-loading">Loading…</div>;
  const paused = !!overview.kill_switch;

  return (
    <div className="space-y-6" data-testid="admin-notifications">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Notification controls · canonical
          </div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
            Outbound channels.
          </h1>
          <p className="text-muted-foreground mt-1">
            APScheduler runs three jobs in-process. Email goes through Resend
            (logs only when <code>RESEND_API_KEY</code> is unset).
          </p>
        </div>
        <button
          onClick={load}
          className="btn btn-ghost"
          data-testid="notif-reload"
        >
          <RefreshCw className="h-4 w-4" /> Reload
        </button>
      </div>

      {msg && (
        <div
          data-testid="notif-msg"
          className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs"
        >
          {msg}
        </div>
      )}

      {/* Kill switch */}
      <div
        className={`soft-card rounded-2xl p-5 flex items-center gap-4 ${
          paused ? "border-destructive/40" : ""
        }`}
        data-testid="kill-switch-card"
      >
        <div
          className={`h-10 w-10 rounded-xl grid place-items-center ${
            paused ? "bg-destructive/15 text-destructive" : "bg-sage-100 text-sage-700"
          }`}
        >
          <Power className="h-5 w-5" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">
            Kill switch{" "}
            <span
              className={`pill ${paused ? "pill-clay" : "pill-sage"} ml-2`}
            >
              {paused ? "PAUSED" : "ACTIVE"}
            </span>
          </div>
          <div className="text-xs text-muted-foreground">
            Sets <code>admin_settings.notifications_paused</code>. Kill switch controls outbound delivery. In-app next-action generation is controlled by preferences and admin permissions.
          </div>
        </div>
        <button
          onClick={() => toggleKill(!paused)}
          disabled={busy === "kill"}
          className={`btn ${paused ? "btn-primary" : "btn-ghost"}`}
          data-testid="kill-switch-toggle"
        >
          {paused ? "Resume" : "Pause"}
        </button>
      </div>

      {/* KPIs */}
      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Pending dispatch" value={overview.pending_dispatch} />
        <Stat label="Sent (24h)" value={overview.sent_24h} />
        <Stat label="Channels active" value={overview.channels.filter((c) => c.active).length} />
        <Stat label="Recent generated" value={overview.recent_generation?.created || 0} />
      </div>

      {/* Channels */}
      <div className="grid md:grid-cols-2 gap-4">
        {overview.channels.map((c) => (
          <div
            key={c.id}
            className="soft-card rounded-2xl p-5"
            data-testid={`channel-${c.id}`}
          >
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <Bell className="h-4 w-4 text-clay-600" />
                <span className="font-semibold">{c.label}</span>
              </div>
              <span className={`pill ${c.active ? "pill-sage" : "pill-clay"}`}>
                {c.active ? "Active" : "Disabled"}
              </span>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">
              Per-user opt-in via <code>notification_preferences</code>.
              {c.id === "email" && " RESEND_API_KEY unset → log-only."}
              {c.id === "whatsapp" && " Phase-3 placeholder."}
            </div>
          </div>
        ))}
      </div>

      {/* Jobs */}
      <div className="soft-card rounded-2xl p-5 space-y-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Next-action generator</div>
        <div className="grid md:grid-cols-4 gap-3">
          <select className="input" value={gen.scope} onChange={(e) => setGen((g) => ({ ...g, scope: e.target.value }))}><option value="me">me</option><option value="all_users">all_users</option></select>
          <input className="input" type="number" min="1" max="500" value={gen.limit} onChange={(e) => setGen((g) => ({ ...g, limit: Number(e.target.value || 100) }))} />
          <label className="text-xs flex items-center gap-2"><input type="checkbox" checked={gen.dry_run} onChange={(e) => setGen((g) => ({ ...g, dry_run: e.target.checked }))} /> Dry run</label>
          <button className="btn btn-ghost" onClick={runNextActions} disabled={busy === "next-actions"}>Run next-actions</button>
        </div>
      </div>

      <div className="soft-card rounded-2xl p-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
          Recent generation runs
        </div>
        <div className="space-y-2">
          {(overview.recent_runs || []).map((r) => (
            <div key={r.id} className="border border-border rounded-xl p-3 text-xs">
              <div className="flex flex-wrap gap-3">
                <span>{new Date(r.created_at).toLocaleString("en-IN")}</span>
                <span>scope: {r.scope}</span>
                <span>dry-run: {String(r.dry_run)}</span>
                <span>candidates: {r.candidates_count}</span>
                <span>created: {r.created_count}</span>
                <span>skipped: {r.skipped_count}</span>
                <span>status: {r.status}</span>
              </div>
              <div className="mt-1 text-muted-foreground">by_type: {JSON.stringify(r.by_type || {})}</div>
              {r.error_message && <div className="mt-1 text-destructive">{r.error_message}</div>}
            </div>
          ))}
          {(!overview.recent_runs || overview.recent_runs.length === 0) && <div className="text-xs text-muted-foreground">No runs yet.</div>}
        </div>
      </div>

      <div className="soft-card rounded-2xl p-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold mb-3">
          Scheduled jobs
        </div>
        <ul className="space-y-2">
          {jobs.map((j) => (
            <li
              key={j.id}
              className="flex items-center justify-between border-b border-border py-2 last:border-0 gap-3 flex-wrap"
              data-testid={`job-${j.id}`}
            >
              <div className="min-w-[220px] font-mono text-[13px]">{j.id}</div>
              <div className="text-xs text-muted-foreground">
                next:{" "}
                {j.next_run_at
                  ? new Date(j.next_run_at).toLocaleString("en-IN")
                  : "—"}
              </div>
              <div className="text-xs text-muted-foreground">
                last:{" "}
                {j.last_run?.at
                  ? new Date(j.last_run.at).toLocaleTimeString("en-IN")
                  : "never"}
                {j.last_run && (
                  <span
                    className={`ml-2 ${
                      j.last_run.ok ? "text-sage-700" : "text-clay-700"
                    }`}
                  >
                    {j.last_run.ok ? "ok" : "failed"}
                  </span>
                )}
              </div>
              <button
                onClick={() => runJob(j.id)}
                disabled={busy === j.id}
                className="btn btn-ghost text-xs"
                data-testid={`run-job-${j.id}`}
              >
                <Play className="h-3 w-3" /> Run now
              </button>
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value}</div>
    </div>
  );
}
