import React, { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { Link } from "react-router-dom";
import { api } from "../../../lib/api";
import { MiniBar, Pill, TrustStamp } from "../../../shared/ui/studyos";

// Action verbs are intentionally inert here — they navigate to the right
// surface (Focus / Mocks / Subjects) so we never invent backend state.
function actionHref(nextAction) {
  switch (nextAction) {
    case "concept_learning":
      return "/app/study/focus";
    case "retrieval_practice":
      return "/app/study/focus";
    case "revision":
      return "/app/study/focus";
    default:
      return "/app/study/focus";
  }
}

function fmtPct(value) {
  if (value === null || value === undefined) return "—";
  return `${Math.round(value)}%`;
}

// TopicRow — locked-only topic intelligence with an expandable detail
// drawer (observed/expected difficulty, confidence, evidence, schedule
// actions). Backend trust contract is always respected: high-yield /
// locked labels come from the row itself, never from client logic.
export default function TopicRow({ topic, defaultOpen = false }) {
  const [open, setOpen] = useState(!!defaultOpen);
  const [evidence, setEvidence] = useState(null);
  const [evidenceError, setEvidenceError] = useState(false);
  const [loadingEvidence, setLoadingEvidence] = useState(false);
  const evidenceRef = React.useRef(null);
  const t = topic || {};

  function focusEvidence() {
    const el = evidenceRef.current;
    if (!el) return;
    if (typeof el.scrollIntoView === "function") {
      el.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }
    if (typeof el.focus === "function") {
      el.focus({ preventScroll: true });
    }
  }

  async function loadEvidence() {
    // Subsequent clicks (after evidence is loaded) used to silently no-op.
    // Now they scroll the rendered block into view and focus it so
    // keyboard / screen-reader users get visible feedback that the action
    // succeeded.
    if (evidence) {
      focusEvidence();
      return;
    }
    if (loadingEvidence) return;
    setLoadingEvidence(true);
    setEvidenceError(false);
    try {
      const e = await api.get(
        `/api/evidence/exam_topic_coverage/${encodeURIComponent(t.topic_id)}`,
      );
      setEvidence(e);
    } catch {
      // Do NOT fabricate a successful evidence payload — a 403 (admin-only)
      // and a 500 (genuine failure) must surface differently. Mark failure
      // and let the drawer render a retry affordance + trust stamp only.
      setEvidenceError(true);
    } finally {
      setLoadingEvidence(false);
    }
  }

  function toggle() {
    const next = !open;
    setOpen(next);
    if (next) loadEvidence();
  }

  const observed = t.observed_difficulty;
  const expected = t.expected_difficulty;
  const confidence = t.confidence_score;
  const evidenceCount = t.evidence_count ?? t.verified_pyq_count ?? 0;
  const sub = Array.isArray(t.microtopics) ? t.microtopics : [];

  return (
    <li className="border-b border-[#E7DECB] last:border-0">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#F3EADB] transition"
        data-testid={`topic-row-${t.topic_id}`}
      >
        <div className="flex items-center gap-2 min-w-0">
          {open ? (
            <ChevronDown className="h-3.5 w-3.5 text-clay-700" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3.5 w-3.5 text-clay-700" aria-hidden="true" />
          )}
          <div className="min-w-0">
            <div className="text-[13px] text-clay-900 truncate">{t.topic}</div>
            <div className="mt-1 flex flex-wrap gap-1.5 items-center">
              {t.is_high_yield ? <Pill tone="amber">High yield</Pill> : null}
              {t.revision_due ? <Pill tone="sage">Revision due</Pill> : null}
              {t.error_pattern_count ? <Pill tone="rose">Errors logged</Pill> : null}
              <span className="num-mono text-[10.5px] text-clay-700">
                priority {Math.round(Number(t.exam_priority_score) || 0)}%
              </span>
              <span className="num-mono text-[10.5px] text-clay-700">
                · pyq {t.verified_pyq_count ?? 0}
              </span>
              {t.mastery_score != null ? (
                <span className="num-mono text-[10.5px] text-clay-700">
                  · mastery {Math.round(t.mastery_score)}%
                </span>
              ) : null}
            </div>
          </div>
        </div>
        <Pill tone="dusk">{(t.next_action || "concept_learning").replace(/_/g, " ")}</Pill>
      </button>

      {open ? (
        <div className="px-4 pb-3.5 bg-[#FBF6EF]">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            <Fact k="User mastery" v={fmtPct(t.mastery_score)} />
            <Fact k="Observed difficulty" v={fmtPct(observed)} />
            <Fact k="Expected difficulty" v={fmtPct(expected)} />
            <Fact
              k="Confidence"
              v={
                <span className="inline-flex items-center gap-1">
                  {confidence != null ? `${Math.round(confidence * 100)}%` : "—"}
                  <span className="num-mono text-[10.5px] text-clay-700">
                    {evidenceCount} evid.
                  </span>
                </span>
              }
            />
          </div>

          {sub.length ? (
            <div className="rule mt-3 pt-2.5">
              <div className="eyebrow !text-[10px]">Microtopics</div>
              <ul className="mt-2 space-y-1.5">
                {sub.map((m) => (
                  <li
                    key={m.id || m.topic_id || m.name}
                    className="grid grid-cols-[1fr_90px_60px] gap-3 items-center text-[12.5px] pl-2"
                  >
                    <span>· {m.name || m.topic}</span>
                    <span className="flex items-center gap-1.5">
                      <MiniBar
                        pct={(m.mastery_score ?? 0) / 100}
                        width={48}
                      />
                      <span className="num-mono text-[10.5px] text-clay-700">
                        {fmtPct(m.mastery_score)}
                      </span>
                    </span>
                    {m.weak ? (
                      <Pill tone="rose">weak</Pill>
                    ) : (
                      <span className="text-clay-700 text-[10.5px]">·</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="rule mt-3 pt-2.5 flex flex-wrap gap-1.5 items-center">
            <Link
              to={actionHref(t.next_action)}
              className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
            >
              Schedule revision
            </Link>
            <Link
              to="/app/study/focus"
              className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
            >
              Open answer drill
            </Link>
            <button
              type="button"
              onClick={loadEvidence}
              className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
            >
              View PYQ tags
            </button>
            <span className="ml-auto">
              <TrustStamp kind={t.trust_status || "locked"} />
            </span>
          </div>

          {evidence && evidence.row ? (
            <EvidenceFacts
              row={evidence.row}
              showRaw={typeof window !== "undefined" && window.location?.search?.includes("debug=1")}
              evidenceRef={evidenceRef}
            />
          ) : evidence && !evidence.row ? (
            <p
              ref={evidenceRef}
              tabIndex={-1}
              className="mt-3 text-[11.5px] text-clay-700 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-900 rounded"
            >
              Detailed source row is admin-only. Trust status above is server-confirmed.
            </p>
          ) : loadingEvidence ? (
            <p className="mt-3 text-[11.5px] text-clay-700">Loading evidence…</p>
          ) : evidenceError ? (
            <div
              className="mt-3 flex items-center justify-between gap-2 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11.5px] text-amber-800"
              role="status"
              data-testid="topic-row-evidence-error"
            >
              <span>Couldn’t load evidence. Trust stamp above is server-confirmed.</span>
              <button
                type="button"
                onClick={loadEvidence}
                className="font-semibold underline underline-offset-2 hover:text-amber-900"
              >
                Retry
              </button>
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

// Renders the admin evidence row as structured key/value pairs, with the
// raw JSON tucked behind a `?debug=1` URL flag. The previous unstyled
// <pre> dumped the entire row to whatever caller could see it, bypassing
// the calibrated trust language elsewhere on the page.
const EVIDENCE_LABEL = {
  exam_priority_score: "Exam priority",
  confidence_score: "Confidence",
  is_high_yield: "High yield",
  reviewer_status: "Reviewer status",
  evidence_count: "Evidence count",
  reviewed_at: "Reviewed at",
  reviewed_by: "Reviewed by",
  notes: "Notes",
};

function fmtEvidenceValue(key, value) {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (key === "exam_priority_score") {
    const n = Number(value);
    if (Number.isFinite(n)) return `${Math.round(n)}%`;
  }
  if (key === "confidence_score") {
    const n = Number(value);
    if (Number.isFinite(n)) return `${Math.round(n * 100)}%`;
  }
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function EvidenceFacts({ row, showRaw, evidenceRef }) {
  const entries = Object.entries(row || {})
    .filter(([k]) => k !== "id" && k !== "created_at" && k !== "updated_at");
  return (
    <div
      ref={evidenceRef}
      tabIndex={-1}
      className="mt-3 rounded-lg bg-clay-50 p-3 focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-900"
      data-testid="topic-row-evidence"
    >
      <dl className="grid grid-cols-2 gap-x-3 gap-y-1.5 text-[11.5px]">
        {entries.map(([k, v]) => (
          <React.Fragment key={k}>
            <dt className="text-clay-700">{EVIDENCE_LABEL[k] || k.replaceAll("_", " ")}</dt>
            <dd className="text-clay-900 num-mono">{fmtEvidenceValue(k, v)}</dd>
          </React.Fragment>
        ))}
      </dl>
      {showRaw ? (
        <details className="mt-3">
          <summary className="text-[10px] uppercase tracking-wider text-clay-700 cursor-pointer">
            Raw row (debug)
          </summary>
          <pre className="mt-1 max-h-40 overflow-auto text-[10px] num-mono text-clay-800">
            {JSON.stringify(row, null, 2)}
          </pre>
        </details>
      ) : null}
    </div>
  );
}

function Fact({ k, v }) {
  return (
    <div>
      <div className="eyebrow !text-[10px]">{k}</div>
      <div className="mt-1 text-[13px] text-clay-900">{v}</div>
    </div>
  );
}
