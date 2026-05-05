import React, { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowLeft, Bookmark, CheckCircle2, ExternalLink, ShieldCheck, ListChecks } from "lucide-react";
import { api } from "../lib/api";

export default function ExamDetail() {
  const { slug } = useParams();
  const [r, setR] = useState(null);
  const [busy, setBusy] = useState(false);

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
      await api.post(`/api/tracker`, { recruitment_slug: slug, stage: "notified" });
    } finally {
      setBusy(false);
    }
  }

  if (!r) return <div data-testid="exam-loading">Loading…</div>;

  return (
    <div className="space-y-6" data-testid={`exam-detail-${slug}`}>
      <Link to="/app/exams" className="inline-flex items-center gap-1 text-sm text-muted-foreground link-under">
        <ArrowLeft className="h-4 w-4" /> All recruitments
      </Link>

      <div className="soft-card rounded-3xl p-6 lg:p-8">
        <div className="flex flex-wrap items-start gap-6 justify-between">
          <div className="flex items-start gap-4">
            <div className="h-14 w-14 rounded-2xl bg-clay-100 grid place-items-center font-heading font-semibold text-clay-700">
              {r.organization_code}
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h1 className="font-heading text-3xl md:text-4xl font-semibold tracking-tight">{r.name}</h1>
                <span className="pill pill-sage inline-flex items-center gap-1"><ShieldCheck className="h-3 w-3" /> Official</span>
              </div>
              <div className="text-muted-foreground text-sm">{r.organization}</div>
              <p className="mt-3 text-foreground/80 max-w-2xl">{r.summary}</p>
            </div>
          </div>
          <div className="flex gap-2">
            <button
              onClick={toggleSave}
              disabled={busy}
              data-testid="detail-save-btn"
              className={`btn ${r.saved ? "btn-primary" : "btn-ghost"}`}
            >
              <Bookmark className="h-4 w-4" /> {r.saved ? "Saved" : "Save"}
            </button>
            <button onClick={trackApplication} disabled={busy} className="btn btn-ghost" data-testid="detail-track-btn">
              <ListChecks className="h-4 w-4" /> Track application
            </button>
            {r.notification_url && (
              <a
                href={r.notification_url}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-primary"
                data-testid="detail-official-link"
              >
                Official site <ExternalLink className="h-4 w-4" />
              </a>
            )}
          </div>
        </div>

        <div className="mt-8 grid md:grid-cols-4 gap-4">
          {[
            { label: "Vacancies", val: r.vacancies?.toLocaleString() },
            { label: "Posts matched", val: `${r.posts_matched} / ${r.posts_total}` },
            { label: "Age window", val: `${r.min_age}–${r.max_age}` },
            { label: "Pay band", val: r.pay_band },
          ].map((s) => (
            <div key={s.label} className="rounded-xl bg-clay-50/70 border border-clay-100 p-4">
              <div className="text-[10px] uppercase tracking-widest text-clay-700">{s.label}</div>
              <div className="mt-2 font-heading text-2xl font-semibold">{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Eligibility preview · placeholder</div>
          <h2 className="font-heading text-xl font-semibold mt-1">Verdict: <span className="italic text-clay-700">{r.eligibility_preview.verdict}</span></h2>
          <ul className="mt-4 space-y-2">
            {r.eligibility_preview.reasons.map((reason) => (
              <li key={reason.field} className="flex items-start gap-2.5">
                <CheckCircle2 className="h-4 w-4 text-sage-500 mt-0.5" />
                <div>
                  <div className="text-sm font-medium capitalize">{reason.field}</div>
                  <div className="text-xs text-muted-foreground">{reason.note}</div>
                </div>
              </li>
            ))}
          </ul>
          <div className="mt-5 text-[11px] text-muted-foreground">Source: {r.eligibility_preview.source}. Phase-2 replaces this with deterministic engine.</div>
        </div>

        <aside className="soft-card rounded-2xl p-6">
          <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Exam pattern</div>
          <ul className="mt-3 space-y-2 text-sm">
            {(r.exam_pattern || []).map((p) => (
              <li key={p} className="inline-flex items-start gap-2"><span className="timeline-dot mt-1.5" /> {p}</li>
            ))}
          </ul>
          <div className="mt-6 text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">Syllabus snapshot</div>
          <div className="mt-2 flex flex-wrap gap-2">
            {(r.syllabus_snapshot || []).map((s) => (
              <span key={s} className="pill pill-dusk">{s}</span>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
