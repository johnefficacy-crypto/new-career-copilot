import React, { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../lib/api";

export default function CreateThread() {
  const nav = useNavigate();
  const [categories, setCategories] = useState([]);
  const [form, setForm] = useState({ title: "", category: "preparation", tag: "Discussion", body: "" });
  const [error, setError] = useState(null);

  useEffect(() => {
    api.get("/api/community/categories").then((d) => setCategories(d.items)).catch(() => {});
  }, []);

  async function submit(e) {
    e.preventDefault();
    setError(null);
    try {
      const t = await api.post("/api/community/threads", form);
      nav(`/app/community/${t.slug}`);
    } catch (err) {
      setError(err.message);
    }
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6" data-testid="create-thread-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">New thread</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Write clearly. Someone's week depends on it.</h1>
      </div>
      <form onSubmit={submit} className="soft-card rounded-2xl p-6 space-y-5" data-testid="thread-form">
        <label className="block">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Title</div>
          <input
            required
            minLength={6}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border text-sm"
            data-testid="thread-title"
          />
        </label>
        <div className="grid md:grid-cols-2 gap-4">
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Channel</div>
            <select
              value={form.category}
              onChange={(e) => setForm({ ...form, category: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm"
              data-testid="thread-category"
            >
              {categories.map((c) => <option key={c.id} value={c.id} disabled={c.admin_only}>#{c.id}{c.admin_only ? " (admin)" : ""}</option>)}
            </select>
          </label>
          <label className="block">
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Tag</div>
            <select
              value={form.tag}
              onChange={(e) => setForm({ ...form, tag: e.target.value })}
              className="w-full px-4 py-2.5 rounded-xl bg-white/80 border border-border text-sm"
            >
              {["Discussion", "Question", "Strategy", "Resource", "PYQ", "Tip"].map((x) => <option key={x}>{x}</option>)}
            </select>
          </label>
        </div>
        <label className="block">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">Body</div>
          <textarea
            required
            minLength={10}
            rows={10}
            value={form.body}
            onChange={(e) => setForm({ ...form, body: e.target.value })}
            className="w-full px-4 py-3 rounded-xl bg-white/80 border border-border text-sm"
            data-testid="thread-body"
          />
        </label>
        {error && <div className="text-destructive text-sm">{error}</div>}
        <div className="flex justify-end">
          <button className="btn btn-primary" data-testid="thread-submit">Post thread</button>
        </div>
      </form>
    </div>
  );
}
