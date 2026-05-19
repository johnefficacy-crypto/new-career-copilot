import React, { useEffect, useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ListChecks, Plus, FileText, Receipt, Trophy, Bell } from "lucide-react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";

// PR3 reorg: this page replaces the standalone /app/tracker (now an
// alias to /app/eligibility/tracker). The full Tracker.jsx logic moved
// here so there's exactly one implementation. The grouped-by-status
// timeline is retained; chip filters (All / Applications / Documents /
// Results / Policy) and a free-text search were layered on top per the
// PR3 page contract.

const STATUSES = ["not_started", "opened", "in_progress", "submitted", "skipped", "not_applicable"];

const STATUS_TO_BUCKET = {
  not_started: "applications",
  opened: "applications",
  in_progress: "applications",
  submitted: "applications",
  skipped: "applications",
  not_applicable: "applications",
};

const FILTER_CHIPS = [
  { id: "all", label: "All" },
  { id: "applications", label: "Applications" },
  { id: "documents", label: "Documents" },
  { id: "results", label: "Results" },
  { id: "policy", label: "Policy" },
];

function bucketIcon(bucket) {
  switch (bucket) {
    case "documents":
      return Receipt;
    case "results":
      return Trophy;
    case "policy":
      return Bell;
    default:
      return FileText;
  }
}

function rowBucket(a) {
  if (Array.isArray(a.documents_pending) && a.documents_pending.length > 0) return "documents";
  if (a.status === "submitted") return "results";
  return STATUS_TO_BUCKET[a.status || "not_started"] || "applications";
}

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

export default function EligibilityTrackerPage() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(null);
  const [err, setErr] = useState("");
  const [drafts, setDrafts] = useState({});
  const [chip, setChip] = useState("all");
  const [q, setQ] = useState("");
  const { run: runUpdate } = useApiAction();

  async function load() {
    setLoading(true);
    try {
      const d = await api.get("/api/applications/me");
      setItems(Array.isArray(d?.items) ? d.items : []);
      setErr("");
    } catch (e) {
      setErr("Application tracker is temporarily unavailable.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function setDraft(recId, field, value) {
    setDrafts((d) => ({ ...d, [recId]: { ...(d[recId] || {}), [field]: value } }));
  }

  function clearDraftField(recId, field) {
    setDrafts((d) => {
      if (!d[recId]) return d;
      // eslint-disable-next-line no-unused-vars
      const { [field]: _dropped, ...rest } = d[recId];
      const next = { ...d };
      if (Object.keys(rest).length === 0) delete next[recId];
      else next[recId] = rest;
      return next;
    });
  }

  function patchLocalRow(recId, patch, serverRow) {
    setItems((prev) =>
      prev.map((row) => {
        if (row.recruitment_id !== recId && row.id !== recId) return row;
        if (serverRow && typeof serverRow === "object" && serverRow.recruitment_id) {
          return { ...row, ...serverRow };
        }
        return { ...row, ...patch };
      }),
    );
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
      patchLocalRow(recId, { [field]: value }, result.data);
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
      patchLocalRow(recId, patch, result.data);
    }
    setSaving(null);
  }

  const filteredItems = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return items.filter((a) => {
      if (chip !== "all" && rowBucket(a) !== chip) return false;
      if (!needle) return true;
      const haystack = [
        a.recruitment?.name,
        a.recruitment?.organization,
        a.application_number,
        a.notes,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [items, chip, q]);

  const grouped = useMemo(() => {
    const out = Object.fromEntries(STATUSES.map((s) => [s, []]));
    filteredItems.forEach((x) => {
      out[x.status || "not_started"] = [...(out[x.status || "not_started"] || []), x];
    });
    return out;
  }, [filteredItems]);

  function renderRow(a) {
    const rowSaving = saving === a.recruitment_id;
    const bucket = rowBucket(a);
    const BucketIcon = bucketIcon(bucket);
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
    const ctaSlug = a.recruitment?.slug || a.recruitment_id;

    return (
      <div key={a.id} className="soft-card rounded-2xl p-5 space-y-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-start gap-3 min-w-0">
            <span
              className="h-9 w-9 grid place-items-center rounded-lg bg-clay-100 text-clay-700 shrink-0"
              aria-hidden="true"
            >
              <BucketIcon className="h-4 w-4" />
            </span>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <div className="font-semibold truncate">
                  {a.recruitment?.name || a.recruitment_id}
                </div>
                <span className="text-[10px] uppercase tracking-[0.18em] px-2 py-0.5 rounded-full bg-clay-100 text-clay-800">
                  Recruitment
                </span>
              </div>
              <div className="text-xs text-muted-foreground">
                {a.recruitment?.organization || "—"} · deadline{" "}
                {a.recruitment?.apply_end_date
                  ? new Date(a.recruitment.apply_end_date).toLocaleDateString()
                  : "—"}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Link
              to={`/app/eligibility/exams/${ctaSlug}`}
              className="text-[12px] font-semibold link-under text-clay-700"
            >
              View recruitment →
            </Link>
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
                  {s.replaceAll("_", " ")}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid md:grid-cols-3 gap-3">
          <input
            className="input"
            placeholder="Application number"
            value={fieldDisplay(a, drafts, "application_number", "")}
            onChange={(e) => setDraft(a.recruitment_id, "application_number", e.target.value)}
            onBlur={() => commit(a.recruitment_id, "application_number")}
            disabled={rowSaving}
          />
          <label className="text-xs flex items-center gap-2">
            <input
              type="checkbox"
              checked={!!a.fee_paid}
              onChange={(e) => commitImmediate(a.recruitment_id, { fee_paid: e.target.checked })}
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
            onChange={(e) => setDraft(a.recruitment_id, "fee_amount", e.target.value)}
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
            onChange={(e) => setDraft(a.recruitment_id, "documents_pending", e.target.value)}
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
            onChange={(e) => setDraft(a.recruitment_id, "submitted_at", e.target.value)}
            onBlur={() =>
              commit(a.recruitment_id, "submitted_at", (v) => (v ? localInputToIso(v) : null))
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
          submitted_at: {a.submitted_at ? new Date(a.submitted_at).toLocaleString() : "—"}
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
    <section data-testid="eligibility-tracker-page" aria-labelledby="eligibility-tracker-heading">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2
            id="eligibility-tracker-heading"
            className="font-heading text-2xl font-semibold tracking-tight"
          >
            Track every form honestly.
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            clicked_apply is telemetry only. Mark submitted only after final confirmation on the
            official website.
          </p>
        </div>
        <Link to="/app/eligibility/exams" className="btn btn-primary">
          <Plus className="h-4 w-4" />
          Open recruitments
        </Link>
      </div>

      <div className="flex items-center gap-3 flex-wrap mb-4">
        <div className="flex flex-wrap gap-2" role="tablist" aria-label="Tracker filters">
          {FILTER_CHIPS.map((c) => (
            <button
              key={c.id}
              type="button"
              role="tab"
              aria-selected={chip === c.id}
              data-testid={`tracker-chip-${c.id}`}
              onClick={() => setChip(c.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2 ${
                chip === c.id
                  ? "bg-clay-500 text-white"
                  : "bg-white/70 border border-border hover:border-clay-300"
              }`}
            >
              {c.label}
            </button>
          ))}
        </div>
        <input
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Search applications…"
          className="flex-1 max-w-xs px-4 py-2 rounded-full bg-white/80 border border-border text-sm"
          data-testid="tracker-search"
          aria-label="Search applications"
        />
      </div>

      {err && <div className="text-xs text-clay-700 mb-3">{err}</div>}

      {loading ? (
        <div role="status" aria-live="polite" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="soft-card rounded-2xl p-5 animate-pulse h-32" />
          ))}
          <span className="sr-only">Loading tracker</span>
        </div>
      ) : items.length === 0 ? (
        <div className="soft-card rounded-2xl p-10 text-center">
          <ListChecks className="h-6 w-6 text-clay-500 mx-auto" />
          <div className="mt-3 font-heading text-lg font-semibold">No applications tracked yet.</div>
          <div className="text-sm text-muted-foreground">
            Open a recruitment and click Apply to start tracking.
          </div>
          <Link to="/app/eligibility/exams" className="btn btn-primary mt-4 inline-flex">
            Browse eligible recruitments
          </Link>
        </div>
      ) : filteredItems.length === 0 ? (
        <div className="soft-card rounded-2xl p-8 text-center text-sm text-muted-foreground">
          No rows match this filter or search.
        </div>
      ) : (
        STATUSES.map((status) => (
          <section key={status} className="space-y-3 mb-6">
            <h3 className="text-sm uppercase tracking-wider text-muted-foreground font-semibold">
              {status.replaceAll("_", " ")} · {grouped[status]?.length || 0}
            </h3>
            {(grouped[status] || []).length === 0 ? (
              <div className="text-xs text-muted-foreground">No forms in this stage.</div>
            ) : (
              (grouped[status] || []).map(renderRow)
            )}
          </section>
        ))
      )}

      <style>{`.input { width: 100%; padding: 0.55rem 0.8rem; border-radius: 0.65rem; border: 1px solid hsl(var(--border)); background: white; font-size: 12px; }`}</style>
    </section>
  );
}
