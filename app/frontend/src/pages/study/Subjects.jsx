import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../../lib/api";
import ExamContextCard from "../../features/study/components/ExamContextCard";

const TREND = {
  up: { Icon: TrendingUp, cls: "text-sage-600" },
  down: { Icon: TrendingDown, cls: "text-dusk-600" },
  flat: { Icon: Minus, cls: "text-muted-foreground" },
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
      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Study OS · subjects
        </div>
        <h1 className="font-heading text-4xl font-semibold tracking-tight mt-1">
          Where you stand, subject by subject.
        </h1>
        <p className="text-muted-foreground mt-1">
          Subject progress comes from your study plan. Topic intelligence is
          shown only once it has been verified and locked by review.
        </p>
      </div>

      <ExamContextCard examContext={examContext} />

      <div>
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold mb-3">
          Subject progress
        </div>
        <div className="grid md:grid-cols-2 gap-4">
          {items.map((s) => {
            const pct = Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0)));
            const trend = TREND[s.trend] || TREND.flat;
            const TrendIcon = trend.Icon;
            return (
              <div key={s.subject} className="soft-card rounded-2xl p-5">
                <div className="flex items-center justify-between">
                  <div className="font-heading font-semibold text-lg">{s.subject}</div>
                  <span
                    className={`flex items-center gap-1 text-xs ${trend.cls}`}
                    title={`Trend: ${s.trend || "flat"}`}
                  >
                    <TrendIcon className="h-3.5 w-3.5" aria-hidden="true" />
                    {s.trend || "flat"}
                  </span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-clay-100 overflow-hidden">
                  <div className="h-full bg-clay-500" style={{ width: `${pct}%` }} />
                </div>
                <div className="mt-1 text-xs text-muted-foreground">{pct}% closed</div>
              </div>
            );
          })}
          {!loading && !items.length ? (
            <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
              No subject progress yet — set up a study plan to start tracking.
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
