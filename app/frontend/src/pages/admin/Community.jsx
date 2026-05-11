import React, { useEffect, useMemo, useState } from "react";
import { Flag, Search, ShieldAlert } from "lucide-react";
import { api } from "../../lib/api";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminCommunity() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get("/api/admin/community/flags").then((d) => setItems(d.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((flag) => `${flag.thread || ""} ${flag.reason || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  return (
    <div className="space-y-6" data-testid="admin-community">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Community moderation</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Flagged threads.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Keep reports scannable and resolve them without losing context.</p>
        </div>
        <StatusBadge status={filtered.length ? "pending" : "verified"} label={`${filtered.length} open`} />
      </div>
      <div className="soft-card rounded-2xl p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search community flags</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" placeholder="Search thread or reason" />
        </label>
      </div>
      {loading ? <LoadingSkeleton variant="cards" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState icon={ShieldAlert} title="No flagged threads match this view" description="New reports will appear here for moderation." /> : null}
      {!loading && filtered.length > 0 ? (
        <div className="grid gap-3">
          {filtered.map((flag) => (
            <article key={flag.id} className="soft-card rounded-2xl p-4">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex min-w-0 gap-3">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-clay-100">
                    <Flag className="h-4 w-4 text-clay-700" />
                  </div>
                  <div className="min-w-0">
                    <h2 className="truncate font-semibold">{flag.thread}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{flag.reason} / {flag.raised}</p>
                  </div>
                </div>
                <div className="flex gap-2">
                  <button className="btn btn-ghost text-xs">Dismiss</button>
                  <button className="btn btn-primary text-xs">Hide thread</button>
                </div>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}
