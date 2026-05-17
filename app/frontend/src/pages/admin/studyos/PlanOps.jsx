import React, { useState } from "react";
import { ShieldAlert, ZapOff, RotateCcw, Square, ListX } from "lucide-react";
import { api, getApiErrorMessage } from "../../../lib/api";

function StatusLine({ status }) {
  if (!status) return null;
  const cls = status.ok ? "text-emerald-700" : "text-red-700";
  return (
    <div className={`text-sm ${cls}`} role="status" aria-live="polite">
      {status.message}
      {status.auditId ? (
        <span className="ml-2 text-xs text-muted-foreground">audit_id: <code>{status.auditId}</code></span>
      ) : null}
    </div>
  );
}

function ActionCard({ icon: Icon, title, description, fields, onSubmit, ctaLabel, danger }) {
  const [busy, setBusy] = useState(false);
  const [reason, setReason] = useState("");
  const [extra, setExtra] = useState(() => fields.reduce((a, f) => ({ ...a, [f.key]: "" }), {}));
  const [status, setStatus] = useState(null);

  async function handle(e) {
    e.preventDefault();
    if (reason.trim().length < 8) {
      setStatus({ ok: false, message: "Reason must be at least 8 characters." });
      return;
    }
    setBusy(true);
    setStatus(null);
    try {
      const result = await onSubmit({ reason: reason.trim(), payload: extra });
      setStatus({ ok: true, message: result.message || "Done.", auditId: result.audit_id });
    } catch (err) {
      setStatus({ ok: false, message: getApiErrorMessage(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <form onSubmit={handle} className={`rounded border p-4 space-y-3 ${danger ? "border-red-300/60 bg-red-50/30" : "border-border/60 bg-card"}`}>
      <div className="flex items-start gap-3">
        <Icon className={`h-5 w-5 mt-0.5 ${danger ? "text-red-700" : "text-muted-foreground"}`} />
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold">{title}</h3>
          <p className="text-xs text-muted-foreground mt-0.5">{description}</p>
        </div>
      </div>

      {fields.map((f) => (
        <label key={f.key} className="block">
          <span className="block text-xs font-medium text-muted-foreground mb-1">{f.label}</span>
          <input
            type="text"
            value={extra[f.key]}
            onChange={(e) => setExtra((p) => ({ ...p, [f.key]: e.target.value }))}
            placeholder={f.placeholder || ""}
            className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
            data-testid={`planops-field-${f.key}`}
          />
        </label>
      ))}

      <label className="block">
        <span className="block text-xs font-medium text-muted-foreground mb-1">Reason (≥8 chars, recorded in audit)</span>
        <textarea
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          rows={2}
          className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background"
          placeholder="why are you doing this?"
          data-testid="planops-reason"
        />
      </label>

      <div className="flex items-center justify-between">
        <StatusLine status={status} />
        <button
          type="submit"
          disabled={busy}
          className={`btn small ${danger ? "btn-danger" : ""}`}
          data-testid={`planops-submit-${title.replace(/\s+/g, "-").toLowerCase()}`}
        >
          {busy ? "Working…" : ctaLabel}
        </button>
      </div>
    </form>
  );
}

export default function AdminStudyOsPlanOps() {
  const [userId, setUserId] = useState("");
  const [active, setActive] = useState("");

  const target = active || userId.trim();

  function postOps(path, body) {
    return api.post(`/api/admin/study-os/users/${encodeURIComponent(target)}/${path}`, body);
  }

  return (
    <div className="space-y-5" data-testid="admin-studyos-planops">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · plan ops
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Plan Ops</h1>
        <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
          Audit-gated write actions for one user. Every action requires a reason ≥8 characters, writes to{" "}
          <code>admin_audit_logs</code>, and (for state changes the engine consumes) emits a{" "}
          <code>study_adaptation_events</code> row with <code>trigger_source='admin'</code>.
        </p>
      </div>

      <div className="rounded border border-amber-300/50 bg-amber-50/40 p-3 text-xs flex gap-2">
        <ShieldAlert className="h-4 w-4 text-amber-700 flex-shrink-0 mt-0.5" />
        <div>
          These actions modify a real user's study state. Spec §12 default applied: regen overwrites the applied
          plan only (no separately-persisted draft). Use the Inspector to confirm the user first.
        </div>
      </div>

      <div className="flex items-end gap-2">
        <label className="flex-1 max-w-md">
          <span className="block text-xs font-medium text-muted-foreground mb-1">Target user (UUID)</span>
          <input
            type="text"
            value={userId}
            onChange={(e) => setUserId(e.target.value)}
            placeholder="paste a user UUID from the Inspector"
            className="w-full px-2 py-1.5 text-sm border border-border/60 rounded bg-background font-mono"
            data-testid="planops-target-input"
          />
        </label>
        <button
          type="button"
          className="btn small"
          onClick={() => setActive(userId.trim())}
          disabled={!userId || userId.trim().length < 6}
          data-testid="planops-target-lock"
        >
          Lock target
        </button>
        {active ? (
          <span className="text-xs text-muted-foreground">
            Active target: <code className="font-mono">{active}</code>
          </span>
        ) : null}
      </div>

      {!target ? (
        <div className="text-sm text-muted-foreground">Enter a user UUID and lock the target to enable actions.</div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <ActionCard
            icon={RotateCcw}
            title="Preview draft plan"
            description="Compute a fresh draft plan envelope without persisting anything. Use to inspect the diff before applying."
            fields={[]}
            ctaLabel="Preview"
            onSubmit={async (body) => {
              const r = await postOps("plan-ops/preview-draft", body);
              return { audit_id: r.audit_id, message: r.draft?.generated ? `Draft ready: ${r.draft.task_count ?? r.draft.after_tasks?.length ?? "?"} tasks, risk ${r.draft.risk_level ?? "—"}` : "Draft could not be generated." };
            }}
          />

          <ActionCard
            icon={ZapOff}
            title="Apply plan (regenerate)"
            description="Force-apply a fresh plan for this user. Persists tasks, writes a plan version row, and emits engine + admin adaptation events."
            danger
            fields={[]}
            ctaLabel="Apply"
            onSubmit={async (body) => {
              const r = await postOps("plan-ops/apply", body);
              return { audit_id: r.audit_id, message: r.result?.applied ? `Applied. version=${r.result.version_number ?? "?"}, tasks=${r.result.task_count ?? "?"}, risk=${r.result.risk_level ?? "—"}` : "Apply did not persist a new plan." };
            }}
          />

          <ActionCard
            icon={ListX}
            title="Skip a stuck task"
            description="Mark one task as skipped. Refuses tasks that are already completed/skipped."
            fields={[{ key: "task_id", label: "Task ID", placeholder: "task UUID" }]}
            ctaLabel="Skip task"
            onSubmit={async (body) => {
              if (!body.payload.task_id) {
                const err = new Error("task_id is required");
                err.detail = "task_id is required";
                throw err;
              }
              const r = await postOps("plan-ops/skip-task", body);
              return { audit_id: r.audit_id, message: `Task ${r.task_id} → ${r.status}.` };
            }}
          />

          <ActionCard
            icon={RotateCcw}
            title="Reset carry-forward backlog"
            description="Skip every task currently in status='carried_forward' for this user (capped at 200 per call). Use before a fresh apply when the user has a wall of carry-forwards."
            danger
            fields={[]}
            ctaLabel="Reset backlog"
            onSubmit={async (body) => {
              const r = await postOps("plan-ops/reset-carry-forward", body);
              return { audit_id: r.audit_id, message: `Cleared ${r.cleared} carried-forward task(s).` };
            }}
          />

          <ActionCard
            icon={Square}
            title="Force-close focus session"
            description="Close a stuck focus session for this user. If session_id is blank, picks the most recent open session. Original notes are preserved with an [admin:…] marker."
            danger
            fields={[{ key: "session_id", label: "Session ID (optional)", placeholder: "leave blank to pick the open session" }]}
            ctaLabel="Force close"
            onSubmit={async (body) => {
              const r = await postOps("focus/force-close", body);
              return { audit_id: r.audit_id, message: `Session ${r.session_id} closed at ${r.ended_at}.` };
            }}
          />
        </div>
      )}
    </div>
  );
}
