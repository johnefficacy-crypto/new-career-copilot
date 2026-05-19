import React, { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";
import {
  ArrowLeft,
  Bookmark,
  CheckCircle2,
  XCircle,
  AlertCircle,
  ExternalLink,
  FileText,
  Library,
  ListChecks,
  ShieldCheck,
  Users,
} from "lucide-react";
import { api } from "../lib/api";
import ExamIntelligenceTab from "../features/exams/ExamIntelligenceTab";
import ExamDetailAnchorNav from "../features/exams/ExamDetailAnchorNav";

// PR11: ExamDetail is now a single scrollable page with a sticky anchor
// chip strip and IntersectionObserver-driven scroll-spy. The old
// 2-tab layout (Eligibility / Intelligence) is gone — both surfaces
// now live as scroll sections, alongside four new sections that the
// spec calls out (about, docs & fees, resources, groups).
//
// Section design decision (documented for PR body):
//   The full ExamIntelligenceTab component renders inside #competition.
//   It already owns its own loading / empty / error states for cutoff
//   trends, difficulty heatmap, PYQ analysis, option insights, and the
//   trap-drill launcher. Splitting it across two sections would be
//   invasive surgery on a 425-line component; the spec's chip strip is
//   exactly 6 chips and the "Competition" chip is the natural home for
//   the broader "what we know about the exam" view.
//
// Routing contract (PR — Bug 3 fix):
//   /app/eligibility/exams/:slug receives an EXAM slug (from `exams.slug`).
//   The recruitment detail endpoint resolves by recruitment id/slug only,
//   so passing an exam slug into /api/recruitments/<slug> returns a real
//   404 (e.g. `rbi-grade-b`). The page therefore (a) validates the exam
//   via /api/exams/:slug and (b) maps the exam to its published
//   recruitment via /api/recruitments before fetching detail by
//   recruitment id. The /api/recruitments list now surfaces `exam_id` to
//   make that mapping cheap.

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "eligibility", label: "Eligibility" },
  { id: "docs-fees", label: "Docs & Fees" },
  { id: "competition", label: "Competition" },
  { id: "resources", label: "Resources" },
  { id: "groups", label: "Groups" },
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

function Section({ id, eyebrow, title, children, testId }) {
  // Wrap the heading + body in a <section> with stable aria-labelledby
  // wiring so AT users get a real landmark when they jump to a hash.
  const headingId = `${id}-heading`;
  return (
    <section
      id={id}
      aria-labelledby={headingId}
      data-testid={testId || `section-${id}`}
      // scroll-margin-top so anchor jumps land below the sticky header.
      // We also offset manually in JS for behavior:"smooth"; this
      // covers the browser's native :target behavior too.
      className="scroll-mt-32"
    >
      <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        {eyebrow}
      </div>
      <h2 id={headingId} className="font-heading text-2xl font-semibold mt-1">
        {title}
      </h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}

export default function ExamDetail() {
  const { slug } = useParams();
  const [r, setR] = useState(null);
  const [examMeta, setExamMeta] = useState(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    try {
      setError("");
      // 1. Validate the exam slug against /api/exams/:slug. This is the
      //    only endpoint that resolves exam slugs; calling
      //    /api/recruitments/<exam-slug> would return a real 404.
      const exam = await api.get(`/api/exams/${slug}`);
      const examRow = exam?.exam || null;
      if (!examRow?.id) {
        setExamMeta(null);
        setR(null);
        setError("Exam not found.");
        return;
      }
      setExamMeta(examRow);

      // 2. Map exam → published recruitment via the list (which now
      //    surfaces `exam_id` per row). Pick the row whose apply window
      //    ends latest, falling back to first match.
      const list = await api.get(`/api/recruitments`);
      const items = Array.isArray(list?.items) ? list.items : [];
      const matches = items.filter((it) => it.exam_id === examRow.id);
      const recruitment = matches.sort((a, b) => {
        const ac = a?.apply_window?.close || "";
        const bc = b?.apply_window?.close || "";
        return bc.localeCompare(ac);
      })[0];

      if (!recruitment?.id) {
        setR(null);
        return;
      }

      // 3. Now fetch the recruitment detail by id (which the resolver
      //    accepts) — no exam slug crosses into a recruitment endpoint.
      const d = await api.get(`/api/recruitments/${recruitment.id}`);
      setR(d);
    } catch (e) {
      setError("Couldn't load this exam.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  }
  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [slug]);

  async function toggleSave() {
    if (!r?.id) return;
    setBusy(true);
    try {
      // Save toggles against the resolved recruitment id, not the exam
      // slug from the URL — see routing-contract note above.
      await api.post(`/api/recruitments/${r.id}/save`, {});
      await load();
    } finally {
      setBusy(false);
    }
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

  const formatDate = (d) =>
    d ? new Date(d).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" }) : "—";

  // Aggregated bits derived once per render — keeps the section bodies
  // legible and avoids re-computing inside JSX.
  const derived = useMemo(() => {
    if (!r) return null;
    const elig = r.eligibility_preview || { verdict: "pending", fail_reasons: [] };
    return {
      orgCode: r.organization_code || (r.organization || "—").slice(0, 4).toUpperCase(),
      elig,
      failReasons: elig.fail_reasons || [],
      isEligible: elig.verdict === "eligible",
      isConditional: elig.verdict === "conditional",
      examSlug: r.exam_slug || r.exam?.slug || null,
    };
  }, [r]);

  if (error && !r) {
    return (
      <div className="soft-card rounded-2xl p-6 border border-destructive/30">
        <p className="text-sm">{error}</p>
        <button type="button" onClick={load} className="btn btn-ghost mt-3">
          Retry
        </button>
      </div>
    );
  }

  // Exam validated but no published recruitment cycle for it yet — surface
  // explicitly instead of looping the loading shell forever.
  if (!r && examMeta) {
    return (
      <div className="soft-card rounded-2xl p-6" data-testid="exam-no-cycle">
        <h1 className="font-heading text-2xl font-semibold">{examMeta.name}</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          No published recruitment cycle for this exam yet. We'll list it here as
          soon as a cycle is verified.
        </p>
        <Link
          to="/app/eligibility/exams"
          className="inline-flex items-center gap-1 mt-4 text-sm text-muted-foreground link-under"
        >
          <ArrowLeft className="h-4 w-4" /> Back to all exams
        </Link>
      </div>
    );
  }

  if (!r) return <div data-testid="exam-loading">Loading…</div>;

  const { orgCode, elig, failReasons, isEligible, isConditional, examSlug } = derived;

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
            <div key={s.label} className="rounded-xl bg-clay-50/70 border border-clay-100 p-4">
              <div className="text-[10px] uppercase tracking-widest text-clay-700">{s.label}</div>
              <div className="mt-2 font-heading text-2xl font-semibold">{s.val}</div>
            </div>
          ))}
        </div>
      </div>

      <ExamDetailAnchorNav sections={SECTIONS} ready={Boolean(r)} />

      <div className="space-y-12 pb-24">
        {/* ─── About ─────────────────────────────────────────────── */}
        <Section
          id="about"
          eyebrow="About this recruitment"
          title="The cycle at a glance"
        >
          <div className="grid lg:grid-cols-2 gap-4">
            <div className="soft-card rounded-2xl p-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Recruitment
              </div>
              <dl className="mt-3 text-sm grid grid-cols-2 gap-x-4 gap-y-2">
                <dt className="text-muted-foreground">Organization</dt>
                <dd>{r.organization || "—"}</dd>
                {r.year ? (
                  <>
                    <dt className="text-muted-foreground">Cycle year</dt>
                    <dd>{r.year}</dd>
                  </>
                ) : null}
                {r.state ? (
                  <>
                    <dt className="text-muted-foreground">State</dt>
                    <dd>{r.state}</dd>
                  </>
                ) : null}
                <dt className="text-muted-foreground">Apply window</dt>
                <dd>
                  {formatDate(r.apply_window?.open)} → {formatDate(r.apply_window?.close)}
                </dd>
                {r.vacancies != null ? (
                  <>
                    <dt className="text-muted-foreground">Vacancies</dt>
                    <dd>{r.vacancies.toLocaleString()}</dd>
                  </>
                ) : null}
              </dl>
            </div>

            <div className="soft-card rounded-2xl p-5">
              <div className="text-[11px] uppercase tracking-widest text-muted-foreground font-semibold">
                Posts in this recruitment
              </div>
              {(r.posts || []).length === 0 ? (
                <p className="mt-3 text-sm text-muted-foreground">
                  No posts ingested yet.
                </p>
              ) : (
                <ul className="mt-3 space-y-2 text-sm" data-testid="posts-list">
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
            </div>
          </div>
        </Section>

        {/* ─── Eligibility ───────────────────────────────────────── */}
        <Section
          id="eligibility"
          eyebrow="About your eligibility"
          title="Verdict from the deterministic engine"
        >
          <div className="soft-card rounded-2xl p-6" data-testid="eligibility-panel">
            <h3 className="font-heading text-xl font-semibold">
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
            </h3>
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
        </Section>

        {/* ─── Docs & Fees ───────────────────────────────────────── */}
        <Section
          id="docs-fees"
          eyebrow="Documents, fees, attempts"
          title="Criteria-based requirements"
        >
          <div className="soft-card rounded-2xl p-6">
            {(r.posts || []).length === 0 ? (
              <p className="text-sm text-muted-foreground">
                Per-post documents, fees, and attempt limits will list here once
                the recruitment is fully ingested.
              </p>
            ) : (
              <ul className="space-y-3 text-sm">
                {(r.posts || []).map((p) => (
                  <li
                    key={p.id}
                    className="rounded-xl border border-border p-3 bg-white/60"
                  >
                    <div className="flex items-start gap-2">
                      <FileText className="h-4 w-4 text-clay-600 mt-0.5 shrink-0" />
                      <div className="min-w-0">
                        <div className="font-medium">{p.post_name}</div>
                        <div className="text-xs text-muted-foreground mt-0.5">
                          {p.group_type ? `Group ${p.group_type}` : "Group —"}
                          {p.pay_level ? ` · Pay level ${p.pay_level}` : ""}
                        </div>
                        {p.documents_required?.length ? (
                          <div className="text-xs text-muted-foreground mt-2">
                            Documents: {p.documents_required.join(", ")}
                          </div>
                        ) : null}
                        {p.fee_amount != null ? (
                          <div className="text-xs text-muted-foreground">
                            Fee: ₹{p.fee_amount}
                          </div>
                        ) : null}
                        {p.attempt_limit != null ? (
                          <div className="text-xs text-muted-foreground">
                            Attempt limit: {p.attempt_limit}
                          </div>
                        ) : null}
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </Section>

        {/* ─── Competition ───────────────────────────────────────── */}
        <Section
          id="competition"
          eyebrow="Competition + exam intelligence"
          title="What we know about this exam"
        >
          <ExamIntelligenceTab examSlug={examSlug} />
        </Section>

        {/* ─── Resources ─────────────────────────────────────────── */}
        <Section
          id="resources"
          eyebrow="Resources"
          title="Books, courses, and notes"
        >
          <div className="soft-card rounded-2xl p-6">
            <p className="text-sm text-muted-foreground">
              Curated resources for this exam live in the marketplace.
            </p>
            <Link
              to={
                examSlug
                  ? `/app/marketplace?exam=${encodeURIComponent(examSlug)}`
                  : "/app/marketplace"
              }
              className="btn btn-ghost mt-3 inline-flex"
              data-testid="resources-marketplace-cta"
            >
              <Library className="h-4 w-4" /> Browse marketplace
            </Link>
          </div>
        </Section>

        {/* ─── Groups ────────────────────────────────────────────── */}
        <Section
          id="groups"
          eyebrow="Study groups & mentors"
          title="Find people preparing alongside you"
        >
          <div className="grid md:grid-cols-2 gap-4">
            <div className="soft-card rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="h-9 w-9 grid place-items-center rounded-lg bg-clay-100 text-clay-700 shrink-0"
                >
                  <Users className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-heading text-base font-semibold">Study groups</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Aspirants on the same exam, in the same week.
                  </p>
                  <Link
                    to="/app/groups"
                    className="btn btn-ghost mt-3 inline-flex"
                    data-testid="groups-cta"
                  >
                    Browse groups
                  </Link>
                </div>
              </div>
            </div>
            <div className="soft-card rounded-2xl p-5">
              <div className="flex items-start gap-3">
                <span
                  aria-hidden="true"
                  className="h-9 w-9 grid place-items-center rounded-lg bg-clay-100 text-clay-700 shrink-0"
                >
                  <ShieldCheck className="h-4 w-4" />
                </span>
                <div className="min-w-0">
                  <div className="font-heading text-base font-semibold">Mentors</div>
                  <p className="text-xs text-muted-foreground mt-1">
                    Book a 1-on-1 with a mentor who's cracked this exam.
                  </p>
                  <Link
                    to="/app/mentors"
                    className="btn btn-ghost mt-3 inline-flex"
                    data-testid="mentors-cta"
                  >
                    Find a mentor
                  </Link>
                </div>
              </div>
            </div>
          </div>
        </Section>
      </div>
    </div>
  );
}

// Exposed for tests.
export { SECTIONS };
