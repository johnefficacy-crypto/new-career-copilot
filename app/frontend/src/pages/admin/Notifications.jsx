import React, { useEffect, useState } from "react";
import { Bell, Power, Play, RefreshCw } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminNotifications() {
  const [overview, setOverview] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

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
            Sets <code>admin_settings.notifications_paused</code>. The
            dispatcher and the daily deadline sweep both early-return when
            paused.
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
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Pending dispatch" value={overview.pending_dispatch} />
        <Stat label="Sent (24h)" value={overview.sent_24h} />
        <Stat label="Channels active" value={overview.channels.filter((c) => c.active).length} />
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
