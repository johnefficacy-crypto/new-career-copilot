import React, { useEffect, useMemo, useState } from "react";
import { api, getApiErrorMessage } from "../../lib/api";

const EMPTY_FORM = {
  title: "",
  slug: "",
  excerpt: "",
  content: "",
  status: "draft",
  primary_intent: "eligibility",
  primary_cta_label: "Check your eligibility",
  primary_cta_url: "/app/onboarding/chat?source=blog&intent=eligibility",
  seo_title: "",
  seo_description: "",
};

export default function AdminBlogs() {
  const [items, setItems] = useState([]);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [form, setForm] = useState(EMPTY_FORM);

  async function load() {
    const params = new URLSearchParams();
    if (query) params.set("q", query);
    if (statusFilter) params.set("status", statusFilter);
    const d = await api.get(`/api/admin/blogs?${params.toString()}`);
    setItems(d.items || []);
  }

  useEffect(() => { load().catch((e) => setError(getApiErrorMessage(e))); }, []);

  const statusCounts = useMemo(() => items.reduce((acc, x) => {
    acc[x.status] = (acc[x.status] || 0) + 1;
    return acc;
  }, {}), [items]);

  const onSubmit = async (e) => {
    e.preventDefault();
    setSaving(true); setError("");
    try {
      await api.post("/api/admin/blogs", form);
      setForm(EMPTY_FORM);
      await load();
    } catch (err) {
      setError(getApiErrorMessage(err));
    } finally { setSaving(false); }
  };

  return <div className="stack" style={{ gap: 16 }}>
    <section className="card p-4">
      <h2 className="text-lg font-semibold">Blog funnel CMS · Phase 1</h2>
      <p className="text-sm text-muted-foreground">Draft/review/publish workflow with funnel intent + CTA fields.</p>
      <div className="row" style={{ gap: 8, marginTop: 12 }}>
        <input className="input" placeholder="Search title" value={query} onChange={(e) => setQuery(e.target.value)} />
        <select className="input" value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
          <option value="">All statuses</option><option value="draft">draft</option><option value="review">review</option><option value="published">published</option><option value="archived">archived</option>
        </select>
        <button className="btn" type="button" onClick={() => load().catch((e) => setError(getApiErrorMessage(e)))}>Filter</button>
      </div>
      <div className="text-xs mt-2">Counts: draft {statusCounts.draft || 0} · review {statusCounts.review || 0} · published {statusCounts.published || 0} · archived {statusCounts.archived || 0}</div>
    </section>

    <section className="card p-4">
      <h3 className="font-semibold">Create blog</h3>
      <form onSubmit={onSubmit} className="stack" style={{ gap: 8 }}>
        <input className="input" placeholder="Title" value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} required />
        <input className="input" placeholder="Slug" value={form.slug} onChange={(e) => setForm({ ...form, slug: e.target.value })} required />
        <textarea className="input" placeholder="Excerpt" value={form.excerpt} onChange={(e) => setForm({ ...form, excerpt: e.target.value })} />
        <textarea className="input" rows={8} placeholder="Content" value={form.content} onChange={(e) => setForm({ ...form, content: e.target.value })} />
        <div className="row" style={{ gap: 8 }}>
          <select className="input" value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}><option>draft</option><option>review</option><option>published</option><option>archived</option></select>
          <input className="input" placeholder="primary_intent" value={form.primary_intent} onChange={(e) => setForm({ ...form, primary_intent: e.target.value })} />
        </div>
        <input className="input" placeholder="Primary CTA label" value={form.primary_cta_label} onChange={(e) => setForm({ ...form, primary_cta_label: e.target.value })} />
        <input className="input" placeholder="Primary CTA URL" value={form.primary_cta_url} onChange={(e) => setForm({ ...form, primary_cta_url: e.target.value })} />
        <input className="input" placeholder="SEO title" value={form.seo_title} onChange={(e) => setForm({ ...form, seo_title: e.target.value })} />
        <textarea className="input" placeholder="SEO description" value={form.seo_description} onChange={(e) => setForm({ ...form, seo_description: e.target.value })} />
        {error ? <div className="text-red-600 text-sm">{error}</div> : null}
        <button className="btn" disabled={saving} type="submit">{saving ? "Saving..." : "Create blog"}</button>
      </form>
    </section>

    <section className="card p-4">
      <h3 className="font-semibold">Blog list</h3>
      <div className="stack" style={{ gap: 6 }}>
        {items.map((x) => <div key={x.id} className="border rounded p-2 text-sm">
          <div className="font-medium">{x.title}</div>
          <div className="text-xs text-muted-foreground">/{x.slug} · {x.status} · intent {x.primary_intent || "-"}</div>
        </div>)}
      </div>
    </section>
  </div>;
}
