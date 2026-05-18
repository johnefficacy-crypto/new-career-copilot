import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, FileJson, X } from "lucide-react";
import { api } from "../../lib/api";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";

function formatTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  const days = ["sun", "mon", "tue", "wed", "thu", "fri", "sat"];
  const months = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];
  return `${hh}:${mm}\n${days[d.getDay()]} ${d.getDate()} ${months[d.getMonth()]}`;
}

function AuditDrawer({ event, onClose }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!event, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!event) return null;
  return (
    <div className="fixed inset-0 z-50 flex justify-end" style={{ background: "rgba(26, 24, 21, 0.35)" }}>
      <div className="absolute inset-0" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="audit-detail-title"
        className="oc"
        style={{ position: "relative", height: "100%", width: "min(100%, 640px)", overflow: "auto", borderLeft: "1px solid var(--rule)" }}
      >
        <div style={{ padding: "16px 20px" }}>
          <div className="row" style={{ justifyContent: "space-between", alignItems: "flex-start" }}>
            <div>
              <div className="lbl">Audit event</div>
              <h2 id="audit-detail-title" className="oc-title" style={{ fontSize: 22, marginTop: 4 }}>{event.action || "Unknown action"}</h2>
            </div>
            <button ref={closeRef} type="button" className="btn small" onClick={onClose} aria-label="Close audit details">
              <X className="h-4 w-4" />
            </button>
          </div>
          <div className="grid2" style={{ marginTop: 16 }}>
            <Info label="when" value={event.created_at || event.at} />
            <Info label="actor" value={event.actor_email || event.actor} />
            <Info label="entity" value={`${event.entity_type || ""}:${event.entity_id || event.target || ""}`} />
            <Info label="event id" value={event.id} />
          </div>
          <div className="card" style={{ marginTop: 16 }}>
            <div className="card-head">
              <div className="row"><FileJson className="h-4 w-4" /><strong style={{ fontFamily: "var(--fmono)", fontSize: 12 }}>Payload</strong></div>
            </div>
            <div className="card-body">
              <div className="tline-payload" style={{ maxHeight: "60vh" }}>
                {JSON.stringify({ old_value: event.old_value, new_value: event.new_value, notes: event.notes }, null, 2)}
              </div>
            </div>
          </div>
        </div>
      </aside>
    </div>
  );
}

function Info({ label, value }) {
  return (
    <div className="field">
      <div className="field-lbl">{label}</div>
      <div className="field-val" style={{ wordBreak: "break-word" }}>{value || "—"}</div>
    </div>
  );
}

export default function AdminAudit() {
  const [items, setItems] = useState([]);
  const [err, setErr] = useState("");
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(null);

  const load = async () => {
    setLoading(true); setErr("");
    try {
      // Backend requires `entity_type` (admin_eligibility.py:list_audit_entries
      // is entity-scoped by contract; calling without it returns 422).
      // TODO: when this page grows a filter UI, source entity_type from it.
      const d = await api.get("/api/admin/audit?entity_type=recruitment");
      setItems(d.items || []);
    } catch (e) {
      setErr(e.message || "Failed");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return items;
    return items.filter((event) => `${event.actor_email || event.actor || ""} ${event.action || ""} ${event.entity_type || ""} ${event.entity_id || event.target || ""}`.toLowerCase().includes(needle));
  }, [items, query]);

  if (err?.includes("403")) {
    return (
      <div className="card" data-testid="admin-audit">
        <div className="card-body row" style={{ alignItems: "flex-start", gap: 12 }}>
          <AlertTriangle className="h-5 w-5" style={{ color: "var(--blocker)" }} />
          <div>
            <h2 className="oc-title" style={{ fontSize: 18 }}>Audit access restricted</h2>
            <div className="anno" style={{ marginTop: 4 }}>You do not have <code>audit.view</code> permission.</div>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="stack" data-testid="admin-audit">
      <section className="scrn" style={{ padding: 0, border: "none" }}>
        <div className="scrn-head">
          <div>
            <div className="lbl">Governance · audit</div>
            <h2 className="oc-title disp" style={{ fontSize: 22, marginTop: 4 }}>Audit timeline</h2>
            <div className="anno" style={{ marginTop: 4 }}>Review admin actions. Click any row for the full payload.</div>
          </div>
          <span className="scrn-tag">inline · scoped to admin</span>
        </div>

        <div className="card" style={{ marginBottom: 12 }}>
          <div className="card-body">
            <div className="lbl" style={{ marginBottom: 5 }}>Search</div>
            <input className="input" value={query} onChange={(e) => setQuery(e.target.value)} placeholder="actor / action / entity" />
          </div>
        </div>

        {err ? <div className="err-row">{err}</div> : null}
        {loading ? (
          <div className="stack">
            <div className="skel" style={{ height: 50 }} />
            <div className="skel" style={{ height: 50 }} />
            <div className="skel" style={{ height: 50 }} />
          </div>
        ) : null}

        {!loading && !err && filtered.length === 0 ? (
          <div className="empty"><div className="empty-title">No audit events</div>Adjust the search to inspect more events.</div>
        ) : null}

        {!loading && !err && filtered.length > 0 ? (
          <div className="card">
            <div className="card-head">
              <h4 className="oc-title">Recent events</h4>
              <span className="row-sub">{filtered.length} event{filtered.length === 1 ? "" : "s"}</span>
            </div>
            <div className="timeline">
              {filtered.slice(0, 200).map((event) => (
                <button
                  key={event.id}
                  type="button"
                  className="tline-row"
                  onClick={() => setSelected(event)}
                  style={{ width: "100%", background: "transparent", border: 0, borderBottom: "1px solid var(--rule-soft)", textAlign: "left", cursor: "pointer", color: "inherit", fontFamily: "inherit" }}
                >
                  <div className="tline-time" style={{ whiteSpace: "pre" }}>{formatTime(event.created_at || event.at)}</div>
                  <div>
                    <div className="tline-action">{event.action || "unknown.action"}</div>
                    <div className="tline-sub">
                      by <strong>{event.actor_email || event.actor || "system"}</strong>
                      {event.entity_type ? ` · ${event.entity_type}:${(event.entity_id || event.target || "").slice(0, 12)}` : ""}
                    </div>
                    {event.notes ? <div className="tline-payload" style={{ maxHeight: 50 }}>{event.notes}</div> : null}
                  </div>
                </button>
              ))}
            </div>
            <div className="card-foot">
              <button type="button" className="btn ghost small" onClick={load}>Refresh</button>
            </div>
          </div>
        ) : null}
      </section>

      <AuditDrawer event={selected} onClose={() => setSelected(null)} />
    </div>
  );
}
