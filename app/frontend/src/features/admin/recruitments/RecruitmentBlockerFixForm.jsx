import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../../lib/api";
import { ErrorState } from "../../../shared/ui";

const OFFICIAL_URL_FIELDS = [
  "official_notification_url",
  "official_apply_url",
  "source_pdf_url",
];
const AGGREGATOR_HINTS = ["sarkari", "freejob", "jobalert"];

function hostOf(url) {
  if (!url || typeof url !== "string") return null;
  try {
    const u = new URL(url);
    return (u.hostname || "").toLowerCase() || null;
  } catch {
    return null;
  }
}

function looksAggregator(host) {
  if (!host) return false;
  return AGGREGATOR_HINTS.some((h) => host.includes(h));
}

function detectRecruitmentHosts(recruitment) {
  if (!recruitment) return [];
  const seen = new Set();
  const out = [];
  for (const f of OFFICIAL_URL_FIELDS) {
    const url = recruitment[f];
    const host = hostOf(url);
    if (!host || seen.has(host) || looksAggregator(host)) continue;
    seen.add(host);
    out.push({ host, url });
  }
  return out;
}

function hostsInRegistry(sources) {
  const out = new Set();
  for (const s of sources || []) {
    const h = hostOf(s?.official_url);
    if (h) out.add(h);
  }
  return out;
}

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
  onSourcesChanged,
}) {
  const recruitmentId = recruitment?.id;
  const [organizations, setOrganizations] = useState([]);
  const [form, setForm] = useState(() => initialForm(recruitment));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [msg, setMsg] = useState(null);
  const [draftBusy, setDraftBusy] = useState(false);
  const [verifyBusy, setVerifyBusy] = useState(false);
  const [showManualAdd, setShowManualAdd] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualUrl, setManualUrl] = useState("");
  const [manualType, setManualType] = useState("official_html");

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

  // Show every non-aggregator, active source (drafts included). The
  // submit path enforces verified-only via the backend gate, so widening
  // the dropdown only improves discoverability of newly-created drafts.
  const eligibleSources = useMemo(
    () => (sources || []).filter((s) => s.source_type !== "aggregator" && !s.discovery_only && s.is_active !== false),
    [sources],
  );
  const verifiedNonAggregator = useMemo(
    () => eligibleSources.filter((s) => s.is_verified),
    [eligibleSources],
  );

  const detectedHosts = useMemo(() => detectRecruitmentHosts(recruitment), [recruitment]);
  const registeredHosts = useMemo(() => hostsInRegistry(sources), [sources]);
  const unknownHosts = useMemo(
    () => detectedHosts.filter((c) => !registeredHosts.has(c.host)),
    [detectedHosts, registeredHosts],
  );

  const selectedSource = useMemo(
    () => (sources || []).find((s) => s.id === form.source_id) || null,
    [sources, form.source_id],
  );
  const selectedIsUnverified = !!selectedSource && !selectedSource.is_verified;

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

  const draftAllUnknown = useCallback(async () => {
    if (!recruitmentId) return;
    setError(null); setMsg(null); setDraftBusy(true);
    try {
      const res = await api.post(`/api/admin/recruitments/${recruitmentId}/draft-sources`, {});
      const created = res?.created || [];
      const existing = res?.existing || [];
      setMsg(`Drafts: ${created.length} created · ${existing.length} already registered.`);
      await onSourcesChanged?.();
      if (created.length === 1) update({ source_id: created[0].id });
    } catch (e) {
      setError(e);
    } finally {
      setDraftBusy(false);
    }
  }, [recruitmentId, onSourcesChanged]); // eslint-disable-line react-hooks/exhaustive-deps

  const verifySelectedSource = useCallback(async () => {
    if (!form.source_id) return;
    setError(null); setMsg(null); setVerifyBusy(true);
    try {
      const res = await api.post(`/api/admin/sources/${form.source_id}/verify`, {});
      const errs = res?.errors || [];
      const warns = res?.warnings || [];
      if (errs.length) {
        setError(new Error(`Verify failed: ${errs.join("; ")}`));
      } else if (warns.length) {
        setMsg(`Verify completed with warnings: ${warns.join("; ")}. Source remains needs_review.`);
      } else {
        setMsg("Source verified.");
      }
      await onSourcesChanged?.();
    } catch (e) {
      setError(e);
    } finally {
      setVerifyBusy(false);
    }
  }, [form.source_id, onSourcesChanged]);

  const submitManualSource = useCallback(async () => {
    setError(null); setMsg(null);
    if (!manualName.trim()) { setError(new Error("Source name required.")); return; }
    if (!manualUrl.trim()) { setError(new Error("Official URL required.")); return; }
    try {
      new URL(manualUrl.trim());
    } catch {
      setError(new Error("Official URL must be a valid http(s) link."));
      return;
    }
    setDraftBusy(true);
    try {
      const res = await api.post(`/api/admin/sources`, {
        source_name: manualName.trim(),
        official_url: manualUrl.trim(),
        source_type: manualType,
        is_active: true,
        is_verified: false,
        verification_status: "needs_review",
      });
      const row = res?.item || res;
      setMsg("Source created as draft. Verify it below before saving the recruitment.");
      setManualName(""); setManualUrl("");
      setShowManualAdd(false);
      await onSourcesChanged?.();
      if (row?.id) update({ source_id: row.id });
    } catch (e) {
      setError(e);
    } finally {
      setDraftBusy(false);
    }
  }, [manualName, manualUrl, manualType, onSourcesChanged]);

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
          <Field label="Source provenance" testId="fix-source" wide>
            {unknownHosts.length > 0 ? (
              <div className="mb-2 rounded-xl border border-amber-200 bg-amber-50 p-2 text-[11px]" data-testid="fix-source-detected-hosts">
                <div className="font-semibold text-amber-900">
                  Detected official hosts not in registry:{" "}
                  {unknownHosts.map((c) => c.host).join(", ")}
                </div>
                <button
                  type="button"
                  className="mt-1 btn btn-ghost h-7 text-[11px]"
                  onClick={draftAllUnknown}
                  disabled={draftBusy || verifyBusy}
                  data-testid="fix-source-draft-all"
                >
                  {draftBusy ? "Creating drafts…" : `Create ${unknownHosts.length} draft source${unknownHosts.length === 1 ? "" : "s"}`}
                </button>
              </div>
            ) : null}
            <select
              className="input"
              value={form.source_id || ""}
              onChange={(e) => update({ source_id: e.target.value })}
              data-testid="fix-source-select"
            >
              <option value="">Select source...</option>
              {eligibleSources.length === 0 ? (
                <option value="" disabled>No non-aggregator sources available</option>
              ) : null}
              {eligibleSources.map((s) => {
                const status = s.is_verified ? null : (s.verification_status === "failed" ? "failed" : "draft");
                return (
                  <option key={s.id} value={s.id}>
                    {s.source_name || s.org} · {s.source_type}{status ? ` · ${status}` : ""}
                  </option>
                );
              })}
            </select>
            {verifiedNonAggregator.length === 0 && eligibleSources.length > 0 ? (
              <div className="mt-1 text-[11px] text-amber-700">
                All listed sources are drafts. Verify one before saving.
              </div>
            ) : null}
            {selectedIsUnverified ? (
              <div className="mt-1 flex items-center gap-2 rounded-md border border-amber-200 bg-amber-50 px-2 py-1 text-[11px] text-amber-900" data-testid="fix-source-unverified-warn">
                <span className="flex-1">
                  Selected source is a draft. Verify before saving (Save is disabled until verified).
                </span>
                <button
                  type="button"
                  className="btn btn-ghost h-6 text-[11px]"
                  onClick={verifySelectedSource}
                  disabled={verifyBusy || draftBusy}
                  data-testid="fix-source-verify-selected"
                >
                  {verifyBusy ? "Verifying…" : "Verify now"}
                </button>
              </div>
            ) : null}
            <div className="mt-1">
              <button
                type="button"
                className="btn btn-ghost h-7 text-[11px]"
                onClick={() => setShowManualAdd((v) => !v)}
                data-testid="fix-source-toggle-manual-add"
              >
                {showManualAdd ? "− Hide manual add" : "+ Add a new source manually"}
              </button>
            </div>
            {showManualAdd ? (
              <div className="mt-2 rounded-xl border border-border bg-white/60 p-2" data-testid="fix-source-manual-add">
                <div className="grid gap-2 sm:grid-cols-2">
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Source name</div>
                    <input
                      className="input"
                      value={manualName}
                      onChange={(e) => setManualName(e.target.value)}
                      placeholder="Union Public Service Commission"
                      data-testid="fix-source-manual-name"
                    />
                  </label>
                  <label className="block">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Source type</div>
                    <select
                      className="input"
                      value={manualType}
                      onChange={(e) => setManualType(e.target.value)}
                      data-testid="fix-source-manual-type"
                    >
                      <option value="official_html">official_html</option>
                      <option value="official_pdf">official_pdf</option>
                      <option value="rss">rss</option>
                      <option value="api">api</option>
                      <option value="sitemap">sitemap</option>
                    </select>
                  </label>
                  <label className="block sm:col-span-2">
                    <div className="mb-1 text-[10px] font-semibold uppercase tracking-[0.16em] text-muted-foreground">Official URL</div>
                    <input
                      className="input"
                      type="url"
                      value={manualUrl}
                      onChange={(e) => setManualUrl(e.target.value)}
                      placeholder="https://upsc.gov.in/"
                      data-testid="fix-source-manual-url"
                    />
                  </label>
                </div>
                <div className="mt-2 flex justify-end gap-2">
                  <button
                    type="button"
                    className="btn btn-ghost h-7 text-[11px]"
                    onClick={() => { setShowManualAdd(false); setManualName(""); setManualUrl(""); }}
                    disabled={draftBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary h-7 text-[11px]"
                    onClick={submitManualSource}
                    disabled={draftBusy || !manualName.trim() || !manualUrl.trim()}
                    data-testid="fix-source-manual-submit"
                  >
                    {draftBusy ? "Creating…" : "Create draft source"}
                  </button>
                </div>
              </div>
            ) : null}
            <FieldActions
              onSave={() => save({ source_id: form.source_id })}
              busy={busy}
              disabled={!form.source_id || form.source_id === recruitment.source_id || selectedIsUnverified}
              testId="save-source"
            />
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
