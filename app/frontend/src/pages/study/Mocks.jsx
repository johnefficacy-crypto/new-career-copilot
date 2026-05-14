import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trophy, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import MockCorrectionPreview from "../../features/study/components/MockCorrectionPreview";
import { Card, Eyebrow, PageHeader, Pill, SectionHeader, StatusDot } from "../../shared/ui/studyos";

// Error-type tagging is not part of the current mock-logging contract.
// These categories render as a "not connected" preview so the panel never
// fabricates per-question error data the backend does not track.
const ERROR_TYPES = ["Concept gap", "Calculation slip", "Time pressure", "Misread", "Guesswork"];

const REVIEW_OPTIONS = [
  { v: "unreviewed", l: "Unreviewed", tone: "amber" },
  { v: "reviewed", l: "Reviewed", tone: "sage" },
  { v: "correction", l: "Correction tasks drafted", tone: "ink" },
];

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
      <PageHeader
        eyebrow="Mocks · analysis"
        title="Turn every mock into a correction plan."
        sub="A mock is just data until you review it. Log every mock honestly — the trend tells the truth, and we surface the weak topics worth correcting."
        right={
          <div className="flex items-center gap-3">
            <StatusDot state="live" label="" />
            <button onClick={() => setOpen(true)} className="btn btn-primary" data-testid="add-mock-btn">
              <Plus className="h-4 w-4" /> Log a mock
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
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
        <Card>
          <div className="text-center py-10">
            <Trophy className="h-6 w-6 text-clay-500 mx-auto" />
            <div className="mt-3 font-heading text-[18px]">No mocks yet</div>
            <div className="text-sm text-clay-700 mt-1">
              Once you log a few, the trend line and analysis will live here.
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid lg:grid-cols-[320px_1fr] gap-6 items-start">
          {/* Mock log list */}
          <Card padded={false}>
            <div className="px-5 pt-5 pb-3">
              <Eyebrow>Mock log · {items.length} logged</Eyebrow>
              <h2 className="font-heading text-[20px] mt-1">
                {items.length ? `Best ${best}%` : "—"}
              </h2>
            </div>
            <div className="hairline mx-5" />
            <ul className="px-3 py-3">
              {items.map((m) => {
                const active = m.id === selectedId;
                const rs = reviewState[m.id] || "unreviewed";
                return (
                  <li key={m.id}>
                    <button
                      type="button"
                      onClick={() => setSelectedId(m.id)}
                      aria-pressed={active}
                      data-testid={`mock-row-${m.id}`}
                      className={`w-full text-left rounded-xl px-3.5 py-3 mb-1 transition ${
                        active ? "bg-[#2E2218] text-[#F3EADB]" : "hover:bg-[#F3EADB]"
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className={`font-heading text-[15px] ${active ? "" : "text-clay-900"}`}>
                          {m.name}
                        </span>
                        <span className="num-mono text-[15px] font-semibold tabular-nums">{pct(m)}%</span>
                      </div>
                      <div
                        className={`flex items-center justify-between mt-1 text-[11.5px] ${
                          active ? "text-[#D6BC93]" : "text-clay-700"
                        }`}
                      >
                        <span className="num-mono">
                          {m.exam_slug} · {m.correct}/{m.attempted}
                        </span>
                        <span className="num-mono">
                          {rs === "reviewed" ? "reviewed" : rs === "correction" ? "correction" : "unreviewed"}
                        </span>
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>
          </Card>

          {/* Analysis panel */}
          <div className="space-y-6">
            {selected ? (
              <>
                <Card>
                  <SectionHeader
                    eyebrow="Mock analysis"
                    title={`${selected.name} · ${selected.score}/${selected.max_score}`}
                    sub={`${selected.exam_slug} · ${selected.duration_min} min · ${selected.correct}/${selected.attempted} correct`}
                    right={
                      <div className="text-right">
                        <div className="font-heading text-[30px] leading-none">{pct(selected)}%</div>
                        <div className="num-mono text-[10.5px] text-clay-700 mt-1">overall score</div>
                      </div>
                    }
                  />
                  <div className="rule pt-3">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <Eyebrow>Review status</Eyebrow>
                      <Pill tone="dusk">Tracked on this device</Pill>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Review status">
                      {REVIEW_OPTIONS.map((opt) => (
                        <button
                          key={opt.v}
                          type="button"
                          aria-pressed={selectedReview === opt.v}
                          onClick={() => setSelectedReview(opt.v)}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                            selectedReview === opt.v
                              ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
                              : "bg-white/70 text-clay-700 border-[#E7DECB] hover:bg-[#F3EADB]"
                          }`}
                        >
                          {opt.l}
                        </button>
                      ))}
                    </div>
                  </div>
                </Card>

                {/* Weak topics — real logged data */}
                <Card>
                  <Eyebrow>Weak topics surfaced</Eyebrow>
                  {Array.isArray(selected.weak_topics) && selected.weak_topics.length ? (
                    <div className="mt-3 flex flex-wrap gap-1.5">
                      {selected.weak_topics.map((w, i) => (
                        <Pill key={`${w}-${i}`} tone="rose">
                          {w}
                        </Pill>
                      ))}
                    </div>
                  ) : (
                    <p className="mt-2 text-sm text-clay-700">
                      No weak topics were tagged for this mock. Add them when logging to sharpen analysis.
                    </p>
                  )}
                </Card>

                {/* Error type panel — not connected */}
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-clay-600" aria-hidden="true" />
                      <Eyebrow>Error patterns</Eyebrow>
                    </div>
                    <span className="stamp stamp-notcon">Not connected</span>
                  </div>
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {ERROR_TYPES.map((e) => (
                      <span
                        key={e}
                        className="pill pill-outline text-[10px]"
                      >
                        {e}
                      </span>
                    ))}
                  </div>
                  <p className="mt-3 text-[11px] text-clay-700">
                    Per-question error tagging needs review tooling — these categories are shown as a
                    static example, not live data.
                  </p>
                </Card>

                {/* Correction task preview */}
                <MockCorrectionPreview weakTopics={selected.weak_topics} />
              </>
            ) : (
              <Card>
                <div className="text-center text-sm text-clay-700 py-6">
                  Select a mock from the log to see its analysis.
                </div>
              </Card>
            )}
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center drawer-bg p-4">
          <form
            onSubmit={submit}
            className="w-full max-w-lg soft-card rounded-2xl p-6 space-y-4"
            data-testid="mock-form"
          >
            <h2 className="font-heading text-[20px]">Log mock</h2>
            <div className="grid md:grid-cols-2 gap-3">
              <F label="Name">
                <input required className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              </F>
              <F label="Exam">
                <select className="input" value={form.exam_slug} onChange={(e) => setForm({ ...form, exam_slug: e.target.value })}>
                  {["ssc-cgl-2026", "ibps-po-xv", "rbi-grade-b-2026", "upsc-cse-2026", "sbi-clerk-2026"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </F>
              <F label="Score">
                <input required type="number" className="input" value={form.score} onChange={(e) => setForm({ ...form, score: e.target.value })} />
              </F>
              <F label="Max score">
                <input required type="number" className="input" value={form.max_score} onChange={(e) => setForm({ ...form, max_score: e.target.value })} />
              </F>
              <F label="Duration (min)">
                <input required type="number" className="input" value={form.duration_min} onChange={(e) => setForm({ ...form, duration_min: e.target.value })} />
              </F>
              <F label="Questions attempted">
                <input required type="number" className="input" value={form.attempted} onChange={(e) => setForm({ ...form, attempted: e.target.value })} />
              </F>
              <F label="Questions correct">
                <input required type="number" className="input" value={form.correct} onChange={(e) => setForm({ ...form, correct: e.target.value })} />
              </F>
              <F label="Weak topics (comma-sep)">
                <input className="input" value={form.weak} onChange={(e) => setForm({ ...form, weak: e.target.value })} />
              </F>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn btn-ghost" onClick={() => setOpen(false)}>
                Cancel
              </button>
              <button className="btn btn-primary" data-testid="mock-save">
                Save
              </button>
            </div>
            <style>{`.input { width:100%; padding: 0.55rem 0.9rem; border-radius: 0.75rem; background: rgba(255,255,255,0.85); border: 1px solid #E7DECB; font-size: 14px; }`}</style>
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
        <div className="font-heading text-[24px] leading-none">{value}</div>
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
