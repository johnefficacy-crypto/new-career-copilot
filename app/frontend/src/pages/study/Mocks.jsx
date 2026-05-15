import React, { useEffect, useMemo, useState } from "react";
import { Plus, Trophy, TrendingUp, TrendingDown, AlertTriangle } from "lucide-react";
import { api } from "../../lib/api";
import MockCorrectionPreview from "../../features/study/components/MockCorrectionPreview";
import { Card, Drawer, Eyebrow, PageHeader, Pill, SectionHeader, StatusDot } from "../../shared/ui/studyos";

const ERROR_TYPES = ["concept_gap", "calculation_slip", "time_pressure", "misread", "guesswork"];

const REVIEW_OPTIONS = [
  { v: "unreviewed", l: "Unreviewed", tone: "amber" },
  { v: "reviewed", l: "Reviewed", tone: "sage" },
  { v: "correction", l: "Correction tasks drafted", tone: "ink" },
];

export default function Mocks() {
  const [items, setItems] = useState([]);
  const [open, setOpen] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewForm, setReviewForm] = useState({
    review_status: "reviewed",
    notes: "",
    errorTags: {}, // { concept_gap: count, ... }
  });
  const [correctionTasks, setCorrectionTasks] = useState([]);
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
  const selectedReview = selected?.review_status || "unreviewed";

  function openReviewDrawer() {
    if (!selected) return;
    setReviewForm({
      review_status: selected.review_status || "reviewed",
      notes: selected.notes || "",
      errorTags: selected.error_types || {},
    });
    setCorrectionTasks([]);
    setReviewOpen(true);
  }

  function bumpErrorTag(key) {
    setReviewForm((prev) => ({
      ...prev,
      errorTags: { ...prev.errorTags, [key]: (prev.errorTags[key] || 0) + 1 },
    }));
  }

  function clearErrorTag(key) {
    setReviewForm((prev) => {
      const next = { ...prev.errorTags };
      delete next[key];
      return { ...prev, errorTags: next };
    });
  }

  async function saveReview(generateCorrections) {
    if (!selected) return;
    setReviewBusy(true);
    try {
      const payload = {
        review_status: generateCorrections ? "correction" : reviewForm.review_status,
        notes: reviewForm.notes || null,
        error_types: Object.keys(reviewForm.errorTags).length ? reviewForm.errorTags : null,
      };
      await api.post(`/api/study/mocks/${selected.id}/review`, payload);
      if (generateCorrections) {
        const out = await api.post(`/api/study/mocks/${selected.id}/correction-tasks`, {});
        setCorrectionTasks(Array.isArray(out?.items) ? out.items : []);
      }
      await load();
    } catch (e) {
      if (process.env.NODE_ENV !== "production") console.error(e);
    } finally {
      setReviewBusy(false);
    }
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
                const rs = m.review_status || "unreviewed";
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
                      <Eyebrow>Review status · server-backed</Eyebrow>
                      <button
                        type="button"
                        className="btn btn-primary text-xs"
                        onClick={openReviewDrawer}
                        data-testid="open-review-drawer"
                      >
                        Review mock
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-1.5" role="group" aria-label="Review status">
                      {REVIEW_OPTIONS.map((opt) => (
                        <span
                          key={opt.v}
                          aria-pressed={selectedReview === opt.v}
                          className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                            selectedReview === opt.v
                              ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
                              : "bg-white/70 text-clay-700 border-[#E7DECB]"
                          }`}
                        >
                          {opt.l}
                        </span>
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

                {/* Error type panel — server-backed via mock review */}
                <Card>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-clay-600" aria-hidden="true" />
                      <Eyebrow>Error patterns</Eyebrow>
                    </div>
                    {selected.error_types && Object.keys(selected.error_types).length ? (
                      <span className="stamp stamp-live">Tagged</span>
                    ) : (
                      <span className="stamp stamp-preview">Awaiting review</span>
                    )}
                  </div>
                  {selected.error_types && Object.keys(selected.error_types).length ? (
                    <ul className="mt-3 space-y-1 text-[12px]">
                      {Object.entries(selected.error_types).map(([k, v]) => (
                        <li key={k} className="flex justify-between">
                          <span className="capitalize">{String(k).replace(/_/g, " ")}</span>
                          <span className="num-mono">{v}</span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <>
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {ERROR_TYPES.map((e) => (
                          <span key={e} className="pill pill-outline text-[10px] capitalize">
                            {e.replace(/_/g, " ")}
                          </span>
                        ))}
                      </div>
                      <p className="mt-3 text-[11px] text-clay-700">
                        Tag your errors in the review drawer — counts persist server-side and feed
                        next-week adaptation. Automatic answer-sheet parsing is{" "}
                        <span className="stamp stamp-notcon">Not connected</span>.
                      </p>
                    </>
                  )}
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

      <Drawer
        open={reviewOpen}
        onClose={() => setReviewOpen(false)}
        title={selected ? `Review · ${selected.test_name || selected.name || "mock"}` : "Review mock"}
        width={460}
      >
        {selected ? (
          <div className="space-y-4" data-testid="review-mock-drawer">
            <div className="space-y-1.5">
              <Eyebrow>Status</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {REVIEW_OPTIONS.map((opt) => (
                  <button
                    key={opt.v}
                    type="button"
                    onClick={() => setReviewForm((p) => ({ ...p, review_status: opt.v }))}
                    aria-pressed={reviewForm.review_status === opt.v}
                    className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                      reviewForm.review_status === opt.v
                        ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
                        : "bg-white/70 text-clay-700 border-[#E7DECB] hover:bg-[#F3EADB]"
                    }`}
                  >
                    {opt.l}
                  </button>
                ))}
              </div>
            </div>

            <div className="space-y-1.5">
              <Eyebrow>Error tags · click to count</Eyebrow>
              <div className="flex flex-wrap gap-1.5">
                {ERROR_TYPES.map((e) => {
                  const count = reviewForm.errorTags[e] || 0;
                  return (
                    <button
                      key={e}
                      type="button"
                      onClick={() => bumpErrorTag(e)}
                      onContextMenu={(ev) => {
                        ev.preventDefault();
                        clearErrorTag(e);
                      }}
                      className={`px-2.5 py-1 rounded-full text-[11px] font-semibold border transition ${
                        count ? "bg-[#F3EADB] border-[#2E2218]" : "bg-white/70 border-[#E7DECB]"
                      }`}
                      title="Click to bump · right-click to clear"
                    >
                      <span className="capitalize">{e.replace(/_/g, " ")}</span>
                      {count ? <span className="ml-1.5 num-mono">×{count}</span> : null}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-1.5">
              <Eyebrow>Notes</Eyebrow>
              <textarea
                className="w-full rounded-xl border border-[#E7DECB] bg-white/85 p-2.5 text-[13px]"
                rows={3}
                value={reviewForm.notes}
                onChange={(e) => setReviewForm((p) => ({ ...p, notes: e.target.value }))}
                placeholder="What went wrong? What will you change next time?"
              />
            </div>

            {correctionTasks.length ? (
              <div className="rounded-xl bg-clay-50 p-3">
                <Eyebrow>Generated correction tasks</Eyebrow>
                <ul className="mt-2 space-y-1 text-[12px]">
                  {correctionTasks.map((t) => (
                    <li key={t.id}>· {t.title}</li>
                  ))}
                </ul>
              </div>
            ) : null}

            <div className="flex justify-end gap-2 pt-2 border-t border-[#E7DECB]">
              <button
                type="button"
                className="btn btn-ghost"
                onClick={() => saveReview(false)}
                disabled={reviewBusy}
              >
                {reviewBusy ? "Saving…" : "Save review"}
              </button>
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => saveReview(true)}
                disabled={reviewBusy}
                data-testid="generate-correction-tasks"
              >
                {reviewBusy ? "Generating…" : "Save + add correction tasks"}
              </button>
            </div>
          </div>
        ) : null}
      </Drawer>

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
