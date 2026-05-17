import React, { useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import { Eyebrow, PageHeader, StatusDot, StudyCard } from "../../shared/ui/studyos";

const PERIODS = ["daily", "weekly", "monthly"];

function fmtPct(v) {
  if (v === null || v === undefined) return "—";
  return `${Math.round(Number(v) * 100)}%`;
}

function readTone(score) {
  if (score === null || score === undefined) return "bg-[#F3EEE8] text-[#6E5A4A] border-[#DDCFBE]";
  const p = Number(score) * 100;
  if (p >= 90) return "bg-[#E7F6EA] text-[#1E5A33] border-[#B5DDBF]";
  if (p >= 75) return "bg-[#EEF7FF] text-[#164A7A] border-[#BCD9F4]";
  if (p >= 60) return "bg-[#FFF8E8] text-[#6A4A09] border-[#F1DEAF]";
  if (p >= 40) return "bg-[#FFF0E8] text-[#7A3A1D] border-[#EDC6B1]";
  return "bg-[#FCEBEC] text-[#7A1D2C] border-[#E8B9C1]";
}

export default function WeeklyReview() {
  const [period, setPeriod] = useState("weekly");
  const [data, setData] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const title = period === "daily" ? "Today's Report Card" : period === "weekly" ? "Weekly Report Card" : "Monthly Report Card";

  const load = async (p = period) => {
    try {
      const r = await api.get(`/api/study/report-card?period=${p}`);
      setData(r || null);
      setErr("");
    } catch (e) {
      setErr("Report card unavailable right now.");
      if (process.env.NODE_ENV !== "production") console.error(e);
    }
  };

  const recompute = async () => {
    setBusy(true);
    try {
      const r = await api.post(`/api/study/report-card/compute?period=${period}`);
      setData(r || null);
      setErr("");
    } catch (e) {
      setErr("Could not recompute report card.");
    } finally {
      setBusy(false);
    }
  };

  useEffect(() => {
    load(period);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period]);

  const scoreCards = useMemo(() => {
    const s = data?.scores || {};
    return [
      { k: "Adherence", v: fmtPct(s.plan_adherence_score), hint: s.label || "No evidence" },
      { k: "Completion", v: fmtPct(s.plan_completion_score), hint: "Completed minutes / planned minutes" },
      { k: "Focus adherence", v: fmtPct(s.focus_adherence_score), hint: "Focus minutes / planned minutes" },
      { k: "Consistency", v: fmtPct(s.consistency_score), hint: "Active days / planned days" },
      { k: "Revision", v: fmtPct(s.revision_completion_score), hint: "Revision tasks completed" },
      { k: "Mock review", v: fmtPct(s.mock_review_score), hint: `Trust: ${data?.evidence_summary?.mock_score_block?.trust_label || "platform_verified"}` },
      { k: "Corrections", v: fmtPct(s.correction_completion_score), hint: "Correction tasks closed" },
      { k: "Backlog Δ", v: `${s.backlog_delta ?? "—"}`, hint: "Backlog movement" },
    ];
  }, [data]);

  return (
    <div className="space-y-6" data-testid="weekly-review-page">
      {err && <div className="rounded-xl bg-clay-50 text-clay-800 text-xs px-3 py-2">{err}</div>}

      <PageHeader
        eyebrow="Report Card"
        title={title}
        sub="Deterministic progress analytics from tracked study behavior. No AI judgement, only evidence."
        right={
          <div className="flex gap-2 items-center">
            <StatusDot state="live" label="" />
            <button type="button" onClick={recompute} disabled={busy} className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold disabled:opacity-50">
              {busy ? "Recomputing…" : "Recompute"}
            </button>
          </div>
        }
      />

      <div className="soft-card rounded-2xl p-2 inline-flex gap-2">
        {PERIODS.map((p) => (
          <button
            key={p}
            type="button"
            onClick={() => setPeriod(p)}
            className={`px-4 py-2 rounded-xl text-sm font-semibold ${period === p ? "bg-[#2E2218] text-[#F3EADB]" : "bg-transparent text-[#5D4B3F]"}`}
          >
            {p[0].toUpperCase() + p.slice(1)}
          </button>
        ))}
      </div>

      <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {scoreCards.map((c) => {
          const scores = data?.scores || {};
          const toneScore =
            c.k === "Adherence"
              ? scores.plan_adherence_score
              : c.k === "Completion"
                ? scores.plan_completion_score
                : c.k === "Focus adherence"
                  ? scores.focus_adherence_score
                  : c.k === "Consistency"
                    ? scores.consistency_score
                    : null;
          return (
            <div key={c.k} className={`rounded-2xl border p-4 ${readTone(toneScore)}`}>
              <Eyebrow>{c.k}</Eyebrow>
              <div className="font-heading text-[28px] mt-1 leading-none">{c.v}</div>
              <div className="text-[11px] mt-2 opacity-90">{c.hint}</div>
            </div>
          );
        })}
      </div>

      <div className="grid lg:grid-cols-3 gap-4">
        <StudyCard className="!bg-[#F8FBFF] !border-[#C9DCF2]">
          <Eyebrow>Task execution</Eyebrow>
          <div className="text-sm mt-2">Planned: <b>{data?.planned_tasks ?? 0}</b></div>
          <div className="text-sm">Completed: <b>{data?.completed_tasks ?? 0}</b></div>
          <div className="text-sm">Missed / Skipped / Carried: <b>{data?.missed_tasks ?? 0}</b> / <b>{data?.skipped_tasks ?? 0}</b> / <b>{data?.carried_forward_tasks ?? 0}</b></div>
        </StudyCard>
        <StudyCard className="!bg-[#F4FBF2] !border-[#C9E8C3]">
          <Eyebrow>Time evidence</Eyebrow>
          <div className="text-sm mt-2">Planned minutes: <b>{data?.planned_minutes ?? 0}</b></div>
          <div className="text-sm">Completed minutes: <b>{data?.completed_minutes ?? 0}</b></div>
          <div className="text-sm">Focus minutes: <b>{data?.focus_minutes ?? 0}</b></div>
        </StudyCard>
        <StudyCard className="!bg-[#FFF8F1] !border-[#F0D7B8]">
          <Eyebrow>Mocks and corrections</Eyebrow>
          <div className="text-sm mt-2">Mocks taken / reviewed: <b>{data?.mocks_taken ?? 0}</b> / <b>{data?.mocks_reviewed ?? 0}</b></div>
          <div className="text-sm">Correction tasks created / completed: <b>{data?.correction_tasks_created ?? 0}</b> / <b>{data?.correction_tasks_completed ?? 0}</b></div>
          <div className="text-xs text-muted-foreground mt-2">Source: platform tracked</div>
        </StudyCard>
      </div>
    </div>
  );
}

