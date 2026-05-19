import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  BarChart3,
  Bookmark,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  ListChecks,
  ShieldCheck,
} from "lucide-react";
import { api } from "../lib/api";
import ExamIntelligenceTab from "../features/exams/ExamIntelligenceTab";

const TABS = [
  { id: "eligibility", label: "Eligibility & posts", icon: ShieldCheck },
  { id: "intelligence", label: "Exam intelligence", icon: BarChart3 },
];

function VerdictBadge({ verdict }) {
  const map = {
    eligible: { cls: "pill-sage", icon: ShieldCheck, label: "Eligible" },
    conditional: { cls: "pill-dusk", icon: AlertCircle, label: "Conditionally eligible" },
    pending: { cls: "pill-clay", icon: AlertCircle, label: "Awaiting computation" },
  };
  const cfg = map[verdict] || map.pending;
  const Icon = cfg.icon;
  return (
    <span className={`pill ${cfg.cls} inline-flex items-center gap-1`}>
      <Icon className="h-3 w-3" /> {cfg.label}
    </span>
  );
}

export default function ExamDetail() {
  const { slug } = useParams();
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);
  const [tab, setTab] = useState("eligibility");

  async function load() {
    const d = await api.get(`/api/recruitments/${slug}`);
    setR(d);
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line
  }, [slug]);

  async function toggleSave() {
    setBusy(true);
    await api.post(`/api/recruitments/${slug}/save`, {});
    await load();
    setBusy(false);
  }

  async function trackApplication() {
    setBusy(true);
    try {
      await api.post(`/api/tracker`, { recruitment_id: r.id, stage: "saved" });
    } finally {
      setBusy(false);
    }
  }

  async function openOfficialApply() {
    if (!r?.notification_url) return;
    try {
      await api.post(`/api/applications/${r.id}/clicked-apply`, {});
    } finally {
      window.open(r.notification_url, "_blank", "noopener,noreferrer");
    }
  }

  if (!r) return <div data-testid="exam-loading">Loading…</div>;

  const orgCode = r.organization_code || (r.organization || "—").slice(0, 4).toUpperCase();
  const elig = r.eligibility_preview || { verdict: "pending", fail_reasons: [] };
  const failReasons = elig.fail_reasons || [];
  const isEligible = elig.verdict === "eligible";
  const isConditional = elig.verdict === "conditional";
  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  return (
    <div className="space-y-6" data-testid={`exam-detail-${r.id}`}>
      <Link
        to="/app/eligibility/exams"
        className="inline-flex items-center gap-1 text-sm text-muted-foreground link-under"
      >
        <ArrowLeft className="h-4 w-4" /> All recruitments
      </Link>

      <div className="soft-card rounded-3xl p-6 lg:p-8">
        <div className="flex flex-wrap items-start gap-6 justify-between">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-clay-100 grid place-items-center font-heading font-semibold text-clay-700">
              {orgCode}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-3xl md:text-4xl font-semibold tracking-tight">
                  {r.name}
                </h1>
                <VerdictBadge verdict={elig.verdict} />
              </div>
              <div className="text-muted-foreground text-sm">
                {r.organization}
                {r.year ? ` · ${r.year}` : ""}
                {r.state ? ` · ${r.state}` : ""}
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={toggleSave}
              disabled={busy}
              data-testid="detail-save-btn"
              className={`btn ${r.saved ? "btn-primary" : "btn-ghost"}`}
            >
              <Bookmark className="h-4 w-4" /> {r.saved ? "Saved" : "Save"}
            </button>
            <button
              onClick={trackApplication}
              disabled={busy}
              className="btn btn-ghost"
              data-testid="detail-track-btn"
            >
              <ListChecks className="h-4 w-4" /> Track application
            </button>
            {r.notification_url && (
              <button
                onClick={openOfficialApply}
                className="btn btn-primary"
                data-testid="detail-official-link"
              >
                Official site <ExternalLink className="h-4 w-4" />
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-4 gap-4">
          {[
            { label: "Vacancies", val: r.vacancies?.toLocaleString() || "—" },
            { label: "Posts evaluated", val: `${elig.matched_posts || 0} / ${elig.total_posts || 0}` },
            { label: "Apply opens", val: formatDate(r.apply_window?.open) },
            { label: "Apply closes", val: formatDate(r.apply_window?.close) },
          ].map((s) => (
            <div
              key={s.label}
              className="rounded-xl bg-clay-50/70 border border-clay-100 p-4"
            >
              <div className="text-[10px] uppercase tracking-widest text-clay-700">
                {s.label}
              </div>
              <div className="mt-2 font-heading text-2xl font-semibold">{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="flex flex-wrap gap-1 border-b border-clay-200" role="tablist" data-testid="exam-detail-tabs">
        {TABS.map((t) => {
          const Icon = t.icon;
          const active = tab === t.id;
          return (
            <button
              key={t.id}
              role="tab"
              aria-selected={active}
              onClick={() => setTab(t.id)}
              data-testid={`exam-detail-tab-${t.id}`}
              className={`inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
                active
                  ? "border-clay-700 text-clay-900"
                  : "border-transparent text-muted-foreground hover:text-clay-800"
              }`}
            >
              <Icon className="h-4 w-4" /> {t.label}
            </button>
          );
        })}
      </div>

      {tab === "intelligence" ? (
        <ExamIntelligenceTab examSlug={r.exam_slug || r.exam?.slug} />
      ) : (
      <div className="grid lg:grid-cols-3 gap-4">
        <div
          className="lg:col-span-2 soft-card rounded-2xl p-6"
          data-testid="eligibility-panel"
        >
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
            Eligibility · deterministic engine
          </div>
          <h2 className="font-heading text-xl font-semibold mt-1">
            Verdict:{" "}
            <span
              className={
                isEligible
                  ? "text-sage-700"
                  : isConditional
                  ? "text-dusk-700"
                  : "text-clay-700"
              }
            >
              {elig.verdict}
            </span>
          </h2>
          {isEligible && failReasons.length === 0 && (
            <p className="mt-3 text-sm text-foreground/80">
              All eligibility checks passed. You can apply within the window above.
            </p>
          )}
          {isConditional && (
            <p className="mt-3 text-sm text-foreground/80">
              You'll qualify on completion of your current qualification. Confirm
              eligibility once your final-year results are out.
            </p>
          )}
          {failReasons.length > 0 && (
            <ul className="mt-4 space-y-2.5" data-testid="fail-reasons">
              {failReasons.map((reason, idx) => (
                <li key={idx} className="flex items-start gap-2.5">
                  <XCircle className="h-4 w-4 text-clay-600 mt-0.5 shrink-0" />
                  <div className="text-sm text-foreground/85">{reason}</div>
                </li>
              ))}
            </ul>
          )}
          {elig.computed_at && (
            <div className="mt-5 text-[11px] text-muted-foreground">
              Computed at {new Date(elig.computed_at).toLocaleString("en-IN")} · source:
              deterministic-engine. AI does not decide eligibility.
            </div>
          )}
          {elig.verdict === "pending" && (
            <div className="mt-5 text-[11px] text-muted-foreground">
              No eligibility result yet. Hit "Recompute eligibility" on the
              Exams list to evaluate this recruitment.
            </div>
          )}
        </div>

        <aside className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
            Posts in this recruitment
          </div>
          {(r.posts || []).length === 0 ? (
            <p className="mt-3 text-sm text-muted-foreground">No posts ingested yet.</p>
          ) : (
            <ul className="mt-3 space-y-2 text-sm">
              {(r.posts || []).map((p) => (
                <li key={p.id} className="flex items-start gap-2">
                  <CheckCircle2 className="h-4 w-4 text-sage-500 mt-0.5 shrink-0" />
                  <div>
                    <div className="font-medium">{p.post_name}</div>
                    {p.group_type && (
                      <div className="text-xs text-muted-foreground">
                        Group {p.group_type}
                        {p.pay_level ? ` · Pay level ${p.pay_level}` : ""}
                      </div>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </aside>
      </div>
      )}
    </div>
  );
}
