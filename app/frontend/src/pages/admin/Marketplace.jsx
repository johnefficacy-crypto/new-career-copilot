import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminMarketplace() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/api/admin/marketplace").then(setD).catch(() => {});
  }, []);
  if (!d) return <div>Loading…</div>;
  return (
    <div className="space-y-6" data-testid="admin-marketplace">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Marketplace admin</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Listings, providers, disputes.</h1>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Resources" v={d.counts.resources} />
        <Stat label="Mentors" v={d.counts.mentors} />
        <Stat label="Providers" v={d.counts.providers} />
      </div>
      <div className="soft-card rounded-2xl p-5">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Active flags</div>
        {d.flags.length === 0 ? (
          <div className="text-sm text-muted-foreground">No open disputes.</div>
        ) : (
          <ul className="space-y-2">
            {d.flags.map((f) => (
              <li key={f.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
                <div>
                  <div className="font-semibold">{f.target}</div>
                  <div className="text-xs text-muted-foreground">{f.kind} · {f.raised}</div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost text-xs">Dismiss</button>
                  <button className="btn btn-primary text-xs">Open</button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function Stat({ label, v }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{v}</div>
    </div>
  );
}
