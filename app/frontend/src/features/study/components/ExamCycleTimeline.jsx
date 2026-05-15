import React, { useEffect, useState } from "react";
import { api } from "../../../lib/api";
import {
  Eyebrow,
  PageHeader,
  Pill,
  SectionHeader,
  StatusDot,
  StudyCard,
} from "../../../shared/ui/studyos";
import CycleProgressRail from "./CycleProgressRail";
import PlannedVsActualChart from "./PlannedVsActualChart";
import PhaseBandTimeline from "./PhaseBandTimeline";
import CycleSubjectProgress from "./CycleSubjectProgress";
import PlanRiskFlags from "./PlanRiskFlags";

const STATUS_TONE = {
  ahead: { tone: "sage", label: "Ahead" },
  on_track: { tone: "ink", label: "On track" },
  behind: { tone: "rose", label: "Behind" },
  not_connected: { tone: "outline", label: "Not connected" },
};

const STATUS_DOT = {
  ahead: "live",
  on_track: "live",
  behind: "preview",
  not_connected: "not-connected",
};

function fmt(d) {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
}

// ExamCycleTimeline — full exam-cycle view above the weekly cards on the
// Study Plan page. Wires to GET /api/study/plan/timeline and renders five
// sub-panels:
//   • header card (exam, cycle, phase, days remaining, status)
//   • cycle progress rail with milestones + study phase bands
//   • planned vs actual chart
//   • phase bands panel
//   • per-subject cycle progress
//   • risk flags
export default function ExamCycleTimeline() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        const d = await api.get("/api/study/plan/timeline");
        if (!cancelled) {
          setData(d || null);
          setError("");
        }
      } catch (e) {
        if (!cancelled) {
          setError("Cycle timeline temporarily unavailable.");
          if (process.env.NODE_ENV !== "production") console.error(e);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  if (loading) {
    return (
      <StudyCard data-testid="exam-cycle-timeline-loading">
        <div className="h-6 w-48 bg-clay-50 rounded animate-pulse" />
        <div className="mt-3 h-4 w-72 bg-clay-50 rounded animate-pulse" />
        <div className="mt-5 h-24 bg-clay-50 rounded animate-pulse" />
      </StudyCard>
    );
  }

  if (error) {
    return (
      <StudyCard data-testid="exam-cycle-timeline-error">
        <Eyebrow>Exam cycle timeline</Eyebrow>
        <p className="mt-2 text-[13px] text-[#7A3925]">{error}</p>
      </StudyCard>
    );
  }

  const safe = data || {};
  const exam = safe.exam_context || {};
  const plan = safe.plan_context || {};
  const progress = safe.cycle_progress || {};
  const milestones = Array.isArray(safe.milestones) ? safe.milestones : [];
  const phaseBands = Array.isArray(safe.phase_bands) ? safe.phase_bands : [];
  const series = Array.isArray(safe.series) ? safe.series : [];
  const subjects = Array.isArray(safe.subjects) ? safe.subjects : [];
  const flags = Array.isArray(safe.risk_flags) ? safe.risk_flags : [];
  const status = progress.status || "not_connected";
  const tone = STATUS_TONE[status] || STATUS_TONE.not_connected;

  const notConnected = status === "not_connected";

  return (
    <StudyCard padded={false} data-testid="exam-cycle-timeline">
      <div className="px-7 pt-6 pb-4">
        <PageHeader
          eyebrow="Exam cycle timeline"
          title={
            notConnected
              ? "Cycle data is not connected yet."
              : `${exam.exam_name || "Your exam"} · ${exam.cycle || "cycle"}`
          }
          sub={
            notConnected
              ? "Once an exam_start is locked, this panel shows the full cycle, your planned-vs-actual curve, study phase bands and per-subject progress."
              : `${exam.phase ? `${exam.phase} phase · ` : ""}${
                  exam.exam_start
                    ? `Exam on ${fmt(exam.exam_start)} · `
                    : ""
                }${
                  progress.total_days
                    ? `Day ${progress.elapsed_days || 0} of ${progress.total_days}`
                    : ""
                }`
          }
          right={
            <div className="flex items-center gap-2 flex-wrap justify-end">
              <Pill tone={tone.tone}>{tone.label}</Pill>
              <StatusDot state={STATUS_DOT[status] || "preview"} label="" />
            </div>
          }
        />
        {!notConnected ? (
          <div className="mt-2 flex flex-wrap gap-2 text-[11px] text-clay-700">
            {exam.days_remaining != null ? (
              <span className="num-mono">
                {exam.days_remaining}d to D-day
              </span>
            ) : null}
            <span>·</span>
            <span className="num-mono">
              planned {progress.planned_progress_pct || 0}% · actual {progress.actual_progress_pct || 0}%
            </span>
            {plan.plan_version != null ? (
              <>
                <span>·</span>
                <span className="num-mono">plan v{plan.plan_version}</span>
              </>
            ) : null}
            <span>·</span>
            <span className="num-mono">
              {plan.planner_version || "planner_v1"}
            </span>
          </div>
        ) : null}
      </div>

      <div className="hairline mx-7" />

      <div className="px-7 py-5 space-y-5">
        <CycleProgressRail milestones={milestones} phaseBands={phaseBands} />

        <SectionHeader
          eyebrow="Cumulative progress"
          title="Planned vs actual"
          sub="A steady-pace planner curve vs the work you have actually completed so far."
        />
        <PlannedVsActualChart
          series={series}
          status={status}
          unit={progress.unit || "minutes"}
        />

        <div className="rule pt-5">
          <PhaseBandTimeline
            bands={phaseBands}
            today={milestones.find((m) => m.kind === "today")?.date}
          />
        </div>

        <div className="rule pt-5">
          <CycleSubjectProgress subjects={subjects} />
        </div>

        <div className="rule pt-5">
          <PlanRiskFlags flags={flags} />
        </div>
      </div>
    </StudyCard>
  );
}
