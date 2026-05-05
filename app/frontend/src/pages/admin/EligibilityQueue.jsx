import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";

export default function AdminEligibilityQueue() {
  const [d, setD] = useState(null);
  const [busy, setBusy] = useState(null);
  const [msg, setMsg] = useState(null);

  async function load() {
    const r = await api.get("/api/admin/eligibility-queue");
    setD(r);
  }
  useEffect(() => {
    load().catch(() => setD({ pending: [], promoted_24h: 0, rejected_24h: 0 }));
  }, []);

  async function act(item, action) {
    setBusy(item.id);
    setMsg(null);
    try {
      if (action === "promote") {
        const r = await api.post(`/api/admin/scrape/items/${item.id}/promote`, {});
        setMsg(
          `Promoted "${item.recruitment}" → recruitment ${r.recruitment_id.slice(
            0,
            8
          )}… · ${r.alerts_sent} alerts sent`
        );
      } else {
        await api.post(`/api/admin/scrape/items/${item.id}/reject`, {
          notes: "Rejected from admin queue",
        });
        setMsg(`Rejected "${item.recruitment}".`);
      }
      await load();
    } catch (e) {
      setMsg(`${action} failed: ${e.message}`);
    } finally {
      setBusy(null);
    }
  }

  if (!d) return <div data-testid="admin-elig-loading">Loading…</div>;
  return (
    <div className="space-y-6" data-testid="admin-eligibility-queue">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Eligibility queue · canonical
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          Promotion gate.
        </h1>
        <p className="text-muted-foreground mt-1">
          Scraped items wait here for an explicit admin decision. The deterministic
          eligibility engine never auto-promotes — that's the trust gate.
        </p>
      </div>

      {msg && (
        <div
          data-testid="admin-elig-msg"
          className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs"
        >
          {msg}
        </div>
      )}

      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Pending" value={d.pending.length} />
        <Stat label="Promoted (24h)" value={d.promoted_24h} />
        <Stat label="Rejected (24h)" value={d.rejected_24h} />
      </div>

      <div className="soft-card rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">
          Items awaiting review
        </div>
        {d.pending.length === 0 ? (
          <div className="text-sm text-muted-foreground py-6 text-center">
            Queue is empty. Run a dry-scrape from{" "}
            <a href="/admin/scraper" className="link-under">
              Scraper monitor
            </a>{" "}
            to populate it.
          </div>
        ) : (
          <ul className="space-y-2">
            {d.pending.map((p) => (
              <li
                key={p.id}
                className="flex items-center justify-between border-b border-border py-2 last:border-0 gap-3 flex-wrap"
                data-testid={`queue-item-${p.id}`}
              >
                <div className="min-w-[280px]">
                  <div className="font-semibold">{p.recruitment}</div>
                  <div className="text-xs text-muted-foreground">
                    Source: {p.source || "—"}
                  </div>
                </div>
                <div className="text-xs text-muted-foreground">
                  confidence {Math.round((p.confidence || 0) * 100)}%
                  {" · "}
                  {p.added ? new Date(p.added).toLocaleString("en-IN") : "—"}
                </div>
                <div className="flex gap-2">
                  <button
                    disabled={busy === p.id}
                    onClick={() => act(p, "reject")}
                    className="btn btn-ghost text-xs"
                    data-testid={`reject-${p.id}`}
                  >
                    Reject
                  </button>
                  <button
                    disabled={busy === p.id}
                    onClick={() => act(p, "promote")}
                    className="btn btn-primary text-xs"
                    data-testid={`promote-${p.id}`}
                  >
                    Promote
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
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
