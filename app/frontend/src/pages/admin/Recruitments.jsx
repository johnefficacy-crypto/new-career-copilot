import React, { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, FileCheck2, Filter, Link as LinkIcon, Search, ShieldAlert, X } from "lucide-react";
import RecruitmentEditPanel from "../../features/admin/recruitments/RecruitmentEditPanel";
import RecruitmentTrustActions from "../../features/admin/recruitments/RecruitmentTrustActions";
import useAdminAction from "../../features/admin/shared/useAdminAction";
import { api, getApiBlockingIssues } from "../../lib/api";
import AdminWorkflowStepper from "../../features/admin/workflow/AdminWorkflowStepper";
import NextActionCallout from "../../features/admin/workflow/NextActionCallout";
import BlockerList from "../../features/admin/workflow/BlockerList";
import InlineTrustFixes from "../../features/admin/workflow/InlineTrustFixes";
import { getNextActionForRecruitment } from "../../features/admin/workflow/adminWorkflowContract";
import { useFocusTrap } from "../../shared/a11y/useFocusTrap";
import { EmptyState, ErrorState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

const STATUS_FILTERS = [
  { value: "all", label: "All" },
  { value: "needs_review", label: "Needs review" },
  { value: "published", label: "Published" },
  { value: "blocked", label: "Blocked" },
  { value: "unpublished", label: "Unpublished" },
];

function normalizeText(value) {
  return String(value || "").toLowerCase();
}

function isBlocked(item) {
  return (item.blocking_issues || []).length > 0;
}

function matchesStatus(item, status) {
  if (status === "all") return true;
  if (status === "blocked") return isBlocked(item);
  if (status === "unpublished") return item.publish_status !== "published";
  return item.publish_status === status;
}

function truncateUrl(url) {
  if (!url) return "-";
  return url.replace(/^https?:\/\//, "").slice(0, 64);
}

function RecruitmentDrawer({ row, onClose, onAction, onSave, onReload, busyKey }) {
  const panelRef = useRef(null);
  const closeRef = useRef(null);
  useFocusTrap({ active: !!row, containerRef: panelRef, onEscape: onClose, initialFocusRef: closeRef });
  if (!row) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/30">
      <div className="absolute inset-0" onClick={onClose} />
      <aside
        ref={panelRef}
        tabIndex={-1}
        role="dialog"
        aria-modal="true"
        aria-labelledby="recruitment-drawer-title"
        className="relative h-full w-full max-w-3xl overflow-auto border-l border-border bg-[#FBF6EF] p-5 shadow-xl"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[11px] uppercase tracking-[0.2em] text-muted-foreground">Recruitment review</div>
            <h2 id="recruitment-drawer-title" className="mt-1 truncate font-heading text-2xl">{row.name}</h2>
            <p className="mt-1 text-sm text-muted-foreground">{row.organization || "No organization linked"}</p>
          </div>
          <button ref={closeRef} type="button" className="btn btn-ghost h-9 w-9 p-0" onClick={onClose} aria-label="Close recruitment details">
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-5 flex flex-wrap gap-2">
          <StatusBadge status={row.publish_status} label={row.publish_status || "Unknown"} />
          <StatusBadge status={row.lifecycle_status} label={row.lifecycle_status || "Unknown"} />
          <StatusBadge status={row.organization_verified ? "verified" : "pending"} label={row.organization_verified ? "Organization verified" : "Organization pending"} />
          <StatusBadge status={row.source_provenance ? "verified" : "pending"} label={row.source_provenance ? "Source linked" : "Source missing"} />
        </div>
        <div className="mt-4">
          <NextActionCallout
            message={getNextActionForRecruitment(row)}
            href={row.publish_status === "published" ? "/admin/eligibility-queue" : undefined}
            actionLabel={row.publish_status === "published" ? "Open Eligibility Ops" : undefined}
            tone={(row.blocking_issues || []).length ? "warn" : "info"}
          />
        </div>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="font-semibold">Trust actions</h3>
              <p className="mt-1 text-sm text-muted-foreground">Validation, verification, and publishing remain separate gated actions.</p>
            </div>
          </div>
          <div className="mt-3">
            <RecruitmentTrustActions row={row} onAction={onAction} busyKey={busyKey} />
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <UrlPanel title="Official notification" url={row.official_notification_url} />
          <UrlPanel title="Official apply" url={row.official_apply_url} />
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2">
          <IssuePanel title="Blocking issues" items={row.blocking_issues} empty="No publish blockers reported." renderBlockers />
          <IssuePanel title="Warnings" tone="amber" items={row.warnings} empty="No warnings reported." />
        </section>

        <div className="mt-5">
          <InlineTrustFixes row={row} blockers={row.blocking_issues || []} onAfterFix={onReload} />
        </div>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Review notes and edits</h3>
          <div className="mt-2 rounded-xl border border-border bg-white/60 p-3 text-sm text-muted-foreground">
            {row.review_notes || "No review notes yet."}
          </div>
          <div className="mt-4">
            <RecruitmentEditPanel row={row} onSave={(payload) => onSave(row.id, payload)} />
          </div>
        </section>

        <section className="mt-5 soft-card rounded-2xl p-4">
          <h3 className="font-semibold">Publication</h3>
          <dl className="mt-3 grid gap-3 text-sm md:grid-cols-2">
            <div><dt className="text-xs uppercase tracking-widest text-muted-foreground">Published by</dt><dd>{row.published_by || "-"}</dd></div>
            <div><dt className="text-xs uppercase tracking-widest text-muted-foreground">Published at</dt><dd>{row.published_at || "-"}</dd></div>
          </dl>
        </section>
      </aside>
    </div>
  );
}

function RecruitmentCard({ row, onOpen, onAction, busyKey }) {
  const blocked = isBlocked(row);

  return (
    <article className="soft-card rounded-2xl p-4" data-testid={`recruitment-card-${row.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            <StatusBadge status={row.publish_status} label={row.publish_status || "Unknown"} />
            {blocked && <span className="pill pill-amber"><AlertTriangle className="h-3.5 w-3.5" aria-hidden="true" /> Blocked</span>}
          </div>
          <h2 className="mt-3 line-clamp-2 font-heading text-xl">{row.name}</h2>
          <p className="mt-1 truncate text-sm text-muted-foreground">{row.organization || "No organization linked"}</p>
        </div>
        <button type="button" className="btn btn-ghost h-9 shrink-0 px-3 text-xs" onClick={() => onOpen(row)}>Details</button>
      </div>

      <div className="mt-4 grid gap-2 text-xs sm:grid-cols-2">
        <Signal icon={FileCheck2} label="Lifecycle" value={row.lifecycle_status || "-"} />
        <Signal icon={CheckCircle2} label="Organization" value={row.organization_verified ? "Verified" : "Pending"} />
        <Signal icon={LinkIcon} label="Notification" value={truncateUrl(row.official_notification_url)} />
        <Signal icon={ShieldAlert} label="Provenance" value={row.source_provenance ? "Linked" : "Missing"} />
      </div>

      <div className="mt-4 rounded-xl border border-border bg-white/60 p-3">
        <div className="text-[11px] uppercase tracking-widest text-muted-foreground">Readiness</div>
        {blocked ? (
          <div className="mt-2"><BlockerList blockers={(row.blocking_issues || []).slice(0, 3)} /></div>
        ) : (
          <p className="mt-2 text-sm text-muted-foreground">No current publish blockers reported.</p>
        )}
      </div>

      <div className="mt-4 border-t border-border pt-3">
        <RecruitmentTrustActions row={row} onAction={onAction} busyKey={busyKey} />
      </div>
    </article>
  );
}

export default function AdminRecruitments() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const { runAction, busyKey, error: actionError } = useAdminAction();

  const load = async () => {
    setLoading(true); setError(null);
    try {
      const d = await api.get("/api/admin/recruitments");
      setItems(d.items || []);
    } catch (e) { setError(e); } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const act = async (id, action, opts = {}) => runAction({
    key: `${action}-${id}`,
    confirm: opts.confirm,
    successMessage: action === "publish" ? "Recruitment published. Next: monitor eligibility recompute and notification pipeline." : `${action} completed`,
    errorMessage: `${action} failed`,
    action: async () => { await api.post(`/api/admin/recruitments/${id}/${action}`, {}); await load(); },
  });

  const save = async (id, payload) => runAction({
    key: `save-${id}`,
    successMessage: "Recruitment saved",
    errorMessage: "Save failed",
    action: async () => { await api.put(`/api/admin/recruitments/${id}`, payload || {}); await load(); },
  });

  const summary = useMemo(() => ({
    total: items.length,
    unpublished: items.filter((item) => item.publish_status !== "published").length,
    blocked: items.filter(isBlocked).length,
    published: items.filter((item) => item.publish_status === "published").length,
  }), [items]);

  const filteredItems = useMemo(() => {
    const needle = normalizeText(query);
    return items.filter((item) => {
      const haystack = normalizeText(`${item.name} ${item.organization} ${item.publish_status} ${item.lifecycle_status}`);
      return matchesStatus(item, statusFilter) && (!needle || haystack.includes(needle));
    });
  }, [items, query, statusFilter]);

  return (
    <div className="space-y-5" data-testid="admin-recruitments">
      <AdminWorkflowStepper currentStep={["Recruitment Draft", "Validate", "Publish"]} />
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments / trust workflow</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Review publish readiness.</h1>
          <p className="mt-1 max-w-2xl text-sm text-muted-foreground">Scan recruitment records, inspect blockers, validate provenance, and keep publish decisions explicit.</p>
        </div>
        <button type="button" className="btn btn-ghost" onClick={load}>Refresh</button>
      </div>

      <div className="grid gap-3 text-sm md:grid-cols-4">
        <Metric label="Total" value={summary.total} />
        <Metric label="Unpublished" value={summary.unpublished} />
        <Metric label="Publish blocked" value={summary.blocked} tone="warn" />
        <Metric label="Published" value={summary.published} tone="ok" />
      </div>

      <section className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 lg:grid-cols-[1fr_220px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search recruitments</span>
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm"
              placeholder="Search recruitment, organization, or status"
              type="search"
            />
          </label>
          <label className="relative block">
            <Filter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Filter recruitments</span>
            <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm">
              {STATUS_FILTERS.map((filter) => <option key={filter.value} value={filter.value}>{filter.label}</option>)}
            </select>
          </label>
        </div>
      </section>

      {actionError && <div className="soft-card rounded-xl border-destructive/30 p-3 text-xs text-destructive" data-testid="admin-recruitments-message">
        <div>{actionError.message}</div>
        <div className="mt-2 text-foreground"><BlockerList blockers={getApiBlockingIssues(actionError)} empty="" /></div>
      </div>}

      {loading ? <LoadingSkeleton variant="table" /> : null}
      {!loading && error ? <ErrorState title="Failed to load recruitments" message={error.message} onRetry={load} /> : null}
      {!loading && !error && filteredItems.length === 0 ? <EmptyState title="No recruitments match this view" description="Adjust the search or status filter to widen the review list." /> : null}
      {!loading && !error && filteredItems.length > 0 ? (
        <div className="grid gap-4 xl:grid-cols-2">
          {filteredItems.map((row) => (
            <RecruitmentCard key={row.id} row={row} onOpen={setSelected} onAction={act} busyKey={busyKey} />
          ))}
        </div>
      ) : null}

      <RecruitmentDrawer row={selected} onClose={() => setSelected(null)} onAction={act} onSave={save} onReload={load} busyKey={busyKey} />
    </div>
  );
}

function Metric({ label, value, tone }) {
  const toneClass = tone === "warn" ? "text-amber-700" : tone === "ok" ? "text-sage-700" : "text-foreground";
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground">{label}</div>
      <div className={`mt-1 font-heading text-3xl ${toneClass}`}>{value}</div>
    </div>
  );
}

function Signal({ icon: Icon, label, value }) {
  return (
    <div className="min-w-0 rounded-xl border border-border bg-white/60 p-2">
      <div className="flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-muted-foreground">
        <Icon className="h-3.5 w-3.5" aria-hidden="true" />
        {label}
      </div>
      <div className="mt-1 truncate font-medium">{value}</div>
    </div>
  );
}

function UrlPanel({ title, url }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><LinkIcon className="h-4 w-4" aria-hidden="true" /> {title}</div>
      <div className="mt-2 break-all rounded-xl border border-border bg-white/60 p-3 text-xs text-muted-foreground">{url || "Missing"}</div>
    </div>
  );
}

function IssuePanel({ title, items = [], empty, renderBlockers = false }) {
  return (
    <div className="soft-card rounded-2xl p-4">
      <div className="flex items-center gap-2 text-sm font-semibold"><AlertTriangle className="h-4 w-4" aria-hidden="true" /> {title}</div>
      {renderBlockers ? (
        <div className="mt-3"><BlockerList blockers={items} empty={empty} /></div>
      ) : items?.length ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {items.map((item) => <span key={item} className="pill pill-amber">{item}</span>)}
        </div>
      ) : (
        <p className="mt-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}
