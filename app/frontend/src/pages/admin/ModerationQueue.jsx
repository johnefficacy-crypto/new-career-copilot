import React, { useEffect, useState } from "react";
import { adminModerationService } from "../../services/studyToolsService";

const SEVERITIES = [
  { value: "p0", label: "P0 — Imminent harm" },
  { value: "p1", label: "P1 — Misinformation / fraud" },
  { value: "p2", label: "P2 — Off-topic / spam" },
  { value: "p3", label: "P3 — Minor" },
];
const RESOLUTIONS = [
  "no_action", "content_removed", "user_warned", "user_suspended",
  "user_banned", "edit_required", "escalated_legal", "duplicate",
];

export default function ModerationQueue() {
  const [items, setItems] = useState([]);
  const [stats, setStats] = useState(null);
  const [status, setStatus] = useState("open");
  const [severity, setSeverity] = useState("");
  const [selected, setSelected] = useState(null);
  const [detail, setDetail] = useState(null);

  const load = async () => {
    const params = {};
    if (status) params.status = status;
    if (severity) params.severity = severity;
    const [q, s] = await Promise.all([adminModerationService.queue(params), adminModerationService.stats()]);
    setItems(q.items || []);
    setStats(s);
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => { load(); }, [status, severity]);

  const openDetail = async (id) => {
    setSelected(id);
    const d = await adminModerationService.get(id);
    setDetail(d);
  };

  const claim = async (id) => { await adminModerationService.claim(id); load(); if (selected === id) openDetail(id); };
  const resolve = async (id, resolution, notes) => { await adminModerationService.resolve(id, { resolution, notes }); load(); setSelected(null); setDetail(null); };
  const dismiss = async (id) => { await adminModerationService.status(id, { status: "dismissed", note: "Dismissed" }); load(); setSelected(null); setDetail(null); };
  const escalate = async (id) => { await adminModerationService.status(id, { status: "escalated", note: "Escalated" }); load(); };

  return (
    <div className="space-y-6">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Trust ops</div>
        <h1 className="font-heading text-3xl font-semibold tracking-tight mt-1">Moderation queue</h1>
        <p className="text-muted-foreground mt-1 text-sm">Cross-surface report triage with versioned severity rubric.</p>
      </div>

      {stats && (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Stat label="Open" value={stats.open} />
          <Stat label="In review" value={stats.in_review} />
          <Stat label="Resolved" value={stats.resolved_24h} />
          {Object.entries(stats.by_severity || {}).map(([k, v]) => (
            <Stat key={k} label={`Open ${k.toUpperCase()}`} value={v} />
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <select className="px-3 py-2 rounded-xl border border-border bg-background" value={status} onChange={(e) => setStatus(e.target.value)}>
          <option value="open">Open</option>
          <option value="in_review">In review</option>
          <option value="escalated">Escalated</option>
          <option value="resolved">Resolved</option>
          <option value="dismissed">Dismissed</option>
          <option value="">All</option>
        </select>
        <select className="px-3 py-2 rounded-xl border border-border bg-background" value={severity} onChange={(e) => setSeverity(e.target.value)}>
          <option value="">All severities</option>
          {SEVERITIES.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
      </div>

      <div className="space-y-2">
        {items.length === 0 ? (
          <div className="soft-card rounded-2xl p-6 text-sm text-muted-foreground text-center">Queue is empty.</div>
        ) : items.map((i) => (
          <div key={i.id} className="soft-card rounded-xl p-4 flex items-start gap-3 cursor-pointer" onClick={() => openDetail(i.id)}>
            <span className={`pill text-[10px] ${i.severity === "p0" ? "pill-clay" : ""}`}>{i.severity?.toUpperCase()}</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold">{i.entity_type} · {i.entity_id?.slice(0, 8)}…</div>
              <div className="text-xs text-muted-foreground truncate">{i.reason}</div>
            </div>
            <span className="pill text-[10px]">{i.status}</span>
            {i.status === "open" && (
              <button className="btn btn-secondary text-xs" onClick={(e) => { e.stopPropagation(); claim(i.id); }}>Claim</button>
            )}
          </div>
        ))}
      </div>

      {detail && (
        <DetailDrawer
          detail={detail}
          onClose={() => { setSelected(null); setDetail(null); }}
          onResolve={resolve}
          onDismiss={dismiss}
          onEscalate={escalate}
        />
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="text-xs uppercase tracking-wide text-muted-foreground">{label}</div>
      <div className="text-2xl font-heading font-semibold mt-1">{value}</div>
    </div>
  );
}

function DetailDrawer({ detail, onClose, onResolve, onDismiss, onEscalate }) {
  const [resolution, setResolution] = useState("no_action");
  const [notes, setNotes] = useState("");
  const i = detail.item;
  return (
    <div className="fixed inset-0 z-50 bg-black/40 grid place-items-center p-4" onClick={onClose}>
      <div className="soft-card rounded-2xl bg-background w-full max-w-2xl p-5 space-y-3 max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <div className="font-heading text-xl font-semibold">Report detail</div>
          <button onClick={onClose} className="text-muted-foreground text-sm">Close</button>
        </div>
        <div className="space-y-1 text-sm">
          <div><b>Entity:</b> {i.entity_type} · {i.entity_id}</div>
          <div><b>Severity:</b> {i.severity?.toUpperCase()} (rubric {i.severity_rubric_version})</div>
          <div><b>Status:</b> {i.status}</div>
          <div><b>Reason:</b> {i.reason}</div>
          {i.reason_code && <div><b>Code:</b> {i.reason_code}</div>}
          {i.reporter_id && <div><b>Reporter:</b> {i.reporter_id}</div>}
          {i.assigned_to && <div><b>Assigned to:</b> {i.assigned_to}</div>}
          {i.resolution && <div><b>Resolution:</b> {i.resolution}</div>}
        </div>

        <div className="border-t border-border pt-3">
          <div className="text-sm font-semibold mb-2">Event log</div>
          <div className="space-y-1 text-xs">
            {(detail.events || []).map((e) => (
              <div key={e.id}>
                {new Date(e.created_at).toLocaleString()} · <b>{e.event_type}</b>
                {e.from_value && ` ${e.from_value} →`}{e.to_value && ` ${e.to_value}`}
                {e.note && ` — ${e.note}`}
              </div>
            ))}
          </div>
        </div>

        {i.status !== "resolved" && i.status !== "dismissed" && (
          <div className="border-t border-border pt-3 space-y-2">
            <div className="text-sm font-semibold">Resolve</div>
            <select className="w-full px-3 py-2 rounded-xl border border-border bg-background" value={resolution} onChange={(e) => setResolution(e.target.value)}>
              {RESOLUTIONS.map((r) => <option key={r} value={r}>{r}</option>)}
            </select>
            <textarea className="w-full px-3 py-2 rounded-xl border border-border bg-background" placeholder="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} />
            <div className="flex flex-wrap gap-2 justify-end">
              <button className="btn btn-secondary" onClick={() => onDismiss(i.id)}>Dismiss</button>
              <button className="btn btn-secondary" onClick={() => onEscalate(i.id)}>Escalate</button>
              <button className="btn btn-primary" onClick={() => onResolve(i.id, resolution, notes)}>Resolve</button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
