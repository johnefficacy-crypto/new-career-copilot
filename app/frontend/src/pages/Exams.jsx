import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Bookmark, ChevronRight, ShieldCheck, RefreshCw, AlertCircle, Sparkles } from "lucide-react";
import { api } from "../lib/api";

const STAGES = ["Notification", "Open", "Closed", "Result"];
const STAGE_INDEX = {
  draft: 0,
  upcoming: 0,
  notification: 0,
  open: 1,
  apply: 1,
  active: 1,
  closed: 2,
  exam: 2,
  result: 3,
  completed: 3,
};

function StatusPill({ status }) {
  const map = {
    eligible: { cls: "pill-sage", label: "Eligible", icon: ShieldCheck },
    conditional: { cls: "pill-dusk", label: "Conditional", icon: AlertCircle },
    urgent: { cls: "pill-clay", label: "Closing soon", icon: Sparkles },
  };
  const cfg = map[status];
  if (!cfg) return null;
  const Icon = cfg.icon;
  return (
    <span className={`pill ${cfg.cls} inline-flex items-center gap-1`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function Exams() {
  const [data, setData] = useState({ items: [], counts: {} });
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState(null);

  async function load() {
    const qs = new URLSearchParams();
    if (filter !== "all") qs.set("status", filter);
    if (q.trim()) qs.set("q", q.trim());
    const d = await api.get(`/api/recruitments?${qs.toString()}`);
    setData(d);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [filter]);

  async function recompute() {
    setRecomputing(true);
    setRecomputeMsg(null);
    try {
      const r = await api.post("/api/eligibility/recompute", {});
      setRecomputeMsg(
        `Recomputed: ${r.processed} posts evaluated · ${r.eligible} eligible · ${r.conditional} conditional`
      );
      await load();
    } catch (e) {
      setRecomputeMsg(`Recompute failed: ${e.message}`);
    } finally {
      setRecomputing(false);
    }
  }

  async function toggleSave(e, id) {
    e.preventDefault();
    e.stopPropagation();
    await api.post(`/api/recruitments/${id}/save`, {});
    load();
  }

  const tabs = [
    { id: "all", label: `All · ${data.counts.all ?? 0}` },
    { id: "eligible", label: `Eligible · ${data.counts.eligible ?? 0}` },
    { id: "urgent", label: `Closing soon · ${data.counts.urgent ?? 0}` },
    { id: "conditional", label: `Conditional · ${data.counts.conditional ?? 0}` },
  ];

  return (
    <div className="space-y-6" data-testid="exams-page">
      <div className="flex items-start justify-between flex-wrap gap-4">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Recruitments
          </div>
          <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">Exams</h1>
          <p className="text-muted-foreground mt-1">
            Live recruitments matched to your profile by the deterministic eligibility engine.
          </p>
        </div>
        <button
          onClick={recompute}
          disabled={recomputing}
          data-testid="recompute-btn"
          className="btn btn-ghost"
        >
          <RefreshCw className={`h-4 w-4 ${recomputing ? "animate-spin" : ""}`} />
          {recomputing ? "Recomputing…" : "Recompute eligibility"}
        </button>
      </div>

      {recomputeMsg && (
        <div
          data-testid="recompute-msg"
          className={`rounded-xl p-3 text-xs border ${recomputeMsg.toLowerCase().includes("failed") ? "bg-red-50 border-red-200 text-red-700" : "bg-sage-100/60 border-sage-200"}`}
        >
          {recomputeMsg}
        </div>
      )}

      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex flex-wrap gap-2">
          {tabs.map((t) => (
            <button
              key={t.id}
              data-testid={`filter-${t.id}`}
              onClick={() => setFilter(t.id)}
              className={`px-3.5 py-1.5 rounded-full text-xs font-semibold ${
                filter === t.id
                  ? "bg-clay-500 text-white"
                  : "bg-white/70 border border-border hover:border-clay-300"
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
        <div className="text-[11px] text-muted-foreground">Tip: update Profile and recompute to refresh your eligibility verdicts.</div>
      </div>

      <div className="space-y-3">
        {data.items.length === 0 && (
          <div
            data-testid="exams-empty"
            className="soft-card rounded-2xl p-10 text-center text-muted-foreground"
          >
            No published recruitments match this filter yet. Try{" "}
            <button onClick={recompute} className="link-under">
              recomputing eligibility
            </button>
            {" "}or check back after the next ingestion run.
          </div>
        )}

        {data.items.map((e) => {
          const stageIdx = STAGE_INDEX[(e.stage || "").toLowerCase()] ?? 0;
          const elig = e.eligibility || {};
          const orgCode = e.organization_code || (e.organization || "—").slice(0, 4).toUpperCase();
          const close = e.apply_window?.close;
          const closeFmt = close ? new Date(close).toLocaleDateString("en-IN", { day: "numeric", month: "short" }) : null;
          return (
            <Link
              key={e.id}
              to={`/app/exams/${e.id}`}
              className="block soft-card rounded-2xl p-5 hover:border-clay-300 transition"
              data-testid={`exam-${e.id}`}
            >
              <div className="flex items-start gap-5 flex-wrap">
                <div className="flex items-start gap-4 flex-1 min-w-[280px]">
                  <div className="h-12 w-12 rounded-xl bg-clay-100 grid place-items-center font-heading font-semibold text-xs text-clay-700">
                    {orgCode}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-heading font-semibold text-lg">{e.name}</h3>
                      <StatusPill status={e.status} />
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {e.organization}
                      {e.year ? ` · ${e.year}` : ""}
                    </div>
                    {(elig.fail_reasons || []).length > 0 && (
                      <div className="mt-2 text-xs text-clay-700">
                        {elig.fail_reasons[0]}
                      </div>
                    )}
                    {elig.eligible && (
                      <div className="mt-2 text-xs text-sage-700">
                        You're eligible — apply window {closeFmt ? `closes ${closeFmt}` : "open"}.
                      </div>
                    )}
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <div className="text-[10px] uppercase tracking-widest text-muted-foreground">
                      Vacancies
                    </div>
                    <div className="font-heading font-semibold text-lg">
                      {e.vacancies?.toLocaleString() || "—"}
                    </div>
                  </div>
                  <button
                    onClick={(ev) => toggleSave(ev, e.id)}
                    data-testid={`save-${e.id}`}
                    className={`h-10 w-10 grid place-items-center rounded-xl border transition ${
                      e.saved
                        ? "bg-clay-500 border-clay-500 text-white"
                        : "border-border hover:border-clay-300"
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
                      <div
                        className={`mt-1.5 text-[10px] uppercase tracking-wider font-semibold ${
                          active ? "text-foreground" : "text-muted-foreground"
                        }`}
                      >
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
