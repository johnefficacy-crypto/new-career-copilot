import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  Bookmark,
  ChevronRight,
  ShieldCheck,
  RefreshCw,
  AlertCircle,
  Sparkles,
} from "lucide-react";
import { api } from "../../lib/api";

// Recruitment listing — queries /api/recruitments, shows apply-window
// stages, fee + save toggle. Detail view at
// /app/eligibility/recruitments/:id is rendered by the same component:
// selecting a row is a deep-link to a single recruitment row.
// A richer detail (notification proof, posts, eligibility breakdown,
// missing fields, apply window, source trust) is deferred — no
// /api/recruitments/:id/detail shape established yet.

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

export default function EligibleRecruitmentsPage() {
  const { id } = useParams();
  const [data, setData] = useState({ items: [], counts: {} });
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState("");
  const [filter, setFilter] = useState("all");
  const [q, setQ] = useState("");
  const [recomputing, setRecomputing] = useState(false);
  const [recomputeMsg, setRecomputeMsg] = useState(null);

  async function load() {
    setLoading(true);
    setErr("");
    try {
      const qs = new URLSearchParams();
      if (filter !== "all") qs.set("status", filter);
      if (q.trim()) qs.set("q", q.trim());
      const d = await api.get(`/api/recruitments?${qs.toString()}`);
      setData(d || { items: [], counts: {} });
    } catch (e) {
      setErr("Recruitments are temporarily unavailable.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  async function recompute() {
    setRecomputing(true);
    setRecomputeMsg(null);
    try {
      const r = await api.post("/api/eligibility/recompute", {});
      setRecomputeMsg(
        `Recomputed: ${r.processed} posts evaluated · ${r.eligible} eligible · ${r.conditional} conditional`,
      );
      await load();
    } catch (e) {
      setRecomputeMsg(`Recompute failed: ${e.message}`);
    } finally {
      setRecomputing(false);
    }
  }

  async function toggleSave(ev, recruitmentId) {
    ev.preventDefault();
    ev.stopPropagation();
    await api.post(`/api/recruitments/${recruitmentId}/save`, {});
    load();
  }

  const tabs = [
    { id: "all", label: `All · ${data.counts.all ?? 0}` },
    { id: "eligible", label: `Eligible · ${data.counts.eligible ?? 0}` },
    { id: "urgent", label: `Closing soon · ${data.counts.urgent ?? 0}` },
    { id: "conditional", label: `Conditional · ${data.counts.conditional ?? 0}` },
  ];

  // Detail view: a route param ":id" filters the list down to the single
  // matching recruitment. The page-level shell is shared so the user keeps
  // the chips + search visible even when deep-linked.
  const visibleItems = id
    ? data.items.filter((r) => String(r.id) === String(id) || r.slug === id)
    : data.items;

  return (
    <section
      data-testid="eligibility-recruitments-page"
      aria-labelledby="eligibility-recruitments-heading"
    >
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2
            id="eligibility-recruitments-heading"
            className="font-heading text-2xl font-semibold tracking-tight"
          >
            Open recruitments
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Live cycles matched to your profile by the deterministic eligibility engine.
          </p>
          {id ? (
            <Link
              to="/app/eligibility/recruitments"
              className="text-[12px] font-semibold link-under text-clay-700 mt-2 inline-block"
            >
              ← Back to all recruitments
            </Link>
          ) : null}
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
          className={`rounded-xl p-3 text-xs border mb-3 ${
            recomputeMsg.toLowerCase().includes("failed")
              ? "bg-red-50 border-red-200 text-red-700"
              : "bg-sage-100/60 border-sage-200"
          }`}
        >
          {recomputeMsg}
        </div>
      )}

      {!id && (
        <div className="flex items-center gap-3 flex-wrap mb-4">
          <div className="flex flex-wrap gap-2" role="tablist" aria-label="Recruitment filters">
            {tabs.map((t) => (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={filter === t.id}
                data-testid={`filter-${t.id}`}
                onClick={() => setFilter(t.id)}
                className={`px-3.5 py-1.5 rounded-full text-xs font-semibold focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2 ${
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
              data-testid="recruitments-search"
              aria-label="Search recruitments"
            />
          </form>
        </div>
      )}

      {err && <div className="text-xs text-clay-700 mb-3">{err}</div>}

      {loading ? (
        <div role="status" aria-live="polite" className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="soft-card rounded-2xl p-5 animate-pulse h-32" />
          ))}
          <span className="sr-only">Loading recruitments</span>
        </div>
      ) : visibleItems.length === 0 ? (
        <div
          data-testid="recruitments-empty"
          className="soft-card rounded-2xl p-10 text-center text-muted-foreground"
        >
          {id
            ? "Recruitment not found, or it's no longer published."
            : "No published recruitments match this filter yet. "}
          {!id && (
            <button onClick={recompute} className="link-under">
              recomputing eligibility
            </button>
          )}
          {!id && " or check back after the next ingestion run."}
        </div>
      ) : (
        <div className="space-y-3">
          {visibleItems.map((e) => {
            const stageIdx = STAGE_INDEX[(e.stage || "").toLowerCase()] ?? 0;
            const elig = e.eligibility || {};
            const orgCode =
              e.organization_code || (e.organization || "—").slice(0, 4).toUpperCase();
            const close = e.apply_window?.close;
            const closeFmt = close
              ? new Date(close).toLocaleDateString("en-IN", { day: "numeric", month: "short" })
              : null;
            return (
              <Link
                key={e.id}
                to={`/app/eligibility/recruitments/${e.id}`}
                className="block soft-card rounded-2xl p-5 hover:border-clay-300 transition"
                data-testid={`recruitment-${e.id}`}
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
                        <div className="mt-2 text-xs text-clay-700">{elig.fail_reasons[0]}</div>
                      )}
                      {elig.eligible && (
                        <div className="mt-2 text-xs text-sage-700">
                          You're eligible — apply window{" "}
                          {closeFmt ? `closes ${closeFmt}` : "open"}.
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
                        <div
                          className={`h-1.5 rounded-full ${active ? "bg-clay-500" : "bg-clay-100"}`}
                        />
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
      )}
    </section>
  );
}
