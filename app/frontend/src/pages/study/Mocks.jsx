import React, { useEffect, useState } from "react";
import { Plus, Trophy, TrendingUp } from "lucide-react";
import { api } from "../../lib/api";

export default function Mocks() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    name: "", exam_slug: "ssc-cgl-2026", score: "", max_score: 200,
    duration_min: 60, attempted: "", correct: "", weak: "",
  });

  async function load() {
    const d = await api.get("/api/study/mocks");
    setItems(d.items);
  }
  useEffect(() => { load(); }, []);

  async function submit(e) {
    e.preventDefault();
    await api.post("/api/study/mocks", {
      name: form.name,
      exam_slug: form.exam_slug,
      score: Number(form.score),
      max_score: Number(form.max_score),
      duration_min: Number(form.duration_min),
      attempted: Number(form.attempted),
      correct: Number(form.correct),
      weak_topics: form.weak ? form.weak.split(",").map((s) => s.trim()) : [],
    });
    setOpen(false);
    setForm({ ...form, name: "", score: "", attempted: "", correct: "", weak: "" });
    load();
  }

  const avg = items.length ? Math.round(items.reduce((a, b) => a + b.percentage, 0) / items.length) : 0;

  return (
    <div className="space-y-6" data-testid="mocks-page">
      <div className="flex items-end justify-between flex-wrap gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Study OS · Mock tests</div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Your mock curve.</h1>
          <p className="text-muted-foreground mt-1">Log every mock honestly. The trend tells the truth.</p>
        </div>
        <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="add-mock-btn">
          <Plus className="h-4 w-4" /> Log a mock
        </button>
      </div>

      <div className="grid md:grid-cols-3 gap-4">
        <Stat label="Mocks logged" value={items.length} />
        <Stat label="Average score" value={`${avg}%`} />
        <Stat label="Best" value={items.length ? `${Math.max(...items.map((i) => i.percentage))}%` : "—"} />
      </div>

      <div className="soft-card rounded-2xl p-5">
        {items.length === 0 ? (
          <div className="text-center py-10">
            <Trophy className="h-6 w-6 text-clay-500 mx-auto" />
            <div className="mt-3 font-heading text-lg font-semibold">No mocks yet</div>
            <div className="text-sm text-muted-foreground">Once you log a few, the trend line will live here.</div>
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((m) => (
              <div key={m.id} className="flex items-center justify-between border-b border-border pb-3 last:border-0">
                <div>
                  <div className="font-semibold">{m.name}</div>
                  <div className="text-xs text-muted-foreground">{m.exam_slug} · {m.duration_min} min · {m.correct}/{m.attempted} correct</div>
                </div>
                <div className="text-right">
                  <div className="font-heading text-xl font-semibold">{m.percentage}%</div>
                  <div className="text-xs text-muted-foreground">{m.score} / {m.max_score}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/30 p-4">
          <form onSubmit={submit} className="w-full max-w-lg soft-card rounded-2xl p-6 space-y-4" data-testid="mock-form">
            <h2 className="font-heading text-xl font-semibold">Log mock</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <F label="Name"><input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} /></F>
              <F label="Exam">
                <select className="input" value={form.exam_slug} onChange={(e) => setForm({ ...form, exam_slug: e.target.value })}>
                  {["ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"].map((x) => <option key={x}>{x}</option>)}
                </select>
              </F>
              <F label="Score"><input required type="number" className="input" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} /></F>
              <F label="Max score"><input required type="number" className="input" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} /></F>
              <F label="Duration (min)"><input required type="number" className="input" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} /></F>
              <F label="Questions attempted"><input required type="number" className="input" value={form.attempted} onChange={(e) => setForm({ ...form, attempted: e.target.value })} /></F>
              <F label="Questions correct"><input required type="number" className="input" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} /></F>
              <F label="Weak topics (comma-sep)"><input className="input" value={form.weak} onChange={(e) => setForm({ ...form, weak: e.target.value })} /></F>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>Cancel</button>
              <button className="btn btn-primary" data-testid="mock-save">Save</button>
            </div>
            <style>{`.input { width:100%; padding: 0.55rem 0.9rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid hsl(var(--border)); font-size: 14px; }`}</style>
          </form>
        </div>
      )}
    </div>
  );
}

function Stat({ label, value }) {
  return (
    <div className="soft-card rounded-2xl p-5">
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">{label}</div>
      <div className="mt-2 flex items-center gap-2">
        <TrendingUp className="h-4 w-4 text-clay-500" />
        <div className="font-heading text-3xl font-semibold">{value}</div>
      </div>
    </div>
  );
}

function F({ label, children }) {
  return (
    <label className="block">
      <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1">{label}</div>
      {children}
    </label>
  );
}
