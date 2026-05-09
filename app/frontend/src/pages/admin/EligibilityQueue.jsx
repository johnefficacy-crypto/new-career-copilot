import React, { useEffect, useState } from "react";
import EligibilityReviewDrawer from "../../features/admin/eligibility/EligibilityReviewDrawer";
import { api } from "../../lib/api";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

export default function AdminEligibilityQueue() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  async function load() {
    setError(null);
    const r = await api.get("/api/admin/eligibility-queue");
    setD(r);
  }
  useEffect(() => { load().catch((e) => setError(e)); }, []);

  async function promote(item) {
    setBusy(true); setMsg(null);
    try {
      const r = await api.post(`/api/admin/scrape/items/${item.id}/promote`, {});
      setMsg(`Promoted "${item.recruitment}" → recruitment ${(r.recruitment_id || "unknown").slice(0, 8)}… · ${r.alerts_sent} alerts sent`);
      await load();
      setSelected(null);
    } catch (e) { setMsg(`promote failed: ${e.message}`); } finally { setBusy(false); }
  }

  async function reject(item, notes) {
    setBusy(true); setMsg(null);
    try {
      await api.post(`/api/admin/scrape/items/${item.id}/reject`, { notes });
      setMsg(`Rejected "${item.recruitment}".`);
      await load();
      setSelected(null);
    } catch (e) { setMsg(`reject failed: ${e.message}`); } finally { setBusy(false); }
  }

  if (!d && !error) return <div data-testid="admin-elig-loading"><LoadingSkeleton variant="table" /></div>;
  if (error) return <ErrorState title="Failed to load eligibility queue" message={error.message} onRetry={() => load().catch((e) => setError(e))} />;

  return (
    <div className="space-y-6" data-testid="admin-eligibility-queue">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Eligibility queue · canonical</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Promotion gate.</h1>
        <p className="text-muted-foreground mt-1">Scraped items wait here for an explicit admin decision. The deterministic eligibility engine never auto-promotes — that's the trust gate.</p>
      </div>

      {msg && <div data-testid="admin-elig-msg" className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs">{msg}</div>}

      <div className="grid md:grid-cols-3 gap-4"><Stat label="Pending" value={d.pending.length} /><Stat label="Promoted (24h)" value={d.promoted_24h} /><Stat label="Rejected (24h)" value={d.rejected_24h} /></div>

      <div className="soft-card rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Items awaiting review</div>
        {d.pending.length === 0 ? <EmptyState title="Queue is empty" description="Run a dry-scrape from Scraper monitor to populate it." actionLabel="Open scraper" actionHref="/admin/scraper" /> : <ul className="space-y-2">{d.pending.map((p) => { const conf = Number(p.confidence || 0); return <li key={p.id} className="flex items-center justify-between border-b border-border py-2 last:border-0 gap-3 flex-wrap cursor-pointer hover:bg-clay-50/50 px-2 rounded" data-testid={`queue-item-${p.id}`} onClick={() => setSelected(p)}><div className="min-w-[280px]"><div className="font-semibold">{p.recruitment}</div><div className="text-xs text-muted-foreground">Source: {p.source || "—"}</div>{!p.source && <div className="text-xs text-destructive">Source missing</div>}</div><div className="text-xs text-muted-foreground"><StatusBadge status={conf < 0.7 ? "pending" : "verified"} label={`${Math.round(conf * 100)}% confidence`} />{" · "}{p.added ? new Date(p.added).toLocaleString("en-IN") : "—"}{conf < 0.7 && <div className="text-destructive mt-1">Low confidence</div>}</div></li>; })}</ul>}
      </div>

      <EligibilityReviewDrawer open={!!selected} item={selected} busy={busy} onClose={() => setSelected(null)} onPromote={() => promote(selected)} onReject={(notes) => reject(selected, notes)} />
    </div>
  );
}

function Stat({ label, value }) { return <div className="soft-card rounded-2xl p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div><div className="mt-2 font-heading text-3xl font-semibold">{value}</div></div>; }
