import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trophy, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import MockCorrectionPreview from "../../features/study/components/MockCorrectionPreview";
import { Eyebrow, StatusDot } from "../../shared/ui/studyos";

// Error-type tagging is not part of the current mock-logging contract.
// These categories render as a "not connected" preview so the panel never
// fabricates per-question error data the backend does not track.
const ERROR_TYPES = ["Concept gap", "Calculation slip", "Time pressure", "Misread", "Guesswork"];

export default function Mocks() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  // Review status is tracked locally — there is no review-state endpoint yet.
  const [reviewState, setReviewState] = useState({});
  const [form, setForm] = useState({
    name: "", exam_slug: "ssc-cgl-2026", score: "", max_score: 200,
    duration_min: 60, attempted: "", correct: "", weak: "",
  });

  async function load() {
    const d = await api.get("/api/study/mocks");
    const list = Array.isArray(d?.items) ? d.items : [];
    setItems(list);
    setSelectedId((prev) => prev ?? (list[0]?.id ?? null));
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

  const pct = (m) => Number(m?.percentage ?? 0);
  const avg = items.length ? Math.round(items.reduce((a, b) => a + pct(b), 0) / items.length) : 0;
  const best = items.length ? Math.max(...items.map(pct)) : 0;

  // Trend = comparison of the two most recently logged mocks (list order is
  // newest-first or oldest-first depending on the API; we compare endpoints).
  const trend = useMemo(() => {
    if (items.length < 2) return null;
    const first = pct(items[items.length - 1]);
    const last = pct(items[0]);
    return Math.round(last - first);
  }, [items]);

  const selected = items.find((m) => m.id === selectedId) || null;
  const selectedReview = (selected && reviewState[selected.id]) || "unreviewed";

  function setSelectedReview(value) {
    if (!selected) return;
    setReviewState((prev) => ({ ...prev, [selected.id]: value }));
  }

  return (
    <div className="space-y-6" data-testid="mocks-page">
      <header className="flex items-end justify-between flex-wrap gap-4">
        <div>
          <Eyebrow>Mocks · analysis</Eyebrow>
          <h1 className="font-heading text-[36px] leading-[1.05] mt-2">
            Turn every mock into a correction plan.
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[64ch]">
            A mock is just data until you review it. Log every mock honestly — the trend tells the truth.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <StatusDot state="live" label="" />
          <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="add-mock-btn">
            <Plus className="h-4 w-4" /> Log a mock
          </button>
        </div>
      </header>

      <div className="grid md:grid-cols-4 gap-4">
        <Stat label="Mocks logged" value={items.length} />
        <Stat label="Average score" value={`${avg}%`} />
        <Stat label="Best" value={items.length ? `${best}%` : "—"} />
        <Stat
          label="Trend"
          value={trend === null ? "—" : `${trend > 0 ? "+" : ""}${trend}%`}
          tone={trend === null ? "flat" : trend >= 0 ? "up" : "down"}
          foot={trend === null ? "Log 2+ mocks" : "First → latest"}
        />
      </div>

      {items.length === 0 ? (
        <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5">
          <div className="text-center py-10">
            <Trophy className="h-6 w-6 text-clay-500 mx-auto" />
            <div className="mt-3 font-heading text-lg font-semibold">No mocks yet</div>
            <div className="text-sm text-muted-foreground">Once you log a few, the trend line and analysis will live here.</div>
          </div>
        </div>
      ) : (
        <div className="grid lg:grid-cols-5 gap-4">
          {/* Mock log list */}
          <div className="soft-card grain relative overflow-hidden rounded-[18px] p-4 lg:col-span-2">
            <div className="eyebrow">Mock log</div>
            <ul className="mt-3 space-y-1.5">
              {items.map((m) => {
                const active = m.id === selectedId;
                const rs = reviewState[m.id] || "unreviewed";
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-pressed={active}
                      className={`w-full text-left rounded-xl p-3 transition border ${
                        active
                          ? "bg-dusk-900 text-white border-dusk-900"
                          : "bg-white/60 border-border hover:bg-clay-50"
                      }`}
                      data-testid={`mock-row-${m.id}`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="font-semibold text-sm truncate">{m.name}</div>
                        <div className="font-heading text-lg font-semibold tabular-nums">{pct(m)}%</div>
                      </div>
                      <div className={`text-xs mt-0.5 ${active ? "text-white/70" : "text-muted-foreground"}`}>
                        {m.exam_slug} · {m.correct}/{m.attempted} correct
                      </div>
                      <span
                        className={`mt-1.5 inline-block pill text-[10px] ${
                          rs === "reviewed" ? "pill-sage" : rs === "correction" ? "pill-amber" : "pill-clay"
                        }`}
                      >
                        {rs === "reviewed" ? "Reviewed" : rs === "correction" ? "Correction tasks drafted" : "Unreviewed"}
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>

          {/* Analysis panel */}
          <div className="lg:col-span-3 space-y-4">
            {selected ? (
              <>
                <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <div className="eyebrow">Mock analysis</div>
                      <h2 className="font-heading text-2xl font-semibold mt-0.5">{selected.name}</h2>
                      <div className="text-sm text-muted-foreground mt-0.5">
                        {selected.exam_slug} · {selected.duration_min} min · {selected.score}/{selected.max_score}
                      </div>
                    </div>
                    <div className="text-right">
                      <div className="font-heading text-3xl font-semibold">{pct(selected)}%</div>
                      <div className="text-xs text-muted-foreground">{selected.correct}/{selected.attempted} correct</div>
                    </div>
                  </div>

                  {/* Review status — local only */}
                  <div className="mt-4 pt-4 border-t border-border">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="eyebrow">Review status</div>
                      <span className="pill pill-dusk text-[10px]">Tracked on this device</span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Review status">
                      {[
                        { v: "unreviewed", l: "Unreviewed" },
                        { v: "reviewed", l: "Reviewed" },
                        { v: "correction", l: "Correction tasks drafted" },
                      ].map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          aria-pressed={selectedReview === opt.v}
                          onClick={() => setSelectedReview(opt.v)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                            selectedReview === opt.v
                              ? "bg-dusk-900 text-white border-dusk-900"
                              : "bg-white/70 text-foreground/80 border-border hover:bg-clay-50"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>

                {/* Weak topics — real logged data */}
                <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5">
                  <div className="eyebrow">Weak topics</div>
                  {Array.isArray(selected.weak_topics) && selected.weak_topics.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.weak_topics.map((w, i) => (
                        <span key={`${w}-${i}`} className="pill pill-clay text-xs">{w}</span>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-muted-foreground">
                      No weak topics were tagged for this mock. Add them when logging to sharpen analysis.
                    </p>
                  )}
                </div>

                {/* Error type panel — not connected */}
                <div className="soft-card grain relative overflow-hidden rounded-[18px] p-5">
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-clay-600" aria-hidden="true" />
                      <div className="eyebrow">Error patterns</div>
                    </div>
                    <span className="pill pill-dusk text-[10px]">Not connected</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ERROR_TYPES.map((e) => (
                      <span key={e} className="pill text-[10px] uppercase tracking-wider text-muted-foreground border border-clay-200">
                        {e}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-muted-foreground">
                    Per-question error tagging needs review tooling — these categories are
                    shown as a static example, not live data.
                  </p>
                </div>

                {/* Correction task preview */}
                <MockCorrectionPreview weakTopics={selected.weak_topics} />
              </>
            ) : (
              <div className="soft-card grain relative overflow-hidden rounded-[18px] p-8 text-center text-sm text-muted-foreground">
                Select a mock from the log to see its analysis.
              </div>
            )}
          </div>
        </div>
      )}

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

function Stat({ label, value, foot, tone = "flat" }) {
  const Icon = tone === "down" ? TrendingDown : TrendingUp;
  const iconClass = tone === "down" ? "text-dusk-500" : "text-clay-500";
  return (
    <div className="soft-card grain relative overflow-hidden rounded-[14px] px-4 py-3.5">
      <Eyebrow>{label}</Eyebrow>
      <div className="mt-1.5 flex items-center gap-2">
        <Icon className={`h-4 w-4 ${iconClass}`} aria-hidden="true" />
        <div className="font-heading text-[24px] leading-none font-semibold">{value}</div>
      </div>
      {foot ? <div className="text-[11px] text-clay-700 mt-2">{foot}</div> : null}
    </div>
  );
}

function F({ label, children }) {
  return (
    <label className="block">
      <Eyebrow className="mb-1">{label}</Eyebrow>
      {children}
    </label>
  );
}
