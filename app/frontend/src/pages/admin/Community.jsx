import React, { useEffect, useState } from "react";
import { Flag } from "lucide-react";
import { api } from "../../lib/api";

export default function AdminCommunity() {
  const [items, setItems] = useState([]);
  useEffect(() => {
    api.get("/api/admin/community/flags").then((d) => setItems(d.items)).catch(() => {});
  }, []);
  return (
    <div className="space-y-6" data-testid="admin-community">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Community moderation</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Flagged threads.</h1>
      </div>
      <div className="soft-card rounded-2xl p-5 space-y-2">
        {items.map((f) => (
          <div key={f.id} className="flex items-center justify-between border-b border-border pb-2 last:border-0">
            <div className="inline-flex items-center gap-2">
              <Flag className="h-4 w-4 text-clay-600" />
              <div>
                <div className="font-semibold">{f.thread}</div>
                <div className="text-xs text-muted-foreground">{f.reason} · {f.raised}</div>
              </div>
            </div>
            <div className="flex gap-2">
              <button className="btn btn-ghost text-xs">Dismiss</button>
              <button className="btn btn-primary text-xs">Hide thread</button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
