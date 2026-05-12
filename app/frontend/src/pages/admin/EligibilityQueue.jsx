import React, { useEffect, useState } from "react";
import EligibilityReviewDrawer from "../../features/admin/eligibility/EligibilityReviewDrawer";
import AdminWorkflowStepper from "../../features/admin/workflow/AdminWorkflowStepper";
import NextActionCallout from "../../features/admin/workflow/NextActionCallout";
import { NEXT_ACTION_MESSAGES } from "../../features/admin/workflow/adminWorkflowContract";
import { api, getApiUnverifiedFields } from "../../lib/api";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";
import useAdminAction from "../../features/admin/shared/useAdminAction";

export default function AdminEligibilityQueue() {
  const [d, setD] = useState(null);
  const [msg, setMsg] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);

  async function load() {
    setError(null);
    const r = await api.get("/api/admin/eligibility-queue");
    setD(r);
  }

  useEffect(() => { load().catch((e) => setError(e)); }, []);

  async function promote(item) {
    await runAction({
      key: `promote-${item.id}`,
      successMessage: "Recruitment draft created. Next: validate publish readiness.",
      action: async () => {
        try {
          const r = await api.post(`/api/admin/scrape/items/${item.id}/promote`, {});
          setMsg(`Promoted "${item.recruitment}" to recruitment ${(r.recruitment_id || "unknown").slice(0, 8)}. No alerts sent. Next: validate recruitment before publishing.`);
          await load();
          setSelected(null);
        } catch (e) {
          const fields = getApiUnverifiedFields(e);
          if (fields.length) setMsg(`Promote blocked. Verify required fields in the review drawer: ${fields.join(", ")}.`);
          throw e;
        }
      },
    });
  }

  async function reject(item, notes) {
    await runAction({
      key: `reject-${item.id}`,
      confirm: `Reject "${item.recruitment}"?`,
      successMessage: `Rejected ${item.recruitment}`,
      action: async () => {
        await api.post(`/api/admin/scrape/items/${item.id}/reject`, { notes });
        setMsg(`Rejected "${item.recruitment}".`);
        await load();
        setSelected(null);
      },
    });
  }

  async function fieldAct(id, field, action, correctedValue) {
    await runAction({
      key: `field-${id}-${field}-${action}`,
      successMessage: `${field} ${action} saved.`,
      action: async () => {
        await api.post(`/api/admin/scrape/items/${id}/fields/${field}/${action}`, { notes: "field review", corrected_value: correctedValue });
        await load();
        const status = action === "correct" ? "corrected" : action === "verify" ? "verified" : "rejected";
        setSelected((current) => current && current.id === id ? {
          ...current,
          field_evidence_status: { ...(current.field_evidence_status || {}), [field]: status },
          unverified_fields: status === "rejected" ? current.unverified_fields : (current.unverified_fields || []).filter((name) => name !== field),
          promotable: status === "rejected" ? false : (current.unverified_fields || []).filter((name) => name !== field).length === 0,
        } : current);
      },
    });
  }

  if (!d && !error) return <div data-testid="admin-elig-loading"><LoadingSkeleton variant="table" /></div>;
  if (error) return <ErrorState title="Failed to load promotion queue" message={error.message} onRetry={() => load().catch((e) => setError(e))} />;

  return (
    <div className="space-y-6" data-testid="admin-eligibility-queue">
      <AdminWorkflowStepper currentStep="Eligibility" />
      <NextActionCallout message={NEXT_ACTION_MESSAGES.promotionQueueToRecruitments} href="/admin/recruitments" actionLabel="Open Recruitments" />

      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Promotion Queue / Scrape Candidates</div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Scraped candidates awaiting admin decision.</h1>
        <p className="text-muted-foreground mt-1">This is not the eligibility result queue. These are scraped candidates waiting for promotion into canonical recruitment records.</p>
      </div>

      {msg && <div data-testid="admin-elig-msg" className="rounded-xl bg-sage-100/60 border border-sage-200 p-3 text-xs">{msg}</div>}
      {actionError && <div className="text-xs text-destructive">{actionError.message}</div>}

      <div className="grid gap-4 md:grid-cols-4">
        <Stat label="Pending" value={d.pending.length} />
        <Stat label="Promoted (24h)" value={d.promoted_24h} />
        <Stat label="Rejected (24h)" value={d.rejected_24h} />
        <Stat label="Eligibility recompute backlog" value={d.recompute_backlog ?? 0} />
      </div>

      <div className="soft-card rounded-2xl p-4">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-2">Items awaiting promotion review</div>
        {d.pending.length === 0 ? (
          <EmptyState title="Queue is empty" description="Run a dry scrape from Scraper / Queue Review to populate it." actionLabel="Open scraper" actionHref="/admin/scraper" />
        ) : (
          <ul className="space-y-2">
            {d.pending.map((p) => {
              const conf = Number(p.confidence || 0);
              const blocked = p.unverified_fields || [];
              return (
                <li key={p.id} className="border-b border-border py-1 last:border-0">
                  <button type="button" className="w-full flex items-center justify-between gap-3 flex-wrap hover:bg-clay-50/50 px-2 py-2 rounded text-left" data-testid={`queue-item-${p.id}`} aria-label={`Open promotion review for ${p.recruitment}`} onClick={() => setSelected(p)}>
                    <div className="min-w-[280px]">
                      <div className="font-semibold">{p.recruitment}</div>
                      <div className="text-xs text-muted-foreground">Source: {p.source || "-"}</div>
                      {!p.source && <div className="text-xs text-destructive">Source missing</div>}
                      {blocked.length ? <div className="mt-1 text-xs text-amber-700">Verify required: {blocked.join(", ")}</div> : null}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      <StatusBadge status={conf < 0.7 ? "pending" : "verified"} label={`${Math.round(conf * 100)}% confidence`} />
                      {" · "}
                      {p.added ? new Date(p.added).toLocaleString("en-IN") : "-"}
                      {conf < 0.7 && <div className="text-destructive mt-1">Low confidence</div>}
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
      </div>

      <EligibilityReviewDrawer open={!!selected} item={selected} busy={Boolean(busyKey)} onClose={() => setSelected(null)} onPromote={() => promote(selected)} onReject={(notes) => reject(selected, notes)} onFieldAction={fieldAct} />
    </div>
  );
}

function Stat({ label, value }) {
  return <div className="soft-card rounded-2xl p-5"><div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div><div className="mt-2 font-heading text-3xl font-semibold">{value}</div></div>;
}
