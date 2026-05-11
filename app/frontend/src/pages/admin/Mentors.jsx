import React, { useEffect, useMemo, useState } from "react";
import { Search, Star, UserCheck } from "lucide-react";
import { api } from "../../lib/api";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminMentors() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.get("/api/marketplace/mentors").then((d) => setItems(d.items || [])).catch(() => {}).finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((mentor) => `${mentor.name || ""} ${mentor.headline || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  return (
    <div className="space-y-6" data-testid="admin-mentors">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Mentor verification</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Who we vouch for.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Review mentor profiles with enough context to make trust decisions quickly.</p>
        </div>
        <StatusBadge status="pending" label={`${filtered.length} visible`} />
      </div>
      <div className="soft-card rounded-2xl p-4">
        <label className="relative block">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <span className="sr-only">Search mentors</span>
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm" placeholder="Search name or headline" />
        </label>
      </div>
      {loading ? <LoadingSkeleton variant="cards" /> : null}
      {!loading && filtered.length === 0 ? <EmptyState icon={UserCheck} title="No mentors match this view" description="Adjust the search to widen the review list." /> : null}
      {!loading && filtered.length > 0 ? (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {filtered.map((mentor) => (
            <article key={mentor.id} className="soft-card rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-xl bg-sage-100 text-sm font-semibold text-sage-800">
                  {(mentor.name || "?").slice(0, 2).toUpperCase()}
                </div>
                <div className="min-w-0 flex-1">
                  <h2 className="truncate font-heading text-xl">{mentor.name}</h2>
                  <p className="mt-1 line-clamp-2 text-sm text-muted-foreground">{mentor.headline}</p>
                </div>
              </div>
              <div className="mt-4 grid grid-cols-3 gap-2 text-xs">
                <Metric label="Price" value={`₹${mentor.price_per_hour}/hr`} />
                <Metric label="Rating" value={<span className="inline-flex items-center gap-1"><Star className="h-3.5 w-3.5 text-amber-500" fill="currentColor" /> {mentor.rating}</span>} />
                <Metric label="Sessions" value={mentor.sessions} />
              </div>
              <div className="mt-4 flex justify-end">
                <button className="btn btn-primary text-xs">Review</button>
              </div>
            </article>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function Metric({ label, value }) {
  return <div className="rounded-xl border border-border bg-white/60 p-2"><div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div><div className="mt-1 font-semibold">{value}</div></div>;
}
