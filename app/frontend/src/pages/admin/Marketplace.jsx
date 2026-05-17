import React, { useCallback, useEffect, useState } from "react";
import { AlertTriangle, Store } from "lucide-react";
import { api, getApiErrorMessage } from "../../lib/api";
import { EmptyState, LoadingSkeleton, StatusBadge } from "../../shared/ui";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "courses", label: "Courses" },
  { id: "orders", label: "Orders" },
  { id: "refunds", label: "Refunds" },
  { id: "providers", label: "Providers" },
  { id: "flags", label: "Flags" },
];

export default function AdminMarketplace() {
  const [tab, setTab] = useState("overview");

  return (
    <div className="space-y-6" data-testid="admin-marketplace">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Marketplace admin</div>
          <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">Courses, orders, refunds.</h1>
          <p className="mt-1 text-sm text-muted-foreground">Manage paid course inventory and money flow. Every write here is audited.</p>
        </div>
      </header>

      <nav className="flex flex-wrap gap-2" role="tablist">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            role="tab"
            aria-selected={tab === t.id}
            data-testid={`mkt-tab-${t.id}`}
            className={`px-3 py-1.5 text-xs rounded-full font-semibold ${
              tab === t.id ? "bg-[#FFFDF9] border border-[#D9C7A7]" : "bg-white/70 border border-[#E7DECB] hover:bg-[#F3EADB]"
            }`}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab />}
      {tab === "courses" && <CoursesTab />}
      {tab === "orders" && <OrdersTab />}
      {tab === "refunds" && <RefundsTab />}
      {tab === "providers" && <ProvidersTab />}
      {tab === "flags" && <FlagsTab />}
    </div>
  );
}

function OverviewTab() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/admin/marketplace/kpis")
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="cards" />;
  if (!data) return <EmptyState icon={Store} title="No KPIs available" description="Admin marketplace KPIs failed to load." />;

  const c = data.counts || {};
  return (
    <div className="grid gap-4 md:grid-cols-3">
      <Stat label="Courses published" value={c.courses_published} />
      <Stat label="Courses draft" value={c.courses_draft} />
      <Stat label="Active enrollments" value={c.enrollments_active} />
      <Stat label="Orders paid" value={c.orders_paid} />
      <Stat label="Orders refunded" value={c.orders_refunded} />
      <Stat label="Open refunds" value={c.refunds_open} />
      <Stat label="GMV (INR)" value={`₹${Number(data.gmv_inr || 0).toLocaleString()}`} />
      <Stat label="Refund rate" value={`${((data.refund_rate || 0) * 100).toFixed(2)}%`} />
    </div>
  );
}

function CoursesTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [error, setError] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    const params = filter === "all" ? "" : `?status=${filter}`;
    api
      .get(`/api/admin/marketplace/courses${params}`)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const act = async (id, action) => {
    setError("");
    try {
      await api.post(`/api/admin/marketplace/courses/${id}/${action}`, {});
      refresh();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  return (
    <section className="soft-card rounded-2xl p-5 space-y-3" data-testid="mkt-tab-content-courses">
      <div className="flex flex-wrap gap-2">
        {["all", "draft", "published", "archived"].map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            data-testid={`mkt-courses-filter-${s}`}
            className={`px-2.5 py-1 text-xs rounded-full ${
              filter === s ? "bg-[#FFFDF9] border border-[#D9C7A7]" : "bg-white/70 border border-[#E7DECB]"
            }`}
          >
            {s}
          </button>
        ))}
      </div>
      {error ? <div className="text-xs text-rose-700">{error}</div> : null}
      {loading ? <LoadingSkeleton variant="rows" /> : null}
      {!loading && items.length === 0 ? <EmptyState icon={Store} title="No courses" description="Nothing matches this filter." /> : null}
      <div className="grid gap-2">
        {items.map((c) => (
          <article key={c.id} className="rounded-xl border border-border bg-white/60 p-3" data-testid={`admin-course-${c.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-semibold truncate">{c.title}</div>
                <div className="text-xs text-muted-foreground">
                  ₹{Number(c.price_inr || 0).toLocaleString()} · {c.level} · {c.language} ·{" "}
                  <StatusBadge status={c.status === "published" ? "verified" : c.status === "archived" ? "rejected" : "pending"} label={c.status} />
                </div>
              </div>
              <div className="flex gap-2">
                {c.status !== "published" && (
                  <button className="btn btn-primary text-xs" data-testid={`publish-${c.id}`} onClick={() => act(c.id, "publish")}>
                    Publish
                  </button>
                )}
                {c.status !== "archived" && (
                  <button className="btn btn-ghost text-xs" data-testid={`archive-${c.id}`} onClick={() => act(c.id, "archive")}>
                    Archive
                  </button>
                )}
              </div>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function OrdersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("");

  useEffect(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    api
      .get(`/api/admin/marketplace/orders${qs}`)
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, [filter]);

  return (
    <section className="soft-card rounded-2xl p-5 space-y-3" data-testid="mkt-tab-content-orders">
      <div className="flex flex-wrap gap-2">
        {["", "created", "paid", "refunded", "failed", "cancelled"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1 text-xs rounded-full ${
              filter === s ? "bg-[#FFFDF9] border border-[#D9C7A7]" : "bg-white/70 border border-[#E7DECB]"
            }`}
          >
            {s || "all"}
          </button>
        ))}
      </div>
      {loading ? <LoadingSkeleton variant="rows" /> : null}
      <div className="grid gap-2">
        {items.map((o) => (
          <div key={o.id} className="rounded-xl border border-border bg-white/60 p-3 text-sm" data-testid={`admin-order-${o.id}`}>
            <div className="flex flex-wrap justify-between gap-2">
              <div className="font-mono text-xs truncate">{o.id}</div>
              <div>
                <StatusBadge
                  status={o.status === "paid" ? "verified" : o.status === "refunded" ? "rejected" : "pending"}
                  label={o.status}
                />
              </div>
            </div>
            <div className="mt-1 text-xs text-muted-foreground">
              ₹{Number(o.amount_inr || 0).toLocaleString()} · user {o.user_id?.slice(0, 8)} · course {o.course_id?.slice(0, 8)}
            </div>
          </div>
        ))}
        {!loading && !items.length ? <div className="text-sm text-muted-foreground">No orders.</div> : null}
      </div>
    </section>
  );
}

function RefundsTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState("");

  const refresh = useCallback(() => {
    setLoading(true);
    const qs = filter ? `?status=${filter}` : "";
    api
      .get(`/api/admin/marketplace/refunds${qs}`)
      .then((d) => setItems(d.items || []))
      .catch((e) => setError(getApiErrorMessage(e)))
      .finally(() => setLoading(false));
  }, [filter]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const decide = async (id, action) => {
    setError("");
    try {
      await api.post(`/api/admin/marketplace/refunds/${id}/${action}`, {});
      refresh();
    } catch (e) {
      setError(getApiErrorMessage(e));
    }
  };

  return (
    <section className="soft-card rounded-2xl p-5 space-y-3" data-testid="mkt-tab-content-refunds">
      <div className="flex flex-wrap gap-2">
        {["", "requested", "approved", "processed", "denied", "failed"].map((s) => (
          <button
            key={s || "all"}
            onClick={() => setFilter(s)}
            className={`px-2.5 py-1 text-xs rounded-full ${
              filter === s ? "bg-[#FFFDF9] border border-[#D9C7A7]" : "bg-white/70 border border-[#E7DECB]"
            }`}
          >
            {s || "all"}
          </button>
        ))}
      </div>
      {error ? <div className="text-xs text-rose-700">{error}</div> : null}
      {loading ? <LoadingSkeleton variant="rows" /> : null}
      <div className="grid gap-2">
        {items.map((r) => (
          <div key={r.id} className="rounded-xl border border-border bg-white/60 p-3 text-sm" data-testid={`admin-refund-${r.id}`}>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <div className="font-mono text-xs">{r.id}</div>
                <div className="text-xs text-muted-foreground mt-1">
                  ₹{Number(r.amount_inr || 0).toLocaleString()} · order {r.order_id?.slice(0, 8)} · {r.reason || "—"}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <StatusBadge
                  status={
                    r.status === "processed" ? "verified" :
                    r.status === "denied" || r.status === "failed" ? "rejected" : "pending"
                  }
                  label={r.status}
                />
                {r.status === "requested" ? (
                  <>
                    <button data-testid={`refund-approve-${r.id}`} className="btn btn-primary text-xs" onClick={() => decide(r.id, "approve")}>
                      Approve
                    </button>
                    <button data-testid={`refund-deny-${r.id}`} className="btn btn-ghost text-xs" onClick={() => decide(r.id, "deny")}>
                      Deny
                    </button>
                  </>
                ) : null}
              </div>
            </div>
          </div>
        ))}
        {!loading && !items.length ? <div className="text-sm text-muted-foreground">No refunds.</div> : null}
      </div>
    </section>
  );
}

function ProvidersTab() {
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    api
      .get("/api/admin/marketplace/providers")
      .then((d) => setItems(d.items || []))
      .catch(() => setItems([]))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingSkeleton variant="rows" />;
  if (!items.length) return <EmptyState icon={Store} title="No providers" description="Instructors will appear here once added." />;
  return (
    <section className="soft-card rounded-2xl p-5 space-y-2" data-testid="mkt-tab-content-providers">
      {items.map((p) => (
        <div key={p.id} className="rounded-xl border border-border bg-white/60 p-3" data-testid={`provider-${p.id}`}>
          <div className="font-semibold">{p.full_name}</div>
          <div className="text-xs text-muted-foreground">{p.instructor_bio?.slice(0, 200) || "—"}</div>
        </div>
      ))}
    </section>
  );
}

function FlagsTab() {
  const [flags, setFlags] = useState(null);
  useEffect(() => {
    api.get("/api/admin/marketplace").then((d) => setFlags(d?.flags || [])).catch(() => setFlags([]));
  }, []);
  if (flags === null) return <LoadingSkeleton variant="cards" />;
  if (!flags.length) {
    return (
      <section className="soft-card rounded-2xl p-5" data-testid="mkt-tab-content-flags">
        <EmptyState icon={Store} title="No open disputes" description="Marketplace flags will appear here." />
      </section>
    );
  }
  return (
    <section className="soft-card rounded-2xl p-5" data-testid="mkt-tab-content-flags">
      <div className="flex items-center gap-2">
        <AlertTriangle className="h-4 w-4 text-amber-700" />
        <h2 className="font-semibold">Active flags</h2>
      </div>
      <div className="mt-4 grid gap-3">
        {flags.map((flag) => (
          <article key={flag.id} className="rounded-xl border border-border bg-white/60 p-4">
            <div className="font-semibold truncate">{flag.target || flag.resource_id}</div>
            <div className="mt-1 text-xs text-muted-foreground">{flag.kind || flag.reason}</div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>
      <div className="mt-2 font-heading text-3xl font-semibold">{value ?? "-"}</div>
    </div>
  );
}
