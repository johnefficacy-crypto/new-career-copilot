import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, ShieldCheck } from "lucide-react";
import { api } from "../lib/api";

const STAGES = ["Notification", "Apply", "Admit Card", "Exam", "Result"];
const STAGE_INDEX = { notification: 0, apply: 1, admit_card: 2, prelims: 3, exam: 3, result: 4 };

export default function Exams() {
  const [data, setData] = useState({ items: [], counts: {} });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");

  async function load() {
    const qs = new URLSearchParams();
    if (filter !== "all") qs.set("status", filter);
    if (q) qs.set("q", q);
    const d = await api.get(`/api/recruitments?${qs.toString()}`);
    setData(d);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [filter]);

  async function toggleSave(e, slug) {
    e.preventDefault();
    await api.post(`/api/recruitments/${slug}/save`, {});
    load();
  }

  const tabs = [
    { id: "all", label: `All · ${data.counts.all ?? 0}` },
    { id: "eligible", label: `Eligible · ${data.counts.eligible ?? 0}` },
    { id: "urgent", label: `Urgent · ${data.counts.urgent ?? 0}` },
    { id: "conditional", label: `Conditional · ${data.counts.conditional ?? 0}` },
  ];

  return (
    <div className="space-y-6" data-testid="exams-page">
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">Recruitments</div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Exams</h1>
        <p className="text-muted-foreground mt-1">All live recruitments matched to your profile, by urgency.</p>
      </div>

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={`filter-${t.id}`}
              onClick={() => setFilter(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                filter === t.id ? "bg-clay-500 text-white" : "bg-white/70 border border-border hover:border-clay-300"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <form
          onSubmit={(e) => {
            e.preventDefault();
            load();
          }}
          className="flex-1 max-w-xs"
        >
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search by name or org…"
            className="w-full px-4 py-2 rounded-full bg-white/80 border border-border text-sm"
            data-testid="exams-search"
          />
        </form>
      </div>

      <div className="space-y-3">
        {data.items.map((e) => {
          const stageIdx = STAGE_INDEX[e.stage] ?? 0;
          return (
            <Link
              key={e.slug}
              to={`/app/exams/${e.slug}`}
              className="block soft-card rounded-2xl p-5 hover:border-clay-300 transition"
              data-testid={`exam-${e.slug}`}
            >
              <div className="flex items-start gap-5 flex-wrap">
                <div className="flex items-start gap-4 flex-1 min-w-[280px]">
                  <div className="h-12 w-12 rounded-xl bg-clay-100 grid place-items-center font-heading font-semibold text-xs text-clay-700">
                    {e.organization_code}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-lg">{e.name}</h3>
                      <span className="pill pill-sage inline-flex items-center gap-1">
                        <ShieldCheck className="h-3 w-3" /> Official
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground">{e.organization}</div>
                    <div className="mt-2 text-xs text-foreground/75">{e.summary}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">Eligible posts</div>
                    <div className="font-heading font-semibold text-lg">
                      <span className={e.status === "conditional" ? "text-clay-600" : "text-sage-600"}>{e.posts_matched}</span>
                      <span className="text-muted-foreground text-sm">/{e.posts_total}</span>
                    </div>
                  </div>
                  <button
                    onClick={(ev) => toggleSave(ev, e.slug)}
                    data-testid={`save-${e.slug}`}
                    className={`h-10 w-10 grid place-items-center rounded-xl border transition ${
                      e.saved ? "bg-clay-500 border-clay-500 text-white" : "border-border hover:border-clay-300"
                    }`}
                  >
                    <Bookmark className="h-4 w-4" />
                  </button>
                  <div className="h-10 w-10 grid place-items-center rounded-xl bg-foreground/5">
                    <ChevronRight className="h-4 w-4" />
                  </div>
                </div>
              </div>

              <div className="mt-5 flex items-center gap-1.5">
                {STAGES.map((s, i) => {
                  const active = i <= stageIdx;
                  return (
                    <div key={s} className="flex-1">
                      <div className={`h-1.5 rounded-full ${active ? "bg-clay-500" : "bg-clay-100"}`} />
                      <div className={`mt-1.5 text-[10px] uppercase tracking-wider font-semibold ${active ? "text-foreground" : "text-muted-foreground"}`}>
                        {s}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
