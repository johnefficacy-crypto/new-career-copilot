import React, { useEffect, useState } from "react";
import { RotateCcw, Plus, FileText } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

const ENTITY_CONFIG = {
  "exam-families": {
    label: "Exam families",
    fields: [
      { key: "slug", label: "slug", required: true },
      { key: "name", label: "name", required: true },
      { key: "description", label: "description" },
      { key: "is_active", label: "is_active", type: "bool" },
    ],
    columns: ["slug", "name", "is_active", "created_at"],
  },
  exams: {
    label: "Exams",
    fields: [
      { key: "slug", label: "slug", required: true },
      { key: "name", label: "name", required: true },
      { key: "exam_family_id", label: "exam_family_id" },
      { key: "exam_type", label: "exam_type (recruitment|entrance|certification|opportunity|other)" },
      { key: "description", label: "description" },
      { key: "is_active", label: "is_active", type: "bool" },
    ],
    columns: ["slug", "name", "exam_type", "is_active", "created_at"],
  },
  "exam-cycles": {
    label: "Exam cycles",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "year", label: "year", required: true, type: "int" },
      { key: "cycle_name", label: "cycle_name", required: true },
      { key: "status", label: "status (expected|open|active|closed|completed|cancelled)" },
      { key: "notification_date", label: "notification_date (YYYY-MM-DD)" },
      { key: "application_start", label: "application_start (YYYY-MM-DD)" },
      { key: "application_end", label: "application_end (YYYY-MM-DD)" },
      { key: "exam_start", label: "exam_start (YYYY-MM-DD)" },
      { key: "exam_end", label: "exam_end (YYYY-MM-DD)" },
      { key: "source_url", label: "source_url" },
    ],
    columns: ["exam_id", "year", "cycle_name", "status"],
  },
  "exam-phases": {
    label: "Exam phases",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "phase_name", label: "phase_name", required: true },
      { key: "phase_slug", label: "phase_slug", required: true },
      { key: "exam_cycle_id", label: "exam_cycle_id" },
      { key: "phase_order", label: "phase_order", type: "int" },
      { key: "mode", label: "mode" },
      { key: "duration_mins", label: "duration_mins", type: "int" },
      { key: "total_questions", label: "total_questions", type: "int" },
      { key: "total_marks", label: "total_marks", type: "int" },
      { key: "status", label: "status (expected|active|completed|cancelled)" },
    ],
    columns: ["exam_id", "phase_name", "phase_order", "status"],
  },
  "syllabus-documents": {
    label: "Syllabus documents",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "document_type", label: "document_type (notification|syllabus_pdf|official_page|pattern_notice|corrigendum|other)", required: true },
      { key: "title", label: "title", required: true },
      { key: "source_url", label: "source_url" },
      { key: "storage_path", label: "storage_path" },
      { key: "exam_cycle_id", label: "exam_cycle_id" },
    ],
    columns: ["title", "document_type", "trust_status", "exam_id"],
  },
  "pyq-papers": {
    label: "PYQ papers",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "year", label: "year", required: true, type: "int" },
      { key: "exam_phase_id", label: "exam_phase_id" },
      { key: "paper_date", label: "paper_date (YYYY-MM-DD)" },
      { key: "shift", label: "shift" },
      { key: "paper_code", label: "paper_code" },
      { key: "source_url", label: "source_url" },
      { key: "source_type", label: "source_type (official|memory_based|coaching|community|aggregator|unknown)" },
    ],
    columns: ["year", "paper_code", "source_type", "trust_status"],
  },
  "exam-topic-coverage": {
    label: "Exam topic coverage",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "topic_id", label: "topic_id", required: true },
      { key: "exam_phase_id", label: "exam_phase_id" },
      { key: "priority", label: "priority (int)", type: "int" },
      { key: "is_high_yield", label: "is_high_yield", type: "bool" },
      { key: "is_active", label: "is_active", type: "bool" },
    ],
    columns: ["exam_id", "topic_id", "priority", "is_high_yield", "reviewer_status"],
  },
  "policy-updates": {
    label: "Policy updates",
    fields: [
      { key: "exam_id", label: "exam_id", required: true },
      { key: "update_type", label: "update_type (notification_change|cycle_change|...)", required: true },
      { key: "title", label: "title", required: true },
      { key: "summary", label: "summary" },
      { key: "source_type", label: "source_type (official|aggregator|research|opportunity|unknown)" },
      { key: "source_url", label: "source_url" },
      { key: "affects_syllabus", label: "affects_syllabus", type: "bool" },
      { key: "affects_plan", label: "affects_plan", type: "bool" },
    ],
    columns: ["title", "update_type", "reviewer_status", "source_type"],
  },
};

const ENTITY_KEYS = Object.keys(ENTITY_CONFIG);

function parseValue(field, raw) {
  if (raw === "" || raw == null) return undefined;
  if (field.type === "bool") return raw === "true";
  if (field.type === "int") {
    const n = parseInt(raw, 10);
    return Number.isFinite(n) ? n : undefined;
  }
  return raw;
}

export default function AdminExamIntelCms() {
  const [entity, setEntity] = useState("exam-families");
  const [items, setItems] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const [status, setStatus] = useState(null);
  const [showCreate, setShowCreate] = useState(false);
  const [formValues, setFormValues] = useState({});
  const [reason, setReason] = useState("");

  const cfg = ENTITY_CONFIG[entity];

  async function load() {
    setBusy(true);
    setErr(null);
    try {
      const r = await api.get(`/api/admin/exam-intelligence-cms/${entity}?limit=50`);
      setItems(r);
    } catch (e) {
      setErr(getApiErrorMessage(e));
      setItems(null);
    } finally {
      setBusy(false);
    }
  }

  async function submitCreate(e) {
    e.preventDefault();
    if (reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be ≥8 chars." });
      return;
    }
    const payload = {};
    for (const f of cfg.fields) {
      const v = parseValue(f, formValues[f.key]);
      if (v !== undefined) payload[f.key] = v;
    }
    try {
      const r = await api.post(`/api/admin/exam-intelligence-cms/${entity}`, {
        reason: reason.trim(),
        payload,
      });
      setStatus({ ok: true, message: `Created. audit_id=${r.audit_id}` });
      setShowCreate(false);
      setFormValues({});
      setReason("");
      load();
    } catch (ex) {
      setStatus({ ok: false, message: getApiErrorMessage(ex) });
    }
  }

  useEffect(() => {
    setItems(null);
    setStatus(null);
    setShowCreate(false);
    setFormValues({});
    setReason("");
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entity]);

  return (
    <div className="space-y-5" data-testid="admin-exam-intel-cms">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · exam intelligence CMS
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Exam Intelligence CMS</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Create exam families, exams, cycles, phases, syllabus documents, PYQ papers/questions, topic
          coverage, and policy updates. Per spec §12 #4: CMS <strong>feeds</strong> the review queue —
          rows with a review_status / trust_status land at <code>pending</code>; promote them via the
          existing review queue, not here.
        </p>
      </div>

      <div className="flex gap-2 items-end flex-wrap">
        <label>
          <span className="block text-xs text-muted-foreground mb-1">Entity</span>
          <select
            value={entity}
            onChange={(e) => setEntity(e.target.value)}
            className="px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
            data-testid="cms-entity-select"
          >
            {ENTITY_KEYS.map((k) => (
              <option key={k} value={k}>{ENTITY_CONFIG[k].label} · {k}</option>
            ))}
          </select>
        </label>
        <button type="button" className="btn small" onClick={load} disabled={busy}>
          <RotateCcw className="h-3 w-3" /> {busy ? "Loading…" : "Reload"}
        </button>
        <button
          type="button"
          className="btn small"
          onClick={() => setShowCreate((s) => !s)}
          data-testid="cms-toggle-create"
        >
          <Plus className="h-3 w-3" /> {showCreate ? "Cancel" : "New row"}
        </button>
      </div>

      {status ? (
        <div className={`text-sm ${status.ok ? "text-emerald-700" : "text-red-700"}`} role="status" aria-live="polite">
          {status.message}
        </div>
      ) : null}

      {err ? <div className="text-sm text-red-700" role="alert">{err}</div> : null}

      {showCreate ? (
        <form onSubmit={submitCreate} className="rounded border border-border/60 bg-card p-4 space-y-2" data-testid="cms-create-form">
          <h3 className="text-sm font-semibold">New {cfg.label} row</h3>
          <div className="grid gap-2 sm:grid-cols-2">
            {cfg.fields.map((f) => (
              <label key={f.key} className="block">
                <span className="block text-xs text-muted-foreground mb-1">
                  {f.label}{f.required ? <span className="text-red-700"> *</span> : null}
                </span>
                {f.type === "bool" ? (
                  <select
                    value={formValues[f.key] ?? ""}
                    onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
                    data-testid={`cms-field-${f.key}`}
                  >
                    <option value="">(skip)</option>
                    <option value="true">true</option>
                    <option value="false">false</option>
                  </select>
                ) : (
                  <input
                    type={f.type === "int" ? "number" : "text"}
                    value={formValues[f.key] ?? ""}
                    onChange={(e) => setFormValues((p) => ({ ...p, [f.key]: e.target.value }))}
                    className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
                    data-testid={`cms-field-${f.key}`}
                  />
                )}
              </label>
            ))}
          </div>
          <label className="block">
            <span className="block text-xs text-muted-foreground mb-1">Reason (≥8 chars, recorded in audit)</span>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={2}
              className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
              data-testid="cms-reason"
            />
          </label>
          <button type="submit" className="btn small" data-testid="cms-create-submit">
            Create
          </button>
        </form>
      ) : null}

      <section className="rounded border border-border/60 bg-card p-0 overflow-x-auto">
        <table className="w-full text-xs">
          <thead className="bg-muted/50">
            <tr>
              <th className="text-left p-2"><FileText className="inline h-3 w-3 mr-1" />id</th>
              {cfg.columns.map((c) => (
                <th key={c} className="text-left p-2">{c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {!items?.items?.length ? (
              <tr><td colSpan={cfg.columns.length + 1} className="p-3 text-muted-foreground text-center">
                {busy ? "Loading…" : "No rows."}
              </td></tr>
            ) : items.items.map((r) => (
              <tr key={r.id} className="border-t border-border/40">
                <td className="p-2 font-mono">{r.id?.slice(0, 8)}…</td>
                {cfg.columns.map((c) => (
                  <td key={c} className="p-2">
                    {r[c] == null ? "—" : typeof r[c] === "boolean" ? String(r[c]) : String(r[c]).slice(0, 60)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
        {items?.total != null ? (
          <div className="text-xs text-muted-foreground p-2 border-t border-border/40">
            total {items.total}, showing {items.items?.length ?? 0}
          </div>
        ) : null}
      </section>
    </div>
  );
}
