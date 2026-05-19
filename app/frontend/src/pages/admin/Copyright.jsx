import React, { useEffect, useState } from "react";
import { adminCopyrightService } from "../../services/studyToolsService";

const STATUSES = [
  "received", "triage", "valid", "content_removed",
  "rejected", "counter_notice_received", "reinstated", "withdrawn",
];

export default function Copyright() {
  const [claims, setClaims] = useState([]);
  const [stats, setStats] = useState({});
  const [status, setStatus] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    const params = {};
    if (status) params.status = status;
    const [list, s] = await Promise.all([adminCopyrightService.list(params), adminCopyrightService.stats()]);
    setClaims(list.claims || []);
    setStats(s);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status]);

  const triage = async (id, severity) => { await adminCopyrightService.triage(id, { severity }); load(); refresh(id); };
  const resolve = async (id, resolution, notes) => { await adminCopyrightService.resolve(id, { resolution, notes }); load(); setSelected(null); };
  const refresh = async (id) => {
    const d = await adminCopyrightService.get(id);
    setSelected(d);
  };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Trust ops</div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Copyright & takedown</h1>
        <p className="text-muted-foreground mt-1 text-sm">DMCA / IP claims from external rights-holders.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
        {STATUSES.slice(0, 6).map((s) => (
          <Stat key={s} label={s.replace(/_/g, " ")} value={stats[s] || 0} />
        ))}
      </div>

      <div className="flex gap-2">
        <select className="px-3 py-2 rounded-xl border border-border bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="">All statuses</option>
          {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {claims.length === 0 ? (
          <div className="soft-card rounded-2xl p-6 text-sm text-muted-foreground text-center">No claims.</div>
        ) : claims.map((c) => (
          <div key={c.id} className="soft-card rounded-xl p-4 flex items-start gap-3 cursor-pointer" onClick={() => refresh(c.id)}>
            <span className="pill text-[10px]">{c.claim_type?.toUpperCase()}</span>
            <span className="pill text-[10px]">{c.severity?.toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{c.work_title}</div>
              <div className="text-xs text-muted-foreground truncate">{c.claimant_name} · {c.claimant_email}</div>
              <div className="text-xs text-muted-foreground truncate">{c.infringing_url}</div>
            </div>
            <span className="pill text-[10px]">{c.status}</span>
          </div>
        ))}
      </div>

      {selected && (
        <Drawer detail={selected} onClose={() => setSelected(null)} onTriage={triage} onResolve={resolve} />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-3">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-xl font-heading font-semibold mt-1">{value}</div>
    </div>
  );
}

function Drawer({ detail, onClose, onTriage, onResolve }) {
  const c = detail.claim;
  const [notes, setNotes] = useState("");
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="soft-card rounded-2xl bg-background w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-heading text-xl font-semibold">Claim detail</div>
          <button onClick={onClose} className="text-sm text-muted-foreground">Close</button>
        </div>
        <div className="space-y-1 text-sm">
          <div><b>Claimant:</b> {c.claimant_name} · {c.claimant_email}</div>
          {c.claimant_org && <div><b>Org:</b> {c.claimant_org}</div>}
          <div><b>Work:</b> {c.work_title}</div>
          <div><b>Description:</b> <span className="whitespace-pre-wrap">{c.work_description}</span></div>
          <div><b>Infringing URL:</b> <a href={c.infringing_url} className="underline" target="_blank" rel="noreferrer">{c.infringing_url}</a></div>
          <div><b>Target:</b> {c.target_entity_type} {c.target_entity_id ? `· ${c.target_entity_id}` : ""}</div>
          <div><b>Type / severity:</b> {c.claim_type} · {c.severity}</div>
          <div><b>Status:</b> {c.status}</div>
          {c.resolution_notes && <div><b>Notes:</b> {c.resolution_notes}</div>}
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-sm font-semibold">Triage severity</div>
          <div className="flex gap-2">
            {["p0", "p1", "p2", "p3"].map((s) => (
              <button key={s} className="btn btn-secondary" onClick={() => onTriage(c.id, s)}>{s.toUpperCase()}</button>
            ))}
          </div>
        </div>

        <div className="border-t border-border pt-3 space-y-2">
          <div className="text-sm font-semibold">Resolve</div>
          <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="Resolution notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
          <div className="flex justify-end gap-2">
            <button className="btn btn-secondary" onClick={() => onResolve(c.id, "rejected", notes)}>Reject</button>
            <button className="btn btn-secondary" onClick={() => onResolve(c.id, "withdrawn", notes)}>Withdraw</button>
            <button className="btn btn-primary" onClick={() => onResolve(c.id, "content_removed", notes)}>Remove content</button>
          </div>
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-sm font-semibold mb-2">Event log</div>
          <div className="space-y-1 text-xs">
            {(detail.events || []).map((e) => (
              <div key={e.id}>
                {new Date(e.created_at).toLocaleString()} · <b>{e.event_type}</b>
                {e.to_value && ` → ${e.to_value}`}{e.note && ` — ${e.note}`}
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
