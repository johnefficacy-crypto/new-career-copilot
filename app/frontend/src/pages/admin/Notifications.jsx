import React, { useEffect, useState } from "react";
import { Bell, Power } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminNotifications() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/api/admin/notifications").then(setD).catch(() => {});
  }, []);
  async function toggle(ch, enabled) {
    setD((s) => ({ ...s, channels: s.channels.map((c) => (c.channel === ch ? { ...c, enabled } : c)) }));
    await api.post("/api/admin/notifications/toggle", { channel: ch, enabled });
  }
  if (!d) return <div>Loading…</div>;
  return (
    <div className="space-y-6" data-testid="admin-notifications">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Notification controls</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Outbound channels.</h1>
      </div>
      <div className="soft-card rounded-2xl p-5 flex items-center gap-4">
        <div className="h-10 w-10 rounded-xl bg-destructive/10 grid place-items-center">
          <Power className="h-5 w-5 text-destructive" />
        </div>
        <div className="flex-1">
          <div className="font-semibold">Kill-switch</div>
          <div className="text-xs text-muted-foreground">Disables every outbound channel in under 2s. Phase-2 will propagate to the cron worker.</div>
        </div>
        <button className="btn btn-ghost">Toggle (soon)</button>
      </div>
      <div className="grid md:grid-cols-2 gap-4">
        {d.channels.map((c) => (
          <div key={c.channel} className="soft-card rounded-2xl p-5" data-testid={`channel-${c.channel}`}>
            <div className="flex items-center justify-between">
              <div className="inline-flex items-center gap-2">
                <Bell className="h-4 w-4 text-clay-600" />
                <span className="font-semibold">{c.channel}</span>
              </div>
              <label className="inline-flex items-center gap-2 text-xs">
                <input type="checkbox" checked={c.enabled} onChange={(e) => toggle(c.channel, e.target.checked)} />
                {c.enabled ? "Enabled" : "Disabled"}
              </label>
            </div>
            <div className="mt-2 text-xs text-muted-foreground">Last sent · {c.last_sent} · Rate · {c.rate_limit}</div>
          </div>
        ))}
      </div>
    </div>
  );
}
