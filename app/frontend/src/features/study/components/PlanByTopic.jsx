import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import {
  Eyebrow,
  MiniBar,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard,
  TrustStamp,
} from "../../../shared/ui/studyos";

const SOURCE_LABEL = {
  exam_intelligence: { label: "Exam intelligence", tone: "sage" },
  weakness_map: { label: "Weakness map", tone: "amber" },
  manual_override: { label: "Manual override", tone: "dusk" },
};

const TRUST_STATE = {
  locked: "live",
  preview: "preview",
  partial: "partial",
};

// PlanByTopic — per-subject allocation for the current planning week.
// Reads /api/study/plan/by-subject (real DB-derived data; no DATA.subjects)
// and renders the prototype's "Where your hours go" panel.
const SKELETON_COUNT_KEY = "planByTopic.lastSubjectCount";
const SKELETON_DEFAULT_ROWS = 3;
const SKELETON_MAX_ROWS = 12;

function readRememberedCount() {
  try {
    const raw = window.localStorage.getItem(SKELETON_COUNT_KEY);
    const n = Number(raw);
    if (Number.isFinite(n) && n > 0) {
      return Math.min(SKELETON_MAX_ROWS, Math.max(1, Math.round(n)));
    }
  } catch {
    /* localStorage disabled */
  }
  return SKELETON_DEFAULT_ROWS;
}

export default function PlanByTopic() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  // Remember the last subject count so the loading skeleton matches the
  // expected resolved height. Without this, the panel reserves 3 rows of
  // space and pages with 8 subjects visibly jump when data arrives.
  const [skeletonRows] = useState(readRememberedCount);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const d = await api.get("/api/study/plan/by-subject");
        if (!cancelled) {
          setData(d || null);
          const count = Array.isArray(d?.items) ? d.items.length : 0;
          if (count > 0) {
            try {
              window.localStorage.setItem(SKELETON_COUNT_KEY, String(count));
            } catch {
              /* localStorage disabled — count stays at default next visit */
            }
          }
        }
      } catch (e) {
        if (!cancelled) setError("Could not load subject allocation.");
        if (process.env.NODE_ENV !== "production") console.error(e);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  const items = Array.isArray(data?.items) ? data.items : [];
  const totalHours = Number(data?.total_hours || 0);
  const trust = data?.trust_status || "preview";
  const maxMinutes = items.reduce((m, it) => Math.max(m, it.planned_minutes || 0), 0);

  return (
    <StudyCard data-testid="plan-by-topic">
      <SectionHeader
        eyebrow="This week by subject"
        title={
          totalHours
            ? `Where your hours go · ${totalHours}h planned`
            : "Where your hours go."
        }
        sub="Per-subject allocation derived from your scheduled tasks. Locked rows come from reviewed exam intelligence; preview rows from your weakness map."
        right={<StatusDot state={TRUST_STATE[trust] || "preview"} label="" />}
      />

      {error ? (
        <div className="rounded-xl bg-[#F2DDD6] text-[#7A3925] text-[12px] px-3 py-2">
          {error}
        </div>
      ) : loading ? (
        <ul className="space-y-2.5" aria-busy="true">
          {Array.from({ length: skeletonRows }, (_, i) => (
            <li
              key={`skel-${i}`}
              className="h-6 rounded-md bg-clay-50 animate-pulse"
              aria-hidden="true"
            />
          ))}
        </ul>
      ) : items.length === 0 ? (
        <p className="text-[12.5px] text-clay-700">
          No tasks scheduled this week yet. Once a plan is generated, this panel
          will show the per-subject split.
        </p>
      ) : totalHours === 0 && maxMinutes === 0 ? (
        <p className="text-[12.5px] text-clay-700" data-testid="plan-by-topic-unallocated">
          Hours not yet allocated to subjects. Subjects below appear in the plan
          but have no scheduled minutes for this week — they will fill in after
          your next plan regeneration.
        </p>
      ) : (
        <ul className="space-y-3">
          {items.map((s) => {
            const sourceMeta = SOURCE_LABEL[s.source] || SOURCE_LABEL.weakness_map;
            const pct = maxMinutes ? (s.planned_minutes || 0) / maxMinutes : 0;
            const unallocated = s.weight == null && s.planned_minutes == null;
            return (
              <li
                key={s.subject_id || s.subject_name}
                className="grid grid-cols-[140px_1fr_auto] gap-3 items-center"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <span
                    className="w-2.5 h-2.5 rounded-sm shrink-0"
                    style={{ background: s.color || "#A68057" }}
                    aria-hidden="true"
                  />
                  <span className="text-[13px] text-clay-900 truncate">
                    {s.subject_name}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <MiniBar
                    pct={pct}
                    width={undefined}
                    color={s.color || "#A68057"}
                    height={9}
                  />
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <span className="num-mono text-[11px] text-clay-700">
                    {unallocated
                      ? "not in this week"
                      : `${s.planned_hours ?? 0}h · ${Math.round((s.weight || 0) * 100)}%`}
                  </span>
                  <Pill tone={sourceMeta.tone}>{sourceMeta.label}</Pill>
                  {s.trust_status === "locked" ? (
                    <TrustStamp kind="locked" />
                  ) : (
                    <TrustStamp kind="preview" />
                  )}
                </div>
              </li>
            );
          })}
        </ul>
      )}

      <div className="rule mt-4 pt-3">
        <Eyebrow>Source contract</Eyebrow>
        <p className="mt-1.5 text-[11.5px] text-clay-700 max-w-prose">
          Subject weights come from your scheduled tasks. Locked rows reflect
          reviewer-locked <strong>exam intelligence</strong>; preview rows are
          tuned by your weakness map and may shift between plan generations.
          Manual overrides are surfaced separately so they aren&rsquo;t silently
          rolled back.
        </p>
      </div>
    </StudyCard>
  );
}
