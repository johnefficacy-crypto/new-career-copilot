import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus } from "lucide-react";
import { api } from "../lib/api";
import useApiAction from "../lib/hooks/useApiAction";

const STATUSES = ["not_started", "opened", "in_progress", "submitted", "skipped", "not_applicable"];

// Convert a datetime-local string (`YYYY-MM-DDTHH:MM` in the browser's local
// zone) into a UTC ISO string. The previous implementation used
// toISOString().slice(0,16) for display, which is UTC — that misled users
// in non-UTC zones because the browser then interpreted their edit as local
// time. Round-tripping through local-zone offsets keeps the displayed value
// aligned with the user's actual submitted-at instant.
function isoToLocalInput(iso) {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.valueOf())) return "";
  const offsetMs = d.getTimezoneOffset() * 60000;
  return new Date(d.getTime() - offsetMs).toISOString().slice(0, 16);
}

function localInputToIso(value) {
  if (!value) return null;
  const d = new Date(value);
  if (Number.isNaN(d.valueOf())) return null;
  return d.toISOString();
}

function fieldDisplay(a, drafts, field, fallback = "") {
  const draftRow = drafts[a.recruitment_id];
  if (draftRow && field in draftRow) return draftRow[field];
  return a[field] ?? fallback;
}

export default function Tracker() {
  const [items, setItems] = useState([]);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState("");
  // Per-row, per-field pending edits. Cleared on successful commit; retained
  // on failure so the user can fix and retry without re-typing.
  const [drafts, setDrafts] = useState({});
  const { run: runUpdate } = useApiAction();

  async function load() {
    const d = await api.get("/api/applications/me");
    setItems(Array.isArray(d?.items) ? d.items : []);
  }
  useEffect(() => {
    load().catch(() => setErr("Application tracker is temporarily unavailable."));
  }, []);

  function setDraft(recId, field, value) {
    setDrafts((d) => ({ ...d, [recId]: { ...(d[recId] || {}), [field]: value } }));
  }

  function clearDraftField(recId, field) {
    setDrafts((d) => {
      if (!d[recId]) return d;
      // Object rest deliberately drops the named key.
      // eslint-disable-next-line no-unused-vars
      const { [field]: _dropped, ...rest } = d[recId];
      const next = { ...d };
      if (Object.keys(rest).length === 0) delete next[recId];
      else next[recId] = rest;
      return next;
    });
  }

  async function commit(recId, field, transform = (v) => v) {
    const draftRow = drafts[recId];
    if (!draftRow || !(field in draftRow)) return;
    const raw = draftRow[field];
    const value = transform(raw);
    setSaving(recId);
    setErr("");
    const result = await runUpdate({
      action: () => api.put(`/api/applications/${recId}`, { [field]: value }),
      errorMessage: `Couldn't save ${field.replaceAll("_", " ")} — try again.`,
    });
    if (result.ok) {
      clearDraftField(recId, field);
      try {
        await load();
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error(e);
      }
    }
    setSaving(null);
  }

  async function commitImmediate(recId, patch) {
    setSaving(recId);
    setErr("");
    const result = await runUpdate({
      action: () => api.put(`/api/applications/${recId}`, patch),
      errorMessage: "Couldn't save change — try again.",
    });
    if (result.ok) {
      try {
        await load();
      } catch (e) {
        if (process.env.NODE_ENV !== "production") console.error(e);
      }
    }
    setSaving(null);
  }

  const grouped = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((s) => [s, []]));
    items.forEach((x) => {
      out[x.status || "not_started"] = [...(out[x.status || "not_started"] || []), x];
    });
    return out;
  }, [items]);

  function renderRow(a) {
    const rowSaving = saving === a.recruitment_id;
    const docsValue = (() => {
      const draftRow = drafts[a.recruitment_id];
      if (draftRow && "documents_pending" in draftRow) return draftRow.documents_pending;
      return Array.isArray(a.documents_pending) ? a.documents_pending.join(", ") : "";
    })();
    const feeAmountValue = fieldDisplay(a, drafts, "fee_amount", "");
    const submittedValue = (() => {
      const draftRow = drafts[a.recruitment_id];
      if (draftRow && "submitted_at" in draftRow) return draftRow.submitted_at;
      return isoToLocalInput(a.submitted_at);
    })();

    return (
      <div key={a.id} className="soft-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <div className="font-semibold">{a.recruitment?.name || a.recruitment_id}</div>
            <div className="text-xs text-muted-foreground">
              {a.recruitment?.organization || "—"} · deadline{" "}
              {a.recruitment?.apply_end_date
                ? new Date(a.recruitment.apply_end_date).toLocaleDateString()
                : "—"}
            </div>
          </div>
          <select
            className="input"
            value={a.status || "not_started"}
            onChange={(e) =>
              commitImmediate(a.recruitment_id, {
                status: e.target.value,
                submitted_at:
                  e.target.value === "submitted" && !a.submitted_at
                    ? new Date().toISOString()
                    : a.submitted_at,
              })
            }
            disabled={rowSaving}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="Application number"
            value={fieldDisplay(a, drafts, "application_number", "")}
            onChange={(e) =>
              setDraft(a.recruitment_id, "application_number", e.target.value)
            }
            onBlur={() => commit(a.recruitment_id, "application_number")}
            disabled={rowSaving}
          />
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!a.fee_paid}
              onChange={(e) =>
                commitImmediate(a.recruitment_id, { fee_paid: e.target.checked })
              }
              disabled={rowSaving}
            />{" "}
            Fee paid
          </label>
          <input
            className="input"
            placeholder="Fee amount"
            type="number"
            min="0"
            value={feeAmountValue ?? ""}
            onChange={(e) =>
              setDraft(a.recruitment_id, "fee_amount", e.target.value)
            }
            onBlur={() =>
              commit(a.recruitment_id, "fee_amount", (v) =>
                v === "" || v === null ? null : Number(v),
              )
            }
            disabled={rowSaving}
          />
          <input
            className="input md:col-span-2"
            placeholder="Documents pending (comma separated)"
            value={docsValue}
            onChange={(e) =>
              setDraft(a.recruitment_id, "documents_pending", e.target.value)
            }
            onBlur={() =>
              commit(a.recruitment_id, "documents_pending", (v) =>
                typeof v === "string"
                  ? v
                      .split(",")
                      .map((x) => x.trim())
                      .filter(Boolean)
                  : v || [],
              )
            }
            disabled={rowSaving}
          />
          <input
            className="input"
            type="datetime-local"
            value={submittedValue}
            onChange={(e) =>
              setDraft(a.recruitment_id, "submitted_at", e.target.value)
            }
            onBlur={() =>
              commit(a.recruitment_id, "submitted_at", (v) =>
                v ? localInputToIso(v) : null,
              )
            }
            disabled={rowSaving}
          />
        </div>
        <textarea
          className="input"
          placeholder="Notes"
          value={fieldDisplay(a, drafts, "notes", "")}
          onChange={(e) => setDraft(a.recruitment_id, "notes", e.target.value)}
          onBlur={() => commit(a.recruitment_id, "notes")}
          disabled={rowSaving}
        />
        <div className="text-xs text-muted-foreground">
          clicked_apply_at:{" "}
          {a.clicked_apply_at ? new Date(a.clicked_apply_at).toLocaleString() : "—"} ·
          submitted_at:{" "}
          {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}
        </div>
        {a.clicked_apply_at && !a.submitted_at && (
          <div className="text-xs text-clay-700">
            You opened the official form. Mark it submitted only after final submission.
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="tracker-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Application tracker
          </div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">
            Track every form honestly.
          </h1>
          <p className="text-muted-foreground mt-1">
            clicked_apply is telemetry only. Mark submitted only after final confirmation
            on official website.
          </p>
        </div>
        <Link to="/app/exams" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Open recruitments
        </Link>
      </div>

      {err && <div className="text-xs text-clay-700">{err}</div>}
      {items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <ListChecks className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">
            No applications tracked yet.
          </div>
          <div className="text-sm text-muted-foreground">
            Open a recruitment and click Apply to start tracking.
          </div>
        </div>
      ) : (
        STATUSES.map((status) => (
          <section key={status} className="space-y-3">
            <h2 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
              {status.replaceAll("_", " ")} · {grouped[status]?.length || 0}
            </h2>
            {(grouped[status] || []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No forms in this stage.</div>
            ) : (
              (grouped[status] || []).map(renderRow)
            )}
          </section>
        ))
      )}
      <style>{`.input { width: 100%; padding: 0.55rem 0.8rem; border-radius: 0.65rem; border: 1px solid hsl(var(--border)); background: white; font-size: 12px; }`}</style>
    </div>
  );
}
