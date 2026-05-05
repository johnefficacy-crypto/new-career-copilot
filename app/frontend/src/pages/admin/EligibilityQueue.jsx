import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminEligibilityQueue() {
  const [d, setD] = useState(null);
  useEffect(() => {
    api.get("/api/admin/eligibility-queue").then(setD).catch(() => {});
  }, []);
  if (!d) return <div>Loading…</div>;
  return (
    <div className="space-y-6" data-testid="admin-eligibility-queue">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Eligibility queue · placeholder</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Promotion gate.</h1>
        <p className="text-muted-foreground mt-1">Scraped items await review here. Phase-2 wires the real queue.</p>
      </div>
      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Pending" value={d.pending.length} />
        <Stat label="Promoted (24h)" value={d.promoted_24h} />
        <Stat label="Rejected (24h)" value={d.rejected_24h} />
      </div>
      <div className="soft-card rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Items awaiting review</div>
        <ul className="space-y-2">
          {d.pending.map((p) => (
            <li key={p.slug} className="flex items-center justify-between border-b border-border py-2 last:border-0">
              <div>
                <div className="font-semibold">{p.recruitment}</div>
                <div className="text-xs text-muted-foreground font-mono">{p.slug}</div>
              </div>
              <div className="text-xs text-muted-foreground">confidence {Math.round(p.confidence * 100)}% · {p.added}</div>
              <div className="flex gap-2">
                <button className="btn btn-ghost text-xs">Reject</button>
                <button className="btn btn-primary text-xs">Promote</button>
              </div>
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
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value}</div>
    </div>
  );
}
