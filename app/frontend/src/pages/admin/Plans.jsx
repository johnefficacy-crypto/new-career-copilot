import React, { useEffect, useState } from "react";
import { /* CreditCard, */ Plus, Pencil, RefreshCw, Save, X, Power } from "lucide-react";
import { api } from "../../lib/api";

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
  return ((p || 0) / 100).toFixed(2);
}

export default function AdminPlans() {
  const [plans, setPlans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [edit, setEdit] = useState(null); // plan id being edited; "new" = create
  const [form, setForm] = useState(EMPTY);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState(null);

  async function load() {
    setLoading(true);
    try {
      const r = await api.get("/api/admin/plans");
      setPlans(r.plans || []);
    } catch (e) {
      setMsg(`Load failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
  }, []);

  function openEdit(p) {
    setForm({
      ...EMPTY,
      ...p,
      price_inr: p.price_inr || 0,
      features:
        Array.isArray(p.features)
          ? p.features.join("\n")
          : p.features
          ? JSON.stringify(p.features, null, 2)
          : "",
    });
    setEdit(p.id);
  }

  function openNew() {
    setForm(EMPTY);
    setEdit("new");
  }

  function close() {
    setEdit(null);
    setForm(EMPTY);
    setMsg(null);
  }

  function parseFeatures(raw) {
    const v = (raw || "").trim();
    if (!v) return [];
    if (v.startsWith("{") || v.startsWith("[")) {
      try {
        return JSON.parse(v);
      } catch {
        // fall through to line-split
      }
    }
    return v.split("\n").map((x) => x.trim()).filter(Boolean);
  }

  async function save() {
    setBusy(true);
    setMsg(null);
    const payload = {
      ...form,
      price_inr: Number(form.price_inr) || 0,
      sort_order: Number(form.sort_order) || 0,
      features: parseFeatures(form.features),
    };
    try {
      if (edit === "new") {
        await api.post("/api/admin/plans", payload);
        setMsg(`Created ${payload.id}`);
      } else {
        // PUT only patchable fields
        const { id, ...patch } = payload;
        await api.put(`/api/admin/plans/${edit}`, patch);
        setMsg(`Updated ${edit}`);
      }
      close();
      await load();
    } catch (e) {
      setMsg(`Save failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  async function toggleActive(p) {
    setBusy(true);
    try {
      await api.put(`/api/admin/plans/${p.id}`, { is_active: !p.is_active });
      await load();
    } catch (e) {
      setMsg(`Toggle failed: ${e.message}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="space-y-6" data-testid="admin-plans">
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Pricing · canonical
          </div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
            Subscription plans.
          </h1>
          <p className="text-muted-foreground mt-1">
            Edit prices, intervals and feature lists. Plans flow into the
            user-facing <code>/app/pricing</code> page and Razorpay checkout.
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

      {msg && (
        <div className="text-sm rounded-lg border border-clay-200 bg-[#F5EDE0] px-4 py-2">
          {msg}
        </div>
      )}

      <div className="overflow-x-auto rounded-2xl border border-clay-200 bg-white">
        <table className="w-full text-sm">
          <thead className="text-left text-[11px] uppercase tracking-[0.18em] text-muted-foreground bg-clay-50">
            <tr>
              <th className="px-4 py-3">ID</th>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Interval</th>
              <th className="px-4 py-3 text-right">Price</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {loading && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  Loading…
                </td>
              </tr>
            )}
            {!loading && plans.length === 0 && (
              <tr>
                <td colSpan={6} className="px-4 py-6 text-muted-foreground">
                  No plans yet. Click "New plan".
                </td>
              </tr>
            )}
            {plans.map((p) => (
              <tr
                key={p.id}
                className="border-t border-clay-100 hover:bg-clay-50/50"
                data-testid={`plan-row-${p.id}`}
              >
                <td className="px-4 py-3 font-mono text-xs">{p.id}</td>
                <td className="px-4 py-3">
                  <div className="font-medium">{p.name}</div>
                  <div className="text-xs text-muted-foreground">
                    {p.description}
                  </div>
                </td>
                <td className="px-4 py-3">{p.interval}</td>
                <td className="px-4 py-3 text-right font-mono">
                  {p.price_inr === 0 ? "Free" : `₹ ${paiseToRupees(p.price_inr)}`}
                </td>
                <td className="px-4 py-3">
                  <span
                    className={`pill ${p.is_active ? "pill-sage" : "pill-muted"}`}
                  >
                    {p.is_active ? "active" : "disabled"}
                  </span>
                </td>
                <td className="px-4 py-3 text-right">
                  <button
                    onClick={() => openEdit(p)}
                    className="btn btn-ghost h-8"
                    data-testid={`plan-edit-${p.id}`}
                  >
                    <Pencil className="h-3.5 w-3.5" /> Edit
                  </button>
                  <button
                    onClick={() => toggleActive(p)}
                    disabled={busy}
                    className="btn btn-ghost h-8 ml-1"
                    data-testid={`plan-toggle-${p.id}`}
                  >
                    <Power className="h-3.5 w-3.5" /> {p.is_active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {edit && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-40 p-4">
          <div className="bg-white rounded-2xl shadow-xl border border-clay-200 w-full max-w-lg p-6 space-y-4">
            <div className="flex items-center justify-between">
              <div className="font-heading text-xl font-semibold">
                {edit === "new" ? "New plan" : `Edit · ${edit}`}
              </div>
              <button onClick={close} className="text-muted-foreground hover:text-foreground">
                <X className="h-4 w-4" />
              </button>
            </div>

            {edit === "new" && (
              <Field label="Plan ID (slug)" hint="lowercase, used in URLs / API">
                <input
                  className="input"
                  value={form.id}
                  onChange={(e) => setForm({ ...form, id: e.target.value })}
                  data-testid="plan-form-id"
                />
              </Field>
            )}

            <Field label="Name">
              <input
                className="input"
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                data-testid="plan-form-name"
              />
            </Field>

            <Field label="Description">
              <textarea
                className="input min-h-[60px]"
                value={form.description || ""}
                onChange={(e) => setForm({ ...form, description: e.target.value })}
                data-testid="plan-form-description"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Price (paise)" hint="₹1 = 100 paise">
                <input
                  type="number"
                  className="input"
                  value={form.price_inr}
                  onChange={(e) => setForm({ ...form, price_inr: e.target.value })}
                  data-testid="plan-form-price"
                />
                <div className="text-[11px] text-muted-foreground mt-1">
                  ≈ ₹ {paiseToRupees(form.price_inr)}
                </div>
              </Field>
              <Field label="Interval">
                <select
                  className="input"
                  value={form.interval}
                  onChange={(e) => setForm({ ...form, interval: e.target.value })}
                  data-testid="plan-form-interval"
                >
                  <option value="free">free</option>
                  <option value="monthly">monthly</option>
                  <option value="annual">annual</option>
                  <option value="one_time">one_time</option>
                </select>
              </Field>
            </div>

            <Field label="Features (one per line, or JSON)">
              <textarea
                className="input min-h-[100px] font-mono text-xs"
                value={form.features}
                onChange={(e) => setForm({ ...form, features: e.target.value })}
                data-testid="plan-form-features"
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field label="Sort order">
                <input
                  type="number"
                  className="input"
                  value={form.sort_order}
                  onChange={(e) => setForm({ ...form, sort_order: e.target.value })}
                  data-testid="plan-form-sort"
                />
              </Field>
              <Field label="Active">
                <label className="inline-flex items-center gap-2 mt-2">
                  <input
                    type="checkbox"
                    checked={!!form.is_active}
                    onChange={(e) =>
                      setForm({ ...form, is_active: e.target.checked })
                    }
                    data-testid="plan-form-active"
                  />
                  <span>Visible to users</span>
                </label>
              </Field>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <button onClick={close} className="btn btn-ghost" data-testid="plan-form-cancel">
                Cancel
              </button>
              <button
                onClick={save}
                disabled={busy}
                className="btn btn-primary"
                data-testid="plan-form-save"
              >
                <Save className="h-4 w-4" /> {busy ? "Saving…" : "Save"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Field({ label, hint, children }) {
  return (
    <label className="block text-sm">
      <div className="text-[11px] uppercase tracking-[0.16em] text-muted-foreground font-semibold mb-1">
        {label}
        {hint && <span className="ml-2 normal-case tracking-normal text-muted-foreground/80">— {hint}</span>}
      </div>
      {children}
    </label>
  );
}
