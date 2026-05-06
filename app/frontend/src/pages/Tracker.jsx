import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus } from "lucide-react";
import { api } from "../lib/api";

const STATUSES = ["not_started", "opened", "in_progress", "submitted", "skipped", "not_applicable"];

export default function Tracker() {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState("");

  async function load() {
    const d = await api.get("/api/applications/me");
    setItems(Array.isArray(d?.items) ? d.items : []);
  }
  useEffect(() => { load().catch(() => setErr("Application tracker is temporarily unavailable.")); }, []);

  async function update(recId, patch) {
    setSaving(recId);
    setErr("");
    try {
      await api.put(`/api/applications/${recId}`, patch);
      await load();
    } catch (e) {
      setErr(e.message || "Failed to update application.");
    } finally { setSaving(null); }
  }

  const grouped = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((s) => [s, []]));
    items.forEach((x) => { out[x.status || "not_started"] = [...(out[x.status || "not_started"] || []), x]; });
    return out;
  }, [items]);

  return (
    <div className="space-y-6" data-testid="tracker-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Application tracker</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Track every form honestly.</h1>
          <p className="text-muted-foreground mt-1">clicked_apply is telemetry only. Mark submitted only after final confirmation on official website.</p>
        </div>
        <Link to="/app/exams" className="btn btn-primary"><Plus className="h-4 w-4" />Open recruitments</Link>
      </div>

      {err && <div className="text-xs text-clay-700">{err}</div>}
      {items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <ListChecks className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">No applications tracked yet.</div>
          <div className="text-sm text-muted-foreground">Open a recruitment and click Apply to start tracking.</div>
        </div>
      ) : STATUSES.map((status) => (
        <section key={status} className="space-y-3">
          <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">{status.replaceAll("_", " ")} · {grouped[status]?.length || 0}</h2>
          {(grouped[status] || []).length === 0 ? <div className="text-xs text-muted-foreground">No forms in this stage.</div> : (grouped[status] || []).map((a) => (
            <div key={a.id} className="soft-card rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between gap-3 flex-wrap">
                <div>
                  <div className="font-semibold">{a.recruitment?.name || a.recruitment_id}</div>
                  <div className="text-xs text-muted-foreground">{a.recruitment?.organization || "—"} · deadline {a.recruitment?.apply_end_date ? new Date(a.recruitment.apply_end_date).toLocaleDateString() : "—"}</div>
                </div>
                <select className="input" value={a.status || "not_started"} onChange={(e) => update(a.recruitment_id, { status: e.target.value, submitted_at: e.target.value === "submitted" && !a.submitted_at ? new Date().toISOString() : a.submitted_at })} disabled={saving === a.recruitment_id}>
                  {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              <div className="grid md:grid-cols-3 gap-3">
                <input className="input" placeholder="Application number" defaultValue={a.application_number || ""} onBlur={(e) => update(a.recruitment_id, { application_number: e.target.value })} />
                <label className="text-xs flex items-center gap-2"><input type="checkbox" defaultChecked={!!a.fee_paid} onChange={(e) => update(a.recruitment_id, { fee_paid: e.target.checked })} /> Fee paid</label>
                <input className="input" placeholder="Fee amount" type="number" min="0" defaultValue={a.fee_amount ?? ""} onBlur={(e) => update(a.recruitment_id, { fee_amount: e.target.value === "" ? null : Number(e.target.value) })} />
                <input className="input md:col-span-2" placeholder="Documents pending (comma separated)" defaultValue={Array.isArray(a.documents_pending) ? a.documents_pending.join(", ") : ""} onBlur={(e) => update(a.recruitment_id, { documents_pending: e.target.value ? e.target.value.split(",").map((x) => x.trim()).filter(Boolean) : [] })} />
                <input className="input" type="datetime-local" defaultValue={a.submitted_at ? new Date(a.submitted_at).toISOString().slice(0, 16) : ""} onBlur={(e) => update(a.recruitment_id, { submitted_at: e.target.value ? new Date(e.target.value).toISOString() : null })} />
              </div>
              <textarea className="input" placeholder="Notes" defaultValue={a.notes || ""} onBlur={(e) => update(a.recruitment_id, { notes: e.target.value })} />
              <div className="text-xs text-muted-foreground">clicked_apply_at: {a.clicked_apply_at ? new Date(a.clicked_apply_at).toLocaleString() : "—"} · submitted_at: {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}</div>
              {a.clicked_apply_at && !a.submitted_at && <div className="text-xs text-clay-700">You opened the official form. Mark it submitted only after final submission.</div>}
            </div>
          ))}
        </section>
      ))}
      <style>{`.input { width: 100%; padding: 0.55rem 0.8rem; border-radius: 0.65rem; border: 1px solid hsl(var(--border)); background: white; font-size: 12px; }`}</style>
    </div>
  );
}
