import React, { useEffect, useState } from "react";
import { ShieldCheck, RotateCcw, Eye, X as XIcon, Check } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
}

function statusClass(s) {
  if (s === "approved") return "bg-emerald-100 text-emerald-900";
  if (s === "denied" || s === "expired") return "bg-red-100 text-red-900";
  if (s === "consumed") return "bg-blue-100 text-blue-900";
  if (s === "pending") return "bg-amber-100 text-amber-900";
  return "bg-muted text-muted-foreground";
}

export default function AdminContentAccessRequests() {
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending");
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  // Request creator state
  const [newUserId, setNewUserId] = useState("");
  const [newKind, setNewKind] = useState("note");
  const [newArtifactId, setNewArtifactId] = useState("");
  const [newReason, setNewReason] = useState("");

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const r = await api.get(`/api/admin/study-os/content-access/requests?${params}`);
      setItems(r);
    } catch (e) { setErr(getApiErrorMessage(e)); }
    finally { setBusy(false); }
  }

  async function createRequest(e) {
    e.preventDefault();
    if (newReason.trim().length < 8) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post("/api/admin/study-os/content-access/requests", {
        user_id: newUserId.trim(),
        artifact_kind: newKind,
        artifact_id: newArtifactId.trim(),
        reason: newReason.trim(),
      });
      setStatus({ ok: true, message: `Request ${r.request.id} created (pending). audit_id=${r.audit_id}` });
      setNewUserId(""); setNewArtifactId(""); setNewReason("");
      load();
    } catch (ex) { setStatus({ ok: false, message: getApiErrorMessage(ex) }); }
  }

  async function approveOrDeny(id, action) {
    const reason = window.prompt(`Reason for ${action} (≥8 chars)?`);
    if (!reason || reason.trim().length < 8) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/study-os/content-access/requests/${encodeURIComponent(id)}/${action}`, { reason: reason.trim() });
      setStatus({ ok: true, message: `${action} ok. audit_id=${r.audit_id}` });
      load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function redeem(id) {
    try {
      const r = await api.post(`/api/admin/study-os/content-access/requests/${encodeURIComponent(id)}/open`);
      const content = r.artifact;
      window.alert(`access_log_id=${r.access_log_id}\nFields: ${(r.fields_returned||[]).join(", ")}\n\n${JSON.stringify(content,null,2).slice(0,4000)}`);
      setStatus({ ok: true, message: `Redeemed. access_log_id=${r.access_log_id}` });
      load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="space-y-5" data-testid="admin-content-access">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · 4-eyes content access
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Content Access Requests</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Viewer-role operators request to open user-owned artifact content; an ops-role operator approves.
          Approval token is one-shot and expires after 24h. Both request and approve actions write to
          <code> admin_audit_logs</code> + <code>support_content_access</code>.
        </p>
      </div>

      <form onSubmit={createRequest} className="rounded border border-border/60 bg-card p-4 space-y-2" data-testid="content-access-create-form">
        <h3 className="text-sm font-semibold">New request</h3>
        <div className="grid gap-2 sm:grid-cols-2">
          <label>
            <span className="block text-xs text-muted-foreground mb-1">Target user UUID</span>
            <input type="text" value={newUserId} onChange={(e) => setNewUserId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono" />
          </label>
          <label>
            <span className="block text-xs text-muted-foreground mb-1">Artifact kind</span>
            <select value={newKind} onChange={(e) => setNewKind(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
              <option value="note">note</option>
              <option value="flashcard">flashcard</option>
              <option value="mistake">mistake</option>
            </select>
          </label>
          <label className="sm:col-span-2">
            <span className="block text-xs text-muted-foreground mb-1">Artifact UUID</span>
            <input type="text" value={newArtifactId} onChange={(e) => setNewArtifactId(e.target.value)} className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono" />
          </label>
          <label className="sm:col-span-2">
            <span className="block text-xs text-muted-foreground mb-1">Reason (≥8 chars)</span>
            <textarea value={newReason} onChange={(e) => setNewReason(e.target.value)} rows={2} className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background" />
          </label>
        </div>
        <button type="submit" className="btn small" data-testid="content-access-submit-create">Create request</button>
      </form>

      <div className="flex gap-2 items-end">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="consumed">consumed</option>
            <option value="denied">denied</option>
            <option value="expired">expired</option>
          </select>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}>
          <RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}
        </button>
      </div>

      {status ? (
        <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">{status.message}</div>
      ) : null}
      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <section className="rounded border border-border/60 bg-card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2">id</th>
              <th className="text-left p-2">status</th>
              <th className="text-left p-2">user</th>
              <th className="text-left p-2">kind</th>
              <th className="text-left p-2">requester</th>
              <th className="text-left p-2">approver</th>
              <th className="text-left p-2">created</th>
              <th className="text-left p-2">expires</th>
              <th className="text-left p-2">actions</th>
            </tr>
          </thead>
          <tbody>
            {!items?.items?.length ? (
              <tr><td colSpan={9} className="p-3 text-muted-foreground text-center">{busy ? "Loading…" : "No requests."}</td></tr>
            ) : items.items.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="p-2 font-mono">{r.id?.slice(0, 8)}…</td>
                <td className="p-2"><span className={`px-1.5 rounded ${statusClass(r.status)}`}>{r.status}</span></td>
                <td className="p-2 font-mono">{r.user_id?.slice(0, 8)}…</td>
                <td className="p-2">{r.artifact_kind}</td>
                <td className="p-2 truncate max-w-[18ch]" title={r.requested_by_email || ""}>{r.requested_by_email || r.requested_by?.slice(0,8) + "…"}</td>
                <td className="p-2 truncate max-w-[18ch]" title={r.approved_by_email || ""}>{r.approved_by_email || "—"}</td>
                <td className="p-2">{fmt(r.created_at)}</td>
                <td className="p-2">{fmt(r.expires_at)}</td>
                <td className="p-2 space-x-2">
                  {r.status === "pending" ? (
                    <>
                      <button type="button" className="text-[11px] underline hover:no-underline" onClick={() => approveOrDeny(r.id, "approve")} data-testid={`approve-${r.id}`}>
                        <Check className="inline h-3 w-3" /> Approve
                      </button>
                      <button type="button" className="text-[11px] underline hover:no-underline text-red-700" onClick={() => approveOrDeny(r.id, "deny")} data-testid={`deny-${r.id}`}>
                        <XIcon className="inline h-3 w-3" /> Deny
                      </button>
                    </>
                  ) : null}
                  {r.status === "approved" ? (
                    <button type="button" className="text-[11px] underline hover:no-underline" onClick={() => redeem(r.id)} data-testid={`open-${r.id}`}>
                      <Eye className="inline h-3 w-3" /> Open (one-shot)
                    </button>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="rounded border border-amber-300/50 bg-amber-50/40 p-3 text-xs flex gap-2">
        <ShieldCheck className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>4-eyes invariant enforced at both the API and DB layer: the approver UUID must differ from the requester UUID. Self-approval returns 409.</div>
      </div>
    </div>
  );
}
