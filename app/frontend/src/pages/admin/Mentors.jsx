import React, { useEffect, useState } from "react";
import { Search, UserCheck, ShieldCheck, RotateCcw, Pause, Play, CircleDollarSign } from "lucide-react";
import { api, getApiErrorMessage } from "../../lib/api";

function fmt(iso) {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
}

function badge(status) {
  if (status === "approved") return "bg-emerald-100 text-emerald-900";
  if (status === "suspended") return "bg-red-100 text-red-900";
  if (status === "rejected") return "bg-amber-100 text-amber-900";
  return "bg-muted text-muted-foreground";
}

function kycBadge(s) {
  if (s === "verified") return "bg-emerald-100 text-emerald-900";
  if (s === "failed") return "bg-red-100 text-red-900";
  if (s === "submitted") return "bg-amber-100 text-amber-900";
  return "bg-muted text-muted-foreground";
}

export default function AdminMentors() {
  const [items, setItems] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [kycFilter, setKycFilter] = useState("");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [status, setStatus] = useState(null);

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      if (kycFilter) params.set("kyc_status", kycFilter);
      const r = await api.get(`/api/admin/mentors?${params}`);
      setItems(r);
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail(userId) {
    setSelected(userId);
    setDetail(null);
    setDetailErr(null);
    try {
      const r = await api.get(`/api/admin/mentors/${encodeURIComponent(userId)}`);
      setDetail(r);
    } catch (e) {
      setDetailErr(getApiErrorMessage(e));
    }
  }

  async function setVerification(payload) {
    const reason = window.prompt("Reason for this verification change (≥8 chars)?");
    if (!reason || reason.trim().length < 8) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/mentors/${encodeURIComponent(selected)}/verification`, { reason: reason.trim(), payload });
      setStatus({ ok: true, message: `Updated. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function suspendOrReinstate(reinstate) {
    const reason = window.prompt(reinstate ? "Reason for reinstatement (≥8 chars)?" : "Reason for suspension (≥8 chars)?");
    if (!reason || reason.trim().length < 8) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/mentors/${encodeURIComponent(selected)}/suspend`, { reason: reason.trim(), payload: { reinstate } });
      setStatus({ ok: true, message: `Now ${r.status}. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function setPayoutHold(hold) {
    const reason = window.prompt(hold ? "Reason for payout hold (≥8 chars)?" : "Reason for clearing payout hold (≥8 chars)?");
    if (!reason || reason.trim().length < 8) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/mentors/${encodeURIComponent(selected)}/payout-hold`, { reason: reason.trim(), payload: { hold } });
      setStatus({ ok: true, message: `payout_hold=${r.payout_hold}. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter, kycFilter]);

  const filtered = (items?.items || []).filter((m) => {
    if (!query.trim()) return true;
    const needle = query.trim().toLowerCase();
    return (m.user_id || "").toLowerCase().includes(needle);
  });

  const v = detail?.verification || {};

  return (
    <div className="space-y-5" data-testid="admin-mentors">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Governance · mentor verification
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Mentor Verification Console</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Approve, reject, suspend, KYC-verify and payout-hold mentors. Every action is logged to{" "}
          <code>admin_audit_logs</code>. Spec: <code>docs/engineering/community-governance-spec-v1.md</code> §4.3.
        </p>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="">All</option>
            <option value="pending">pending</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="suspended">suspended</option>
          </select>
        </label>
        <label>
          <span className="block text-xs text-muted-foreground mb-1">KYC</span>
          <select value={kycFilter} onChange={(e) => setKycFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="">All</option>
            <option value="unverified">unverified</option>
            <option value="submitted">submitted</option>
            <option value="verified">verified</option>
            <option value="failed">failed</option>
          </select>
        </label>
        <label className="flex-1 max-w-md">
          <span className="block text-xs text-muted-foreground mb-1">Search by user_id</span>
          <div className="relative">
            <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} className="w-full pl-8 pr-3 py-1.5 text-sm border border-border/60 rounded bg-background font-mono" placeholder="user UUID substring" aria-label="Search by user id" />
          </div>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}>
          <RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}
        </button>
      </div>

      {status ? (<div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">{status.message}</div>) : null}
      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold flex items-center gap-2"><UserCheck className="h-4 w-4" /> Mentors ({items?.total ?? filtered.length})</h3>
          {!filtered.length ? (
            <div className="text-sm text-muted-foreground">No mentors match. Mentors without a verification row appear once you submit a verification.</div>
          ) : (
            <ul className="space-y-1 text-xs">
              {filtered.map((m) => (
                <li key={m.user_id}>
                  <button type="button" onClick={() => loadDetail(m.user_id)} className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted ${selected === m.user_id ? "bg-muted" : ""}`} data-testid={`mentor-row-${m.user_id}`}>
                    <div className="flex justify-between gap-2 items-center">
                      <span className="font-mono">{m.user_id.slice(0, 8)}…</span>
                      <span className="flex gap-1 items-center">
                        <span className={`px-1.5 rounded ${badge(m.status)}`}>{m.status}</span>
                        <span className={`px-1.5 rounded ${kycBadge(m.kyc_status)}`}>kyc: {m.kyc_status}</span>
                        {m.payout_hold ? <span className="px-1.5 rounded bg-red-50 text-red-700">payout-hold</span> : null}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2"><ShieldCheck className="h-4 w-4" /> Mentor detail</h3>
          {detailErr ? <div className="text-sm text-red-700" role="alert">{detailErr}</div> : null}
          {!detail ? (<div className="text-sm text-muted-foreground">Select a mentor from the list.</div>) : (
            <>
              <div className="text-xs space-y-1">
                <div><strong>user_id:</strong> <code>{detail.profile?.id}</code></div>
                <div><strong>email:</strong> {detail.profile?.email}</div>
                <div><strong>name:</strong> {detail.profile?.full_name}</div>
                <div><strong>verification:</strong>{" "}
                  {v.status ? <span className={`px-1.5 rounded ${badge(v.status)}`}>{v.status}</span> : <em>none (treated as pending)</em>}
                  {v.kyc_status ? <span className={`ml-1 px-1.5 rounded ${kycBadge(v.kyc_status)}`}>kyc: {v.kyc_status}</span> : null}
                  {v.payout_hold ? <span className="ml-1 px-1.5 rounded bg-red-50 text-red-700">payout-hold</span> : null}
                </div>
                <div><strong>last verified by:</strong> {v.verified_by_email || "—"} @ {fmt(v.verified_at)}</div>
                <div><strong>recent bookings:</strong> {detail.recent_bookings?.length ?? 0}</div>
                <div><strong>complaints (moderation queue):</strong> {detail.complaints?.length ?? 0}</div>
              </div>

              <div className="pt-2 border-t border-border/40 space-y-2">
                <div className="text-xs font-semibold">Verification actions</div>
                <div className="flex gap-2 flex-wrap">
                  <button type="button" className="btn small" onClick={() => setVerification({ status: "approved" })} data-testid="mentor-approve">Approve</button>
                  <button type="button" className="btn small" onClick={() => setVerification({ status: "rejected" })} data-testid="mentor-reject">Reject</button>
                  <button type="button" className="btn small" onClick={() => setVerification({ kyc_status: "verified" })} data-testid="mentor-kyc-verify">KYC verified</button>
                  <button type="button" className="btn small" onClick={() => setVerification({ kyc_status: "failed" })} data-testid="mentor-kyc-fail">KYC failed</button>
                </div>
                <div className="flex gap-2 flex-wrap">
                  {v.status === "suspended" ? (
                    <button type="button" className="btn small" onClick={() => suspendOrReinstate(true)} data-testid="mentor-reinstate"><Play className="inline h-3 w-3" /> Reinstate</button>
                  ) : (
                    <button type="button" className="btn small" onClick={() => suspendOrReinstate(false)} data-testid="mentor-suspend"><Pause className="inline h-3 w-3" /> Suspend</button>
                  )}
                  {v.payout_hold ? (
                    <button type="button" className="btn small" onClick={() => setPayoutHold(false)} data-testid="mentor-payout-clear"><CircleDollarSign className="inline h-3 w-3" /> Clear payout hold</button>
                  ) : (
                    <button type="button" className="btn small" onClick={() => setPayoutHold(true)} data-testid="mentor-payout-hold"><CircleDollarSign className="inline h-3 w-3" /> Hold payout</button>
                  )}
                </div>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
