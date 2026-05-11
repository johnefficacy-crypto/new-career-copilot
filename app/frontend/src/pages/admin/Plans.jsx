import React, { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, ListFilter, Pencil, Plus, Power, RefreshCw, Save, Search, X } from "lucide-react";
import { api } from "../../lib/api";
import { EmptyState, ErrorState, StatusBadge, useToast } from "../../shared/ui";

const EMPTY = {
  id: "",
  name: "",
  description: "",
  price_inr: 0,
  interval: "monthly",
  features: "",
  is_active: true,
  sort_order: 0,
};

function paiseToRupees(p) {
  return ((Number(p) || 0) / 100).toFixed(2);
}

function formatPrice(p) {
  return Number(p.price_inr) === 0 ? "Free" : `Rs ${paiseToRupees(p.price_inr)}`;
}

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [edit, setEdit] = useState(null); // plan id being edited; "new" = create
  const [form, setForm] = useState(EMPTY);
  const [formErrors, setFormErrors] = useState({});
  const [busy, setBusy] = useState(false);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const toast = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError("");
    try {
      const r = await api.get("/api/admin/plans");
      setPlans(r.plans || []);
    } catch (e) {
      setLoadError(e.message || "Plans could not be loaded.");
      toast.error(`Plans could not be loaded: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load();
  }, [load]);

  const visiblePlans = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return plans
      .filter((plan) => {
        const matchesStatus = statusFilter === "all" || (statusFilter === "active" ? plan.is_active : !plan.is_active);
        const haystack = `${plan.id || ""} ${plan.name || ""} ${plan.description || ""} ${plan.interval || ""}`.toLowerCase();
        return matchesStatus && (!needle || haystack.includes(needle));
      })
      .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));
  }, [plans, query, statusFilter]);

  function openEdit(plan) {
    setForm({
      ...EMPTY,
      ...plan,
      price_inr: plan.price_inr || 0,
      features:
        Array.isArray(plan.features)
          ? plan.features.join("\n")
          : plan.features
            ? JSON.stringify(plan.features, null, 2)
            : "",
    });
    setFormErrors({});
    setEdit(plan.id);
  }

  function openNew() {
    setForm(EMPTY);
    setFormErrors({});
    setEdit("new");
  }

  function close() {
    setEdit(null);
    setForm(EMPTY);
    setFormErrors({});
  }

  function parseFeatures(raw) {
    const value = (raw || "").trim();
    if (!value) return [];
    if (value.startsWith("{") || value.startsWith("[")) {
      try {
        return JSON.parse(value);
      } catch {
        return value.split("\n").map((x) => x.trim()).filter(Boolean);
      }
    }
    return value.split("\n").map((x) => x.trim()).filter(Boolean);
  }

  function validate() {
    const next = {};
    if (edit === "new" && !form.id.trim()) next.id = "Plan ID is required.";
    if (!form.name.trim()) next.name = "Name is required.";
    if (Number(form.price_inr) < 0) next.price_inr = "Price cannot be negative.";
    setFormErrors(next);
    return Object.keys(next).length === 0;
  }

  async function save() {
    if (!validate()) return;

    setBusy(true);
    const payload = {
      ...form,
      id: form.id.trim(),
      name: form.name.trim(),
      price_inr: Number(form.price_inr) || 0,
      sort_order: Number(form.sort_order) || 0,
      features: parseFeatures(form.features),
    };

    try {
      if (edit === "new") {
        await api.post("/api/admin/plans", payload);
        toast.success(`Created plan ${payload.id}.`);
      } else {
        const { id, ...patch } = payload;
        await api.put(`/api/admin/plans/${edit}`, patch);
        toast.success(`Updated plan ${edit}.`);
      }
      close();
      await load();
    } catch (e) {
      toast.error(`Plan ${payload.id || edit} could not be saved: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(plan) {
    setBusy(true);
    try {
      await api.put(`/api/admin/plans/${plan.id}`, { is_active: !plan.is_active });
      toast.success(`${plan.name || plan.id} ${plan.is_active ? "disabled" : "enabled"}.`);
      await load();
    } catch (e) {
      toast.error(`${plan.name || plan.id} status could not be changed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="admin-plans">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Pricing / canonical</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Subscription plans.</h1>
          <p className="mt-1 max-w-2xl text-muted-foreground">
            Edit prices, intervals and feature lists. Plans flow into the user-facing pricing page and Razorpay checkout.
          </p>
        </div>
        <div className="flex gap-2">
          <button onClick={load} className="btn btn-ghost" data-testid="plans-reload">
            <RefreshCw className="h-4 w-4" /> Reload
          </button>
          <button onClick={openNew} className="btn btn-primary" data-testid="plans-new">
            <Plus className="h-4 w-4" /> New plan
          </button>
        </div>
      </div>

      <div className="soft-card rounded-2xl p-4">
        <div className="grid gap-3 md:grid-cols-[1fr_180px]">
          <label className="relative block">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Search plans</span>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm"
              placeholder="Search plans, intervals or descriptions"
              type="search"
            />
          </label>
          <label className="relative block">
            <ListFilter className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
            <span className="sr-only">Filter by status</span>
            <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)} className="w-full rounded-xl border border-border bg-white/80 py-2 pl-9 pr-3 text-sm">
              <option value="all">All statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>
      </div>

      {loadError && <ErrorState title="Plans could not be loaded" message={loadError} onRetry={load} />}

      {!loadError && !loading && visiblePlans.length === 0 && (
        <EmptyState icon={CheckCircle2} title="No plans match this view" description="Adjust the search or status filter, or create a new plan." actionLabel="New plan" onAction={openNew} />
      )}

      {!loadError && (
        <div className="grid gap-4 lg:grid-cols-2 xl:grid-cols-3">
          {loading && [0, 1, 2].map((key) => <div key={key} className="soft-card h-56 animate-pulse rounded-2xl" />)}
          {!loading && visiblePlans.map((plan) => (
            <PlanCard key={plan.id} plan={plan} busy={busy} onEdit={openEdit} onToggle={toggleActive} />
          ))}
        </div>
      )}

      {edit && (
        <div className="fixed inset-0 z-40 flex justify-end bg-black/30">
          <div className="absolute inset-0" onClick={close} />
          <aside className="relative h-full w-full max-w-xl overflow-auto border-l border-clay-200 bg-white p-6 shadow-xl" role="dialog" aria-modal="true" aria-labelledby="plan-form-title">
            <div className="flex items-center justify-between gap-3">
              <div id="plan-form-title" className="font-heading text-xl font-semibold">
                {edit === "new" ? "New plan" : `Edit ${edit}`}
              </div>
              <button onClick={close} className="btn btn-ghost h-9 w-9 p-0" aria-label="Close plan editor">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="mt-5 space-y-4">
              {edit === "new" && (
                <Field label="Plan ID (slug)" hint="lowercase, used in URLs / API" error={formErrors.id}>
                  <input className="input" value={form.id} onChange={(e) => setForm({ ...form, id: e.target.value })} data-testid="plan-form-id" />
                </Field>
              )}

              <Field label="Name" error={formErrors.name}>
                <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} data-testid="plan-form-name" />
              </Field>

              <Field label="Description">
                <textarea className="input min-h-[70px]" value={form.description || ""} onChange={(e) => setForm({ ...form, description: e.target.value })} data-testid="plan-form-description" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Price (paise)" hint="Rs 1 = 100 paise" error={formErrors.price_inr}>
                  <input type="number" className="input" value={form.price_inr} onChange={(e) => setForm({ ...form, price_inr: e.target.value })} data-testid="plan-form-price" />
                  <div className="mt-1 text-[11px] text-muted-foreground">Shown as {Number(form.price_inr) === 0 ? "Free" : `Rs ${paiseToRupees(form.price_inr)}`}</div>
                </Field>
                <Field label="Interval">
                  <select className="input" value={form.interval} onChange={(e) => setForm({ ...form, interval: e.target.value })} data-testid="plan-form-interval">
                    <option value="free">free</option>
                    <option value="monthly">monthly</option>
                    <option value="annual">annual</option>
                    <option value="one_time">one_time</option>
                  </select>
                </Field>
              </div>

              <Field label="Features (one per line, or JSON)">
                <textarea className="input min-h-[130px] font-mono text-xs" value={form.features} onChange={(e) => setForm({ ...form, features: e.target.value })} data-testid="plan-form-features" />
              </Field>

              <div className="grid grid-cols-2 gap-3">
                <Field label="Sort order">
                  <input type="number" className="input" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: e.target.value })} data-testid="plan-form-sort" />
                </Field>
                <Field label="Active">
                  <label className="mt-2 inline-flex items-center gap-2">
                    <input type="checkbox" checked={!!form.is_active} onChange={(e) => setForm({ ...form, is_active: e.target.checked })} data-testid="plan-form-active" />
                    <span>Visible to users</span>
                  </label>
                </Field>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button onClick={close} className="btn btn-ghost" data-testid="plan-form-cancel">Cancel</button>
                <button onClick={save} disabled={busy} className="btn btn-primary" data-testid="plan-form-save">
                  <Save className="h-4 w-4" /> {busy ? "Saving..." : "Save"}
                </button>
              </div>
            </div>
          </aside>
        </div>
      )}
    </div>
  );
}

function PlanCard({ plan, busy, onEdit, onToggle }) {
  const features = Array.isArray(plan.features) ? plan.features : [];

  return (
    <article className="soft-card rounded-2xl p-5" data-testid={`plan-row-${plan.id}`}>
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="font-mono text-[11px] uppercase tracking-[0.18em] text-muted-foreground">{plan.id}</div>
          <h2 className="mt-1 truncate font-heading text-2xl">{plan.name || plan.id}</h2>
        </div>
        <StatusBadge status={plan.is_active ? "active" : "disabled"} />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <div className="font-heading text-3xl">{formatPrice(plan)}</div>
        <div className="pb-1 text-sm text-muted-foreground">/{plan.interval}</div>
      </div>
      {plan.description && <p className="mt-3 text-sm text-muted-foreground">{plan.description}</p>}
      {features.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {features.slice(0, 3).map((feature) => (
            <li key={String(feature)} className="flex items-start gap-2">
              <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-sage-600" aria-hidden="true" />
              <span>{String(feature)}</span>
            </li>
          ))}
        </ul>
      )}
      <div className="mt-5 flex flex-wrap justify-end gap-2">
        <button onClick={() => onEdit(plan)} className="btn btn-ghost h-9" data-testid={`plan-edit-${plan.id}`}>
          <Pencil className="h-3.5 w-3.5" /> Edit
        </button>
        <button onClick={() => onToggle(plan)} disabled={busy} className="btn btn-ghost h-9" data-testid={`plan-toggle-${plan.id}`}>
          <Power className="h-3.5 w-3.5" /> {plan.is_active ? "Disable" : "Enable"}
        </button>
      </div>
    </article>
  );
}

function Field({ label, hint, error, children }) {
  return (
    <label className="block text-sm">
      <div className="mb-1 text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-semibold">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">- {hint}</span>}
      </div>
      {children}
      {error && <div className="mt-1 text-xs text-destructive">{error}</div>}
      <style>{`.input { width:100%; padding: 0.55rem 0.9rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
    </label>
  );
}
