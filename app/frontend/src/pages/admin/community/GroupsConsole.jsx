import React, { useEffect, useState } from "react";
import { RotateCcw, Snowflake, Archive, UserMinus, Square, ShieldOff } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch { return String(iso); } }

function promptReason(msg = "Reason (≥8 chars)?") {
  const r = window.prompt(msg);
  if (!r || r.trim().length < 8) return null;
  return r.trim();
}

export default function GroupsConsole() {
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState("active");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  async function load() {
    setBusy(true); setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const r = await api.get(`/api/admin/community/groups?${params}`);
      setItems(r);
    } catch (e) { setErr(getApiErrorMessage(e)); } finally { setBusy(false); }
  }

  async function loadDetail(groupId) {
    setSelected(groupId); setDetail(null);
    try {
      const r = await api.get(`/api/admin/community/groups/${encodeURIComponent(groupId)}`);
      setDetail(r);
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function archive() {
    const reason = promptReason("Reason for archiving this group?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/groups/${encodeURIComponent(selected)}/archive`, { reason });
      setStatus({ ok: true, message: `Archived. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }
  async function freezeToggle(unfreeze) {
    const reason = promptReason(unfreeze ? "Reason to unfreeze?" : "Reason to freeze?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/groups/${encodeURIComponent(selected)}/freeze`, { reason, payload: unfreeze ? { unfreeze: true } : {} });
      setStatus({ ok: true, message: `frozen=${r.frozen}. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }
  async function removeMember(userId) {
    const reason = promptReason(`Reason to remove member ${userId.slice(0,8)}…?`);
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.delete(`/api/admin/community/groups/${encodeURIComponent(selected)}/members/${encodeURIComponent(userId)}?reason=${encodeURIComponent(reason)}`);
      setStatus({ ok: true, message: `Removed. audit_id=${r.audit_id}` });
      loadDetail(selected);
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }
  async function forceEndSession(sessionId) {
    const reason = promptReason("Reason to force-end session?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/groups/${encodeURIComponent(selected)}/sessions/${encodeURIComponent(sessionId)}/force-end`, { reason });
      setStatus({ ok: true, message: `Ended ${r.session_id}. audit_id=${r.audit_id}` });
      loadDetail(selected);
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }
  async function invalidateAttendance(rowId) {
    const reason = promptReason("Reason to invalidate this attendance row?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/groups/${encodeURIComponent(selected)}/attendance/${encodeURIComponent(rowId)}/invalidate`, { reason });
      setStatus({ ok: true, message: `Invalidated. audit_id=${r.audit_id}` });
      loadDetail(selected);
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter]);

  const group = detail?.group;
  const frozen = !!group?.frozen_at;

  return (
    <div className="space-y-5" data-testid="admin-groups-console">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance · study groups</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Study Groups Console</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Archive abusive groups, freeze a group temporarily, remove members, force-end stuck sessions, and invalidate forged attendance rows. Every write is audit-logged. Spec §4.1.
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="active">active</option>
            <option value="archived">archived</option>
            <option value="">all</option>
          </select>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}><RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}</button>
      </div>

      {status ? <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">{status.message}</div> : null}
      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Groups ({items?.total ?? 0})</h3>
          {!items?.items?.length ? <div className="text-sm text-muted-foreground">No groups.</div> : (
            <ul className="space-y-1 text-xs">
              {items.items.map((g) => (
                <li key={g.id}>
                  <button type="button" onClick={() => loadDetail(g.id)} className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted ${selected === g.id ? "bg-muted" : ""}`} data-testid={`group-row-${g.id}`}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{g.name}</span>
                      <span className="text-muted-foreground shrink-0">{g.status}{g.frozen_at ? " · frozen" : ""}</span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Detail</h3>
          {!detail ? <div className="text-sm text-muted-foreground">Select a group from the list.</div> : (
            <>
              <div className="text-xs space-y-1">
                <div><strong>id:</strong> <code>{group.id}</code></div>
                <div><strong>name:</strong> {group.name}</div>
                <div><strong>status:</strong> {group.status}{frozen ? " · frozen" : ""}</div>
                <div><strong>owner:</strong> <code className="font-mono">{group.created_by?.slice(0,8)}…</code></div>
                <div><strong>updated:</strong> {fmt(group.updated_at)}</div>
                {frozen ? <div className="text-amber-700"><strong>frozen reason:</strong> {group.frozen_reason}</div> : null}
              </div>
              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                {group.status === "active" ? (
                  <button type="button" className="btn small" onClick={archive} data-testid="group-archive"><Archive className="inline h-3 w-3" /> Archive</button>
                ) : null}
                <button type="button" className="btn small" onClick={() => freezeToggle(frozen)} data-testid="group-freeze">
                  <Snowflake className="inline h-3 w-3" /> {frozen ? "Unfreeze" : "Freeze"}
                </button>
              </div>

              <div className="pt-2 border-t border-border/40">
                <h4 className="text-xs font-semibold mb-1">Members ({detail.members?.length ?? 0})</h4>
                <ul className="space-y-1 text-xs">
                  {(detail.members || []).map((m) => (
                    <li key={m.id} className="flex justify-between items-center">
                      <span className="font-mono">{m.user_id.slice(0, 8)}… · {m.role} · {m.status}</span>
                      {m.status === "active" ? (
                        <button type="button" onClick={() => removeMember(m.user_id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`group-remove-${m.user_id}`}>
                          <UserMinus className="inline h-3 w-3" /> Remove
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-border/40">
                <h4 className="text-xs font-semibold mb-1">Recent sessions ({detail.sessions?.length ?? 0})</h4>
                <ul className="space-y-1 text-xs">
                  {(detail.sessions || []).map((s) => (
                    <li key={s.id} className="flex justify-between items-center">
                      <span className="font-mono">{s.id.slice(0,8)}… · {fmt(s.started_at)} {s.ended_at ? "→ ended" : "(active)"}</span>
                      {!s.ended_at ? (
                        <button type="button" onClick={() => forceEndSession(s.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`group-force-end-${s.id}`}>
                          <Square className="inline h-3 w-3" /> Force end
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>

              <div className="pt-2 border-t border-border/40">
                <h4 className="text-xs font-semibold mb-1">Recent attendance ({detail.attendance?.length ?? 0})</h4>
                <ul className="space-y-1 text-xs">
                  {(detail.attendance || []).map((a) => (
                    <li key={a.id} className="flex justify-between items-center">
                      <span className="font-mono">{a.user_id.slice(0,8)}… · presence {a.presence_minutes}m · {a.attendance_status}</span>
                      {a.attendance_status !== "absent" ? (
                        <button type="button" onClick={() => invalidateAttendance(a.id)} className="text-[11px] underline hover:no-underline text-red-700" data-testid={`group-att-invalidate-${a.id}`}>
                          <ShieldOff className="inline h-3 w-3" /> Invalidate
                        </button>
                      ) : null}
                    </li>
                  ))}
                </ul>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
