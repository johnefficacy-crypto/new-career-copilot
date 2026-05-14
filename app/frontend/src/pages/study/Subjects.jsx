import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../../lib/api";
import ExamContextCard from "../../features/study/components/ExamContextCard";
import { Eyebrow, Pill, StatusDot, MiniBar } from "../../shared/ui/studyos";

const TREND = {
  up: { Icon: TrendingUp, cls: "text-sage-600" },
  down: { Icon: TrendingDown, cls: "text-dusk-600" },
  flat: { Icon: Minus, cls: "text-clay-600" },
};

export default function Subjects() {
  const [items, setItems] = useState([]);
  const [examContext, setExamContext] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Subject progress always loads; exam intelligence is best-effort and
      // only ever shows verified/locked topics (handled by ExamContextCard).
      const [subjectsRes, mcRes] = await Promise.allSettled([
        api.get("/api/study/subjects"),
        api.get("/api/study/mission-control"),
      ]);
      if (cancelled) return;
      if (subjectsRes.status === "fulfilled") {
        const d = subjectsRes.value;
        setItems(Array.isArray(d?.items) ? d.items : []);
      }
      if (mcRes.status === "fulfilled") {
        setExamContext(mcRes.value?.exam_context || null);
      }
      setLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="space-y-6" data-testid="subjects-page">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <Eyebrow>Subjects · topic intelligence</Eyebrow>
          <h1 className="font-heading text-[36px] leading-[1.05] mt-2">
            From subject to a concrete next action.
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[64ch]">
            Subject progress comes from your study plan. Topic intelligence and high-yield labels
            appear only once they have been verified and locked by review.
          </p>
        </div>
        <StatusDot state="partial" label="Partial · progress live, topics review-gated" />
      </header>

      <ExamContextCard examContext={examContext} />

      <section>
        <Eyebrow className="mb-3">Subject progress</Eyebrow>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {items.map((s) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0)));
            const trend = TREND[s.trend] || TREND.flat;
            const TrendIcon = trend.Icon;
            return (
              <div
                key={s.subject}
                className="soft-card grain relative overflow-hidden rounded-[14px] p-4"
              >
                <div className="flex items-center justify-between gap-2">
                  <div className="font-heading text-[16px] leading-tight">{s.subject}</div>
                  <span
                    className={`flex items-center gap-1 text-[11px] ${trend.cls}`}
                    title={`Trend: ${s.trend || "flat"}`}
                  >
                    <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.trend || "flat"}
                  </span>
                </div>
                <div className="mt-3 flex items-center gap-2">
                  <MiniBar pct={pct / 100} width={undefined} height={6} />
                  <span className="num-mono text-[11px] text-clay-700 shrink-0">{pct}%</span>
                </div>
                <div className="mt-1.5 text-[11px] text-clay-700">{pct}% closed</div>
                {pct < 65 ? (
                  <div className="mt-2">
                    <Pill tone="amber">below 65%</Pill>
                  </div>
                ) : (
                  <div className="mt-2">
                    <Pill tone="sage">on target</Pill>
                  </div>
                )}
              </div>
            );
          })}
          {!loading && !items.length ? (
            <div className="soft-card grain relative overflow-hidden rounded-[14px] p-5 text-sm text-clay-700">
              No subject progress yet — set up a study plan to start tracking.
            </div>
          ) : null}
        </div>
        <p className="mt-3 text-[11.5px] text-clay-700">
          Topic-level mastery, exam priority and high-yield labels populate here once verified
          topics from{" "}
          <a className="underline underline-offset-2" href="/admin/exam-intelligence">
            exam intelligence
          </a>{" "}
          are locked by review.
        </p>
      </section>
    </div>
  );
}
