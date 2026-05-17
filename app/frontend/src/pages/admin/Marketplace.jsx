import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ExternalLink, Store } from "lucide-react";
import { api } from "../../lib/api";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminMarketplace() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api.get("/api/admin/marketplace").then(setData).catch(() => {}).finally(() => setLoading(false));
  }, []);

  return (
    <div className="space-y-6" data-testid="admin-marketplace">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Marketplace admin</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Listings, providers, disputes.</h1>
          <p className="mt-1 text-sm text-muted-foreground">A compact trust desk for marketplace inventory and active flags.</p>
        </div>
        <StatusBadge status={(data?.flags || []).length ? "pending" : "verified"} label={`${(data?.flags || []).length} active flags`} />
      </div>

      {loading ? <LoadingSkeleton variant="cards" /> : null}
      {!loading && data ? (
        <>
          <div className="grid gap-4 md:grid-cols-3">
            <Stat label="Resources" value={data.counts?.resources} />
            <Stat label="Mentors" value={data.counts?.mentors} />
            <Stat label="Providers" value={data.counts?.providers} />
          </div>
          <section className="soft-card rounded-2xl p-5">
            <div className="flex items-center gap-2">
              <AlertTriangle className="h-4 w-4 text-amber-700" />
              <h2 className="font-semibold">Active flags</h2>
            </div>
            {(data.flags || []).length === 0 ? (
              <div className="mt-4"><EmptyState icon={Store} title="No open disputes" description="Marketplace flags and provider disputes will appear here." /></div>
            ) : (
              <div className="mt-4 grid gap-3">
                {data.flags.map((flag) => (
                  <article key={flag.id} className="rounded-xl border border-border bg-white/60 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{flag.target}</div>
                        <div className="mt-1 text-xs text-muted-foreground">{flag.kind} / {flag.raised}</div>
                      </div>
                      <Link to="/admin/moderation" className="btn btn-primary text-xs inline-flex items-center gap-1" title="Open in trust desk">
                        Open in trust desk <ExternalLink className="h-3 w-3" />
                      </Link>
                    </div>
                  </article>
                ))}
                <p className="text-xs text-muted-foreground">
                  Flag actions live on the central trust desk (<Link to="/admin/moderation" className="underline">/admin/moderation</Link>) and the per-area governance consoles. This view is read-only.
                </p>
              </div>
            )}
          </section>
        </>
      ) : null}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value ?? "-"}</div>
    </div>
  );
}
