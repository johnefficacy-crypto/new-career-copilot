import React, { useEffect, useState } from "react";
import { RotateCcw, Check, X as XIcon, EyeOff, Merge, FileEdit, Shield } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function fmt(iso) { if (!iso) return "—"; try { return new Date(iso).toLocaleString(); } catch { return String(iso); } }
function promptReason(label = "Reason (≥8 chars)?") {
  const r = window.prompt(label);
  if (!r || r.trim().length < 8) return null;
  return r.trim();
}
function statusClass(s) {
  if (s === "approved") return "bg-emerald-100 text-emerald-900";
  if (s === "rejected" || s === "dmca_removed") return "bg-red-100 text-red-900";
  if (s === "pending_review") return "bg-amber-100 text-amber-900";
  if (s === "hidden") return "bg-muted text-muted-foreground";
  return "bg-muted text-muted-foreground";
}

export default function ResourcesReviewQueue() {
  const [items, setItems] = useState(null);
  const [statusFilter, setStatusFilter] = useState("pending_review");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState(null);
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  async function load() {
    setBusy(true); setErr(null);
    try {
      const params = new URLSearchParams({ limit: "50" });
      if (statusFilter) params.set("status", statusFilter);
      const r = await api.get(`/api/admin/community/resources?${params}`);
      setItems(r);
    } catch (e) { setErr(getApiErrorMessage(e)); } finally { setBusy(false); }
  }
  async function loadDetail(id) {
    setSelected(id); setDetail(null);
    try {
      const r = await api.get(`/api/admin/community/resources/${encodeURIComponent(id)}`);
      setDetail(r);
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function decision(action, extra = {}) {
    const reason = promptReason(`Reason for ${action}?`);
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    const payload = { action, ...extra };
    try {
      const r = await api.post(`/api/admin/community/resources/${encodeURIComponent(selected)}/decision`, { reason, payload });
      setStatus({ ok: true, message: `${action} ok. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  async function edit() {
    const title = window.prompt("New title (blank to skip)?") || undefined;
    const summary = window.prompt("New summary (blank to skip)?") || undefined;
    const sourceUrl = window.prompt("New source URL (blank to skip)?") || undefined;
    const metadata = {};
    if (title) metadata.title = title;
    if (summary) metadata.summary = summary;
    if (sourceUrl) metadata.source_url = sourceUrl;
    if (!Object.keys(metadata).length) { setStatus({ ok: false, message: "No edits provided." }); return; }
    decision("edit", { metadata });
  }

  async function approve() {
    const tier = window.prompt("Trust attribution (official|community|coaching|unknown, blank for unknown)?") || undefined;
    decision("approve", tier ? { trust_attribution: tier } : {});
  }

  async function mergeInto() {
    const canonical = window.prompt("Canonical resource UUID to merge into?");
    if (!canonical) return;
    const reason = promptReason("Reason for merge?");
    if (!reason) { setStatus({ ok: false, message: "Reason ≥8 chars required." }); return; }
    try {
      const r = await api.post(`/api/admin/community/resources/${encodeURIComponent(selected)}/merge-into`, { reason, payload: { canonical_id: canonical.trim() } });
      setStatus({ ok: true, message: `Merged. audit_id=${r.audit_id}` });
      loadDetail(selected); load();
    } catch (e) { setStatus({ ok: false, message: getApiErrorMessage(e) }); }
  }

  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [statusFilter]);

  return (
    <div className="space-y-5" data-testid="admin-resources-queue">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Governance · community resources</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Resource Review Queue</h1>
        <p className="mt-1 text-sm text-muted-foreground max-w-2xl">
          Approve, reject, edit, hide, DMCA-remove, and dedupe community resources. Spec §4.4.
        </p>
      </div>

      <div className="flex gap-2 items-end">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Status</span>
          <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background">
            <option value="pending_review">pending_review</option>
            <option value="approved">approved</option>
            <option value="rejected">rejected</option>
            <option value="hidden">hidden</option>
            <option value="dmca_removed">dmca_removed</option>
            <option value="">all</option>
          </select>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}><RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}</button>
      </div>

      {items?.counts ? (
        <div className="flex flex-wrap gap-2 text-xs">
          {Object.entries(items.counts).map(([k, v]) => (
            <span key={k} className={`inline-flex items-center gap-1 px-2 py-0.5 rounded ${statusClass(k)}`}>{k}: <span className="font-mono">{v}</span></span>
          ))}
        </div>
      ) : null}

      {status ? <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">{status.message}</div> : null}
      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded border border-border/60 bg-card p-4 space-y-2">
          <h3 className="text-sm font-semibold">Queue ({items?.total ?? 0})</h3>
          {!items?.items?.length ? <div className="text-sm text-muted-foreground">No resources.</div> : (
            <ul className="space-y-1 text-xs">
              {items.items.map((r) => (
                <li key={r.id}>
                  <button type="button" onClick={() => loadDetail(r.id)} className={`w-full text-left px-2 py-1.5 rounded hover:bg-muted ${selected === r.id ? "bg-muted" : ""}`} data-testid={`resource-row-${r.id}`}>
                    <div className="flex justify-between gap-2">
                      <span className="font-medium truncate">{r.title || "(no title)"}</span>
                      <span className={`px-1.5 rounded shrink-0 ${statusClass(r.status)}`}>{r.status}</span>
                    </div>
                    <div className="text-muted-foreground">{r.resource_type} · {r.exam_slug || "—"} · ▲{r.upvote_count} ⚑{r.report_count}</div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section className="rounded border border-border/60 bg-card p-4 space-y-3">
          <h3 className="text-sm font-semibold">Detail</h3>
          {!detail ? <div className="text-sm text-muted-foreground">Select a resource.</div> : (
            <>
              <div className="text-xs space-y-1">
                <div><strong>title:</strong> {detail.resource.title}</div>
                <div><strong>status:</strong> <span className={`px-1.5 rounded ${statusClass(detail.resource.status)}`}>{detail.resource.status}</span></div>
                <div><strong>trust attribution:</strong> {detail.resource.trust_attribution || "unknown"}</div>
                <div><strong>uploader:</strong> <code className="font-mono">{detail.resource.created_by?.slice(0,8)}…</code></div>
                <div><strong>votes / reports:</strong> ▲{detail.resource.upvote_count} ⚑{detail.resource.report_count}</div>
                <div><strong>source:</strong> <a href={detail.resource.source_url} target="_blank" rel="noopener noreferrer" className="underline">{detail.resource.source_url}</a></div>
                {detail.resource.merged_into ? <div className="text-amber-700"><strong>merged into:</strong> <code className="font-mono">{detail.resource.merged_into}</code></div> : null}
                <div className="pt-2"><strong>dedupe candidates ({detail.dedupe_candidates?.length ?? 0}):</strong>
                  <ul className="ml-4 list-disc">
                    {(detail.dedupe_candidates || []).map((c) => (
                      <li key={c.id} className="font-mono">{c.id.slice(0,8)}… · {c.status} · {fmt(c.created_at)}</li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="flex flex-wrap gap-2 pt-2 border-t border-border/40">
                {detail.resource.status === "pending_review" ? (
                  <>
                    <button type="button" className="btn small" onClick={approve} data-testid="resource-approve"><Check className="inline h-3 w-3" /> Approve</button>
                    <button type="button" className="btn small" onClick={() => decision("reject")} data-testid="resource-reject"><XIcon className="inline h-3 w-3" /> Reject</button>
                  </>
                ) : null}
                <button type="button" className="btn small" onClick={edit} data-testid="resource-edit"><FileEdit className="inline h-3 w-3" /> Edit</button>
                {detail.resource.status !== "hidden" ? (
                  <button type="button" className="btn small" onClick={() => decision("hide")} data-testid="resource-hide"><EyeOff className="inline h-3 w-3" /> Hide</button>
                ) : null}
                <button type="button" className="btn small" onClick={() => decision("dmca")} data-testid="resource-dmca"><Shield className="inline h-3 w-3" /> DMCA remove</button>
                <button type="button" className="btn small" onClick={mergeInto} data-testid="resource-merge"><Merge className="inline h-3 w-3" /> Merge into…</button>
              </div>
            </>
          )}
        </section>
      </div>
    </div>
  );
}
