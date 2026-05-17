import React, { useEffect, useState } from "react";
import { RotateCcw, UserMinus, ShieldOff, Plus } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch { return String(iso); } }
function promptReason(label = "Reason (≥8 chars)?") {
  const r = window.prompt(label);
  if (!r || r.trim().length < 8) return null;
  return r.trim();
}

export default function PartnersConsole() {
  const [pairs, setPairs] = useState(null);
  const [invites, setInvites] = useState(null);
  const [blocks, setBlocks] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState(null);
  const [newA, setNewA] = useState("");
  const [newB, setNewB] = useState("");

  async function load() {
    setBusy(true); setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const [p, i, b] = await Promise.all([
        api.get(`/api/admin/community/partners?${params}`),
        api.get("/api/admin/community/partners/invites?limit=20"),
        api.get("/api/admin/community/partners/rematch-blocks?limit=50"),
      ]);
      setPairs(p); setInvites(i); setBlocks(b);
    } catch (e) { setErr(getApiErrorMessage(e)); } finally { setBusy(false); }
  }

  async function endPair(id) {
    const reason = promptReason("Reason to end this pair?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/partners/${encodeURIComponent(id)}/end`, { reason });
      setStatus({ ok: true, message: `Ended. audit_id=${r.audit_id}` });
      load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function createBlock(e) {
    e.preventDefault();
    const reason = promptReason("Reason to block rematch?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post("/api/admin/community/partners/rematch-blocks", {
        reason, payload: { user_a: newA.trim(), user_b: newB.trim() },
      });
      setStatus({ ok: true, message: `Block created. audit_id=${r.audit_id}` });
      setNewA(""); setNewB("");
      load();
    } catch (ex) { setStatus({ ok: false, message: getApiErrorMessage(ex) }); }
  }

  async function removeBlock(id) {
    const reason = promptReason("Reason to remove block?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.delete(`/api/admin/community/partners/rematch-blocks/${encodeURIComponent(id)}?reason=${encodeURIComponent(reason)}`);
      setStatus({ ok: true, message: `Removed. audit_id=${r.audit_id}` });
      load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="space-y-5" data-testid="admin-partners-console">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance · accountability partners</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Partner Governance Console</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          End abusive pairs, block rematches between specific users, and triage pending invites. Spec §4.2.
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Pair status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="active">active</option>
            <option value="paused">paused</option>
            <option value="ended">ended</option>
            <option value="">all</option>
          </select>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}><RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}</button>
      </div>

      {status ? <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">{status.message}</div> : null}
      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Pairs ({pairs?.total ?? 0})</h3>
          {!pairs?.items?.length ? <div className="text-sm text-muted-foreground">No pairs.</div> : (
            <ul className="space-y-1 text-xs">
              {pairs.items.map((p) => (
                <li key={p.id} className="border-b border-border/40 py-1 flex justify-between items-center">
                  <div>
                    <div className="font-mono">{p.user_a?.slice(0,8)}… ⇄ {p.user_b?.slice(0,8)}…</div>
                    <div className="text-muted-foreground">{p.pairing_goal} · {p.status} · {fmt(p.created_at)}</div>
                  </div>
                  {p.status === "active" ? (
                    <button type="button" onClick={() => endPair(p.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`pair-end-${p.id}`}>
                      <UserMinus className="inline h-3 w-3" /> End
                    </button>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Pending invites ({invites?.total ?? 0})</h3>
          {!invites?.items?.length ? <div className="text-sm text-muted-foreground">No paused invites.</div> : (
            <ul className="space-y-1 text-xs">
              {invites.items.map((i) => (
                <li key={i.id} className="border-b border-border/40 py-1">
                  <div className="font-mono">{i.user_a?.slice(0,8)}… → {i.user_b?.slice(0,8)}…</div>
                  <div className="text-muted-foreground">{i.pairing_goal} · {fmt(i.created_at)}</div>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-3 lg:col-span-2">
          <h3 className="text-sm font-semibold">Rematch blocks ({blocks?.total ?? 0})</h3>

          <form onSubmit={createBlock} className="flex gap-2 items-end flex-wrap">
            <label>
              <span className="block text-xs text-muted-foreground mb-1">User A UUID</span>
              <input type="text" value={newA} onChange={(e) => setNewA(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono" data-testid="rematch-user-a" />
            </label>
            <label>
              <span className="block text-xs text-muted-foreground mb-1">User B UUID</span>
              <input type="text" value={newB} onChange={(e) => setNewB(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono" data-testid="rematch-user-b" />
            </label>
            <button type="submit" className="btn small" disabled={!newA.trim() || !newB.trim()} data-testid="rematch-create">
              <Plus className="inline h-3 w-3" /> Add block
            </button>
          </form>

          {!blocks?.items?.length ? <div className="text-sm text-muted-foreground">No blocks.</div> : (
            <ul className="space-y-1 text-xs">
              {blocks.items.map((b) => (
                <li key={b.id} className="border-b border-border/40 py-1 flex justify-between items-center">
                  <div>
                    <div className="font-mono">{b.user_a.slice(0,8)}… ⇄ {b.user_b.slice(0,8)}…</div>
                    <div className="text-muted-foreground">by {b.blocked_by_email || "?"} · {fmt(b.created_at)}</div>
                  </div>
                  <button type="button" onClick={() => removeBlock(b.id)} className="text-[11px] underline hover:no-underline" data-testid={`rematch-remove-${b.id}`}>
                    <ShieldOff className="inline h-3 w-3" /> Remove
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </div>
  );
}
