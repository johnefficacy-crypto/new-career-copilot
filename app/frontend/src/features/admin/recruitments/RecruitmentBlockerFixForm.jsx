import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { ErrorState } from "../../../shared/ui";

// Inline editor for the non-criteria recruitment blockers reported by
// validate-publish. Wraps PUT /api/admin/recruitments/{id} which only
// accepts a whitelist of editable fields — that endpoint also auto-demotes
// published rows back to needs_review on critical changes, so this form
// must not pretend to publish.
//
// Field map by blocker code:
//   organization_missing            -> organization_id
//   organization_unverified         -> link to /admin/organizations (cannot
//                                       verify from this surface)
//   source_provenance_missing       -> source_id
//   source_provenance_not_found     -> source_id
//   unverified_source_provenance    -> source_id (+ link to /admin/sources)
//   official_notification_url_missing            -> official_notification_url
//   official_apply_url_missing_while_open        -> official_apply_url
//   apply_dates_reversed / apply_dates_invalid   -> apply_start_date,
//                                                   apply_end_date
//   (also surfaces: total_vacancies, review_notes)
export default function RecruitmentBlockerFixForm({
  recruitment,
  blockers = [],
  sources = [],
  onChanged,
}) {
  const recruitmentId = recruitment?.id;
  const [organizations, setOrganizations] = useState([]);
  const [form, setForm] = useState(() => initialForm(recruitment));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);

  useEffect(() => {
    setForm(initialForm(recruitment));
  }, [recruitment?.id]); // eslint-disable-line react-hooks/exhaustive-deps

  // Load orgs only when an organization fix is plausibly needed; cheap
  // enough to fetch unconditionally inside this panel.
  useEffect(() => {
    let cancelled = false;
    api.get("/api/admin/organizations")
      .then((r) => { if (!cancelled) setOrganizations(r.items || []); })
      .catch((e) => { if (!cancelled) setError(e); });
    return () => { cancelled = true; };
  }, []);

  const verifiedNonAggregator = useMemo(
    () => (sources || []).filter((s) => s.is_verified && s.source_type !== "aggregator" && !s.discovery_only),
    [sources],
  );

  const blockerSet = new Set(blockers);
  const needsOrganization = blockerSet.has("organization_missing");
  const orgUnverified = blockerSet.has("organization_unverified");
  const needsNotification = blockerSet.has("official_notification_url_missing");
  const needsApply = blockerSet.has("official_apply_url_missing_while_open");
  const datesBad = blockerSet.has("apply_dates_reversed") || blockerSet.has("apply_dates_invalid");
  const sourceMissing = blockerSet.has("source_provenance_missing") || blockerSet.has("source_provenance_not_found");
  const sourceUnverified = blockerSet.has("unverified_source_provenance");

  const update = (patch) => setForm((prev) => ({ ...prev, ...patch }));

  const save = useCallback(async (payload) => {
    if (!recruitmentId) return;
    setBusy(true);
    setError(null);
    setMsg(null);
    try {
      await api.put(`/api/admin/recruitments/${recruitmentId}`, payload);
      setMsg("Saved. Re-validating publish readiness...");
      await onChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setBusy(false);
    }
  }, [recruitmentId, onChanged]);

  if (!recruitmentId) return null;
  if (!blockers.length) return null;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="recruitment-blocker-fix-form">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitment blocker fixes</div>
          <h3 className="font-heading text-lg">Inline edits for publish blockers</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Saving runs validate-publish again. Critical-field edits to a published recruitment
            demote it back to needs_review on the backend; publish stays gated.
          </p>
        </div>
      </div>

      {msg ? <div className="mt-3 rounded-xl border border-sage-200 bg-sage-50 p-2 text-xs text-sage-900">{msg}</div> : null}
      {error ? <ErrorState title="Save failed" message={error.message} /> : null}

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        {(needsOrganization || orgUnverified) && (
          <Field label="Organization" testId="fix-organization">
            <select
              className="input"
              value={form.organization_id || ""}
              onChange={(e) => update({ organization_id: e.target.value })}
              data-testid="fix-organization-select"
            >
              <option value="">Select organization...</option>
              {organizations.map((o) => (
                <option key={o.id} value={o.id}>{o.name}{o.is_verified ? " · verified" : " · unverified"}</option>
              ))}
            </select>
            {orgUnverified ? (
              <div className="mt-1 text-[11px] text-amber-700">
                Selected org is not verified.{" "}
                <a className="link-under" href="/admin/organizations">Open Organizations to verify</a>.
              </div>
            ) : null}
            <FieldActions onSave={() => save({ organization_id: form.organization_id })} busy={busy} disabled={!form.organization_id || form.organization_id === recruitment.organization_id} testId="save-organization" />
          </Field>
        )}

        {(sourceMissing || sourceUnverified) && (
          <Field label="Source provenance" testId="fix-source">
            <select
              className="input"
              value={form.source_id || ""}
              onChange={(e) => update({ source_id: e.target.value })}
              data-testid="fix-source-select"
            >
              <option value="">Select verified source...</option>
              {verifiedNonAggregator.map((s) => (
                <option key={s.id} value={s.id}>{s.org || s.source_name} · {s.source_type}</option>
              ))}
            </select>
            {sourceUnverified ? (
              <div className="mt-1 text-[11px] text-amber-700">
                Current source is not verified.{" "}
                <a className="link-under" href="/admin/sources">Open Source Registry</a>.
              </div>
            ) : null}
            <FieldActions onSave={() => save({ source_id: form.source_id })} busy={busy} disabled={!form.source_id || form.source_id === recruitment.source_id} testId="save-source" />
          </Field>
        )}

        {needsNotification && (
          <Field label="Official notification URL" testId="fix-notification-url">
            <input
              type="url"
              className="input"
              value={form.official_notification_url || ""}
              onChange={(e) => update({ official_notification_url: e.target.value })}
              data-testid="fix-notification-url-input"
            />
            <FieldActions onSave={() => save({ official_notification_url: form.official_notification_url })} busy={busy} disabled={!form.official_notification_url} testId="save-notification-url" />
          </Field>
        )}

        {needsApply && (
          <Field label="Official apply URL" testId="fix-apply-url">
            <input
              type="url"
              className="input"
              value={form.official_apply_url || ""}
              onChange={(e) => update({ official_apply_url: e.target.value })}
              data-testid="fix-apply-url-input"
            />
            <FieldActions onSave={() => save({ official_apply_url: form.official_apply_url })} busy={busy} disabled={!form.official_apply_url} testId="save-apply-url" />
          </Field>
        )}

        {datesBad && (
          <Field label="Apply window" testId="fix-dates" wide>
            <div className="grid grid-cols-2 gap-2">
              <input type="date" className="input" value={form.apply_start_date || ""} onChange={(e) => update({ apply_start_date: e.target.value })} data-testid="fix-apply-start" aria-label="Apply start date" />
              <input type="date" className="input" value={form.apply_end_date || ""} onChange={(e) => update({ apply_end_date: e.target.value })} data-testid="fix-apply-end" aria-label="Apply end date" />
            </div>
            <FieldActions
              onSave={() => save({ apply_start_date: form.apply_start_date || null, apply_end_date: form.apply_end_date || null })}
              busy={busy}
              disabled={!form.apply_start_date && !form.apply_end_date}
              testId="save-dates"
            />
          </Field>
        )}

        <Field label="Total vacancies (optional)" testId="fix-total-vacancies">
          <input
            type="number"
            min="0"
            className="input"
            value={form.total_vacancies ?? ""}
            onChange={(e) => update({ total_vacancies: e.target.value === "" ? null : Number(e.target.value) })}
            data-testid="fix-total-vacancies-input"
          />
          <FieldActions
            onSave={() => save({ total_vacancies: form.total_vacancies })}
            busy={busy}
            disabled={form.total_vacancies === recruitment.total_vacancies}
            testId="save-total-vacancies"
          />
        </Field>

        <Field label="Review notes" testId="fix-review-notes" wide>
          <textarea
            className="input min-h-[60px]"
            value={form.review_notes || ""}
            onChange={(e) => update({ review_notes: e.target.value })}
            data-testid="fix-review-notes-input"
          />
          <FieldActions
            onSave={() => save({ review_notes: form.review_notes })}
            busy={busy}
            disabled={(form.review_notes || "") === (recruitment.review_notes || "")}
            testId="save-review-notes"
          />
        </Field>
      </div>

      <style>{`.input { width:100%; padding: 0.4rem 0.7rem; border-radius: 0.5rem; background: white; border: 1px solid hsl(var(--border)); font-size: 12px; }`}</style>
    </section>
  );
}

function Field({ label, children, testId, wide }) {
  return (
    <label className={`block ${wide ? "sm:col-span-2" : ""}`} data-testid={testId}>
      <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">{label}</div>
      {children}
    </label>
  );
}

function FieldActions({ onSave, busy, disabled, testId }) {
  return (
    <div className="mt-1 flex justify-end">
      <button type="button" className="btn btn-ghost h-7 text-[11px]" onClick={onSave} disabled={busy || disabled} data-testid={testId}>
        {busy ? "Saving..." : "Save"}
      </button>
    </div>
  );
}

function initialForm(recruitment) {
  return {
    organization_id: recruitment?.organization_id || "",
    source_id: recruitment?.source_id || "",
    official_notification_url: recruitment?.official_notification_url || "",
    official_apply_url: recruitment?.official_apply_url || "",
    apply_start_date: recruitment?.apply_start_date || "",
    apply_end_date: recruitment?.apply_end_date || "",
    total_vacancies: recruitment?.total_vacancies ?? null,
    review_notes: recruitment?.review_notes || "",
  };
}
