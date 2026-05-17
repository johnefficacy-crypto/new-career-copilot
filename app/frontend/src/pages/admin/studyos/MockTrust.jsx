import React, { useEffect, useState } from "react";
import { RotateCcw, ShieldAlert, Award } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

const TIERS = ["tier_1", "tier_1_5", "tier_2", "tier_3"];

function fmt(iso) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return String(iso);
  }
}

function tierClass(tier) {
  if (tier === "tier_1") return "bg-emerald-100 text-emerald-900";
  if (tier === "tier_1_5") return "bg-emerald-50 text-emerald-800";
  if (tier === "tier_2") return "bg-amber-100 text-amber-900";
  if (tier === "tier_3") return "bg-red-50 text-red-700";
  return "bg-muted text-muted-foreground";
}

export default function AdminStudyOsMockTrust() {
  const [filterUser, setFilterUser] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [queue, setQueue] = useState(null);
  const [err, setErr] = useState(null);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState(null);
  const [selectedId, setSelectedId] = useState(null);
  const [detail, setDetail] = useState(null);
  const [detailErr, setDetailErr] = useState(null);
  const [newTier, setNewTier] = useState("tier_2");
  const [evidenceUrl, setEvidenceUrl] = useState("");
  const [reason, setReason] = useState("");
  const [submitBusy, setSubmitBusy] = useState(false);

  async function loadQueue() {
    setBusy(true);
    setErr(null);
    try {
      const params = new URLSearchParams({ limit: "30" });
      if (filterUser) params.set("user_id", filterUser);
      if (filterStatus) params.set("verification_status", filterStatus);
      const r = await api.get(`/api/admin/study-os/mocks/queue?${params}`);
      setQueue(r);
    } catch (e) {
      setErr(getApiErrorMessage(e));
    } finally {
      setBusy(false);
    }
  }

  async function loadDetail(mockId) {
    setSelectedId(mockId);
    setDetail(null);
    setDetailErr(null);
    setStatus(null);
    try {
      const r = await api.get(`/api/admin/study-os/mocks/${encodeURIComponent(mockId)}`);
      setDetail(r);
      setNewTier(r.verification?.verification_tier || "tier_2");
      setEvidenceUrl(r.verification?.evidence_url || "");
    } catch (e) {
      setDetailErr(getApiErrorMessage(e));
    }
  }

  async function submitTier(e) {
    e.preventDefault();
    if (!selectedId) return;
    if (reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    setSubmitBusy(true);
    setStatus(null);
    try {
      const r = await api.post(
        `/api/admin/study-os/mocks/${encodeURIComponent(selectedId)}/set-verification-tier`,
        { reason: reason.trim(), payload: { tier: newTier, evidence_url: evidenceUrl || null } }
      );
      setStatus({
        ok: true,
        message: `Set tier=${r.verification_tier}, status=${r.verification_status}. audit_id=${r.audit_id}. ${r.note}`,
      });
      setReason("");
      loadDetail(selectedId);
      loadQueue();
    } catch (e) {
      setStatus({ ok: false, message: getApiErrorMessage(e) });
    } finally {
      setSubmitBusy(false);
    }
  }

  useEffect(() => {
    loadQueue();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-5" data-testid="admin-studyos-mocks">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · mocks
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Mock Trust Console</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Review recent mocks and adjust their verification tier. Tier changes do <strong>not</strong> trigger
          live leaderboard rewrites — the next scheduled recompute picks them up.
        </p>
      </div>

      <div className="rounded border border-amber-300/50 bg-amber-50/40 p-3 text-xs flex gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          Setting a tier writes <code>mock_score_verification</code> and an <code>admin_audit_logs</code> row.
          Use only after reviewing evidence — there is no auto-undo.
        </div>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">User ID (optional)</span>
          <input
            type="text"
            value={filterUser}
            onChange={(e) => setFilterUser(e.target.value)}
            className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono"
            placeholder="any user"
          />
        </label>
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Verification status</span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
          >
            <option value="">All</option>
            <option value="verified">verified</option>
            <option value="pending">pending</option>
            <option value="unverified">unverified</option>
          </select>
        </label>
        <button type="button" className="btn small" onClick={loadQueue} disabled={busy}>
          <RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Apply"}
        </button>
      </div>

      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Queue ({queue?.total ?? "—"})</h3>
          {!queue?.items?.length ? (
            <div className="text-sm text-muted-foreground">No mocks.</div>
          ) : (
            <ul className="space-y-1">
              {queue.items.map((m) => (
                <li key={m.id}>
                  <button
                    type="button"
                    onClick={() => loadDetail(m.id)}
                    className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted text-xs ${selectedId === m.id ? "bg-muted" : ""}`}
                    data-testid={`mock-row-${m.id}`}
                  >
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{m.test_name || m.exam_name}</span>
                      <span className="font-mono">{m.scored_marks}/{m.total_marks}</span>
                    </div>
                    <div className="flex justify-between gap-2 text-muted-foreground">
                      <span>{fmt(m.attempted_at)}</span>
                      <span className={`px-1.5 rounded ${tierClass(m.verification?.verification_tier)}`}>
                        {m.verification?.verification_tier || "no-verify"}
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <Award className="h-4 w-4" /> Mock detail
          </h3>
          {detailErr ? (
            <div className="text-sm text-red-700">{detailErr}</div>
          ) : !detail ? (
            <div className="text-sm text-muted-foreground">Select a mock from the queue.</div>
          ) : (
            <>
              <div className="text-xs space-y-1">
                <div><strong>id:</strong> <code>{detail.mock.id}</code></div>
                <div><strong>user_id:</strong> <code>{detail.mock.user_id}</code></div>
                <div><strong>score:</strong> {detail.mock.scored_marks} / {detail.mock.total_marks}</div>
                <div><strong>review_state:</strong> {detail.mock.review_state}</div>
                <div><strong>breakdowns:</strong> {detail.subject_breakdowns?.length ?? 0} subject rows</div>
                <div><strong>correction tasks:</strong> {detail.correction_tasks?.length ?? 0}</div>
                <div>
                  <strong>verification:</strong>{" "}
                  {detail.verification ? (
                    <span className={`px-1.5 rounded ${tierClass(detail.verification.verification_tier)}`}>
                      {detail.verification.verification_tier} · {detail.verification.verification_status}
                    </span>
                  ) : (
                    <em>none</em>
                  )}
                </div>
              </div>

              <form onSubmit={submitTier} className="space-y-2 pt-2 border-t border-border/40">
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">Set tier</span>
                  <select
                    value={newTier}
                    onChange={(e) => setNewTier(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
                  >
                    {TIERS.map((t) => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">Evidence URL (optional)</span>
                  <input
                    type="url"
                    value={evidenceUrl}
                    onChange={(e) => setEvidenceUrl(e.target.value)}
                    className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
                  />
                </label>
                <label className="block">
                  <span className="block text-xs text-muted-foreground mb-1">Reason (≥8 chars)</span>
                  <textarea
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    rows={2}
                    className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
                    data-testid="mock-tier-reason"
                  />
                </label>
                {status ? (
                  <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">
                    {status.message}
                  </div>
                ) : null}
                <button type="submit" className="btn small" disabled={submitBusy} data-testid="mock-tier-submit">
                  {submitBusy ? "Saving…" : "Set verification tier"}
                </button>
              </form>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
