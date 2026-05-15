import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ChevronRight, ExternalLink, Loader2, Building2 } from "lucide-react";
import { api } from "../../../lib/api";

// Renders the GET /api/admin/scrape/items/{id}/promotion-preview payload
// inline inside a queue review drawer. Tells the reviewer exactly what
// promote would create — recruitment fields, organization create/link,
// post count, duplicate collision, and the blocker checklist — without
// writing anything. Fetches lazily when ``open`` flips to true so the
// drawer stays cheap to mount.

function Field({ label, value }) {
  if (value == null || value === "") return null;
  return (
    <div className="rounded-lg border border-border bg-white/70 p-2">
      <div className="text-[10px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className="mt-0.5 break-words text-sm">{String(value)}</div>
    </div>
  );
}

function BlockerRow({ blocker, onScrollToField }) {
  const fieldList = blocker.unverified_fields || (blocker.field ? [blocker.field] : []);
  return (
    <li className="flex items-start gap-2 rounded-lg border border-destructive/30 bg-white/70 p-2 text-xs">
      <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-destructive" />
      <div className="min-w-0 flex-1">
        <div className="font-semibold text-destructive">{blocker.message || blocker.code}</div>
        {fieldList.length ? (
          <div className="mt-1 flex flex-wrap gap-1">
            {fieldList.map((field) => (
              <button
                key={field}
                type="button"
                onClick={() => onScrollToField?.(field)}
                className="rounded-full border border-border bg-white/70 px-2 py-0.5 text-[11px] hover:bg-clay-100"
                title={`Scroll to ${field}`}
              >
                {field} <ChevronRight className="inline h-3 w-3" />
              </button>
            ))}
          </div>
        ) : null}
        {blocker.existing_recruitment_id ? (
          <a
            className="mt-1 inline-flex items-center gap-1 text-[11px] text-dusk-700 underline"
            href={`/admin/recruitments?open=${blocker.existing_recruitment_id}`}
          >
            Open existing recruitment <ExternalLink className="h-3 w-3" />
          </a>
        ) : null}
      </div>
    </li>
  );
}

export default function PromotionPreviewPanel({ queueId, open, refreshKey, onScrollToField }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!queueId) return;
    setLoading(true);
    setError(null);
    try {
      const r = await api.get(`/api/admin/scrape/items/${queueId}/promotion-preview`);
      setData(r);
    } catch (e) {
      setError(e);
    } finally {
      setLoading(false);
    }
  }, [queueId]);

  // Fetch when the panel is opened (and re-fetch when refreshKey bumps —
  // the parent does that after verify/correct so the preview reflects
  // the latest evidence state).
  useEffect(() => {
    if (open) load();
  }, [open, refreshKey, load]);

  if (!open) return null;

  return (
    <section className="soft-card rounded-2xl p-4" data-testid="promotion-preview-panel">
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Promotion preview</div>
          <h3 className="font-heading text-lg">What promote will create</h3>
          <p className="mt-1 text-xs text-muted-foreground">
            Read-only preview. Nothing is written until you click Promote.
          </p>
        </div>
        <button type="button" className="btn btn-ghost h-8 text-xs" onClick={load} disabled={loading}>
          {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : "Refresh"}
        </button>
      </div>

      {error ? (
        <div className="mt-3 rounded-xl border border-destructive/30 bg-white/70 p-3 text-xs text-destructive">
          Preview failed: {error.message}
        </div>
      ) : null}

      {loading && !data ? (
        <div className="mt-3 text-xs text-muted-foreground">Loading preview…</div>
      ) : null}

      {data ? (
        <div className="mt-3 space-y-3">
          <div className={`flex items-center gap-2 rounded-xl border p-2 text-xs ${data.ok ? "border-sage-300 bg-sage-50 text-sage-900" : "border-amber-300 bg-amber-50 text-amber-900"}`}>
            {data.ok ? <CheckCircle2 className="h-4 w-4" /> : <AlertTriangle className="h-4 w-4" />}
            <span className="font-semibold">{data.ok ? "Ready to promote" : `${(data.blocking_issues || []).length} blocker${(data.blocking_issues || []).length === 1 ? "" : "s"}`}</span>
            <span className="ml-auto">Resulting status: <b>{data.recruitment_preview?.publish_status_after}</b></span>
          </div>

          {(data.blocking_issues || []).length ? (
            <ul className="space-y-2">
              {data.blocking_issues.map((b, i) => (
                <BlockerRow key={`${b.code}-${i}`} blocker={b} onScrollToField={onScrollToField} />
              ))}
            </ul>
          ) : null}

          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Recruitment draft</div>
            <div className="mt-1 grid gap-2 sm:grid-cols-2">
              <Field label="Title" value={data.recruitment_preview?.title} />
              <Field label="Year" value={data.recruitment_preview?.year} />
              <Field label="Total vacancies" value={data.recruitment_preview?.total_vacancies} />
              <Field label="Apply window" value={data.recruitment_preview?.apply_start_date ? `${data.recruitment_preview.apply_start_date} → ${data.recruitment_preview.apply_end_date || "?"}` : null} />
              <Field label="Notification date" value={data.recruitment_preview?.notification_date} />
              <Field label="Slug" value={data.recruitment_preview?.slug} />
              <Field label="Official notification URL" value={data.recruitment_preview?.official_notification_url} />
              <Field label="Official apply URL" value={data.recruitment_preview?.official_apply_url} />
            </div>
          </div>

          <div className="flex items-center gap-2 rounded-xl border border-border bg-white/70 p-2 text-xs">
            <Building2 className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <div className="min-w-0 flex-1">
              <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Organization</div>
              <div>
                {data.organization_preview?.state === "create_new" ? (
                  <>Create new: <b>{data.organization_preview.name}</b></>
                ) : data.organization_preview?.state === "link_existing" ? (
                  <>Link existing: <b>{data.organization_preview.name}</b></>
                ) : (
                  <span className="text-muted-foreground">Organization unknown — title is required to compute</span>
                )}
              </div>
            </div>
          </div>

          {(data.posts_preview || []).length ? (
            <div>
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Posts ({data.posts_preview.length})</div>
              <div className="mt-1 max-h-48 overflow-auto rounded-xl border border-border bg-white/70">
                <table className="w-full text-xs">
                  <thead className="bg-[#FBF6EF] text-left text-[10px] uppercase tracking-widest text-muted-foreground">
                    <tr><th className="px-2 py-1">Post</th><th className="px-2 py-1">Vacancies</th><th className="px-2 py-1">Age</th><th className="px-2 py-1">Unit</th></tr>
                  </thead>
                  <tbody>
                    {data.posts_preview.map((p) => (
                      <tr key={p.index} className="border-t border-border">
                        <td className="px-2 py-1">{p.post_name || "—"}</td>
                        <td className="px-2 py-1">{p.vacancies ?? "—"}</td>
                        <td className="px-2 py-1">{p.min_age != null || p.max_age != null ? `${p.min_age ?? "?"} – ${p.max_age ?? "?"}` : "—"}</td>
                        <td className="px-2 py-1">{p.unit_name || p.unit_location_state || "—"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-2 text-xs text-amber-900">
              No posts in extracted data. Most recruitments need at least one post.
            </div>
          )}

          {(data.warnings || []).length ? (
            <div className="rounded-xl border border-border bg-white/60 p-2 text-[11px] text-muted-foreground">
              Warnings: {data.warnings.join(", ")}
            </div>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
