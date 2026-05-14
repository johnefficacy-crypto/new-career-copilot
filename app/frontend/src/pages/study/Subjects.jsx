import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../../lib/api";
import ExamContextCard from "../../features/study/components/ExamContextCard";
import { Card, PageHeader, Pill, SectionHeader, StatusDot, StudyEmptyState } from "../../shared/ui/studyos";

const TREND = {
  up: { Icon: TrendingUp, cls: "text-sage-600" },
  down: { Icon: TrendingDown, cls: "text-dusk-600" },
  flat: { Icon: Minus, cls: "text-clay-600" },
};

// Stable accent palette — ported from the prototype's subject colours.
const SUBJECT_COLORS = ["#54794E", "#A68057", "#524864", "#BE9C6B", "#94B28A", "#8F86A1", "#6C5038"];

function SubjectCard({ s, color }) {
  const pct = Math.max(0, Math.min(100, Math.round(Number(s.progress) || 0)));
  const trend = TREND[s.trend] || TREND.flat;
  const TrendIcon = trend.Icon;
  return (
    <div className="text-left rounded-xl border border-[#E7DECB] bg-white/60 p-3.5">
      <div className="flex items-center justify-between">
        <span className="w-2.5 h-2.5 rounded-sm" style={{ background: color }} />
        <span className={`flex items-center gap-1 text-[10.5px] ${trend.cls}`} title={`Trend: ${s.trend || "flat"}`}>
          <TrendIcon className="h-3 w-3" aria-hidden="true" />
          {s.trend || "flat"}
        </span>
      </div>
      <div className="font-heading text-[16px] mt-1.5 leading-tight">{s.subject}</div>
      <div className="mt-2 h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
        <div className="h-full" style={{ width: `${pct}%`, background: color }} />
      </div>
      <div className="mt-2 flex items-center justify-between text-[10.5px] text-clay-700">
        <span className="num-mono">{pct}% closed</span>
        {pct < 65 ? <Pill tone="amber">below 65%</Pill> : <Pill tone="sage">on target</Pill>}
      </div>
    </div>
  );
}

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
      <PageHeader
        eyebrow="Subjects · topic intelligence"
        title="From subject to a concrete next action."
        sub="Subject progress comes from your study plan. Topic-level mastery and high-yield labels appear only once they have been verified and locked by review."
        right={<StatusDot state="partial" label="Partial · progress live, topics review-gated" />}
      />

      <ExamContextCard examContext={examContext} />

      <Card>
        <SectionHeader
          eyebrow="Subject progress"
          title="Where you stand, by subject."
          right={<StatusDot state="live" label="" />}
        />
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
          {items.map((s, i) => (
            <SubjectCard key={s.subject} s={s} color={SUBJECT_COLORS[i % SUBJECT_COLORS.length]} />
          ))}
          {!loading && !items.length ? (
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
              No subject progress yet — set up a study plan to start tracking.
            </div>
          ) : null}
        </div>
      </Card>

      <Card>
        <SectionHeader
          eyebrow="Topic tree"
          title="Click any topic to see priority + evidence."
          sub="High-yield only appears on topics admin has locked. Observed difficulty is your data; expected difficulty is exam intelligence."
        />
        <StudyEmptyState
          icon="◑"
          title="Topic tree not yet connected for this subject."
          body="Backend hookup pending. Verified topics from /admin/exam-intelligence will populate here once they are locked by review."
          cta={
            <a
              className="text-[12px] font-semibold text-clay-900 link-under"
              href="/admin/exam-intelligence"
            >
              Open exam intelligence →
            </a>
          }
        />
        <p className="mt-3 text-[11.5px] text-clay-700">
          Topic-level mastery, exam priority and high-yield labels populate here once verified topics
          from{" "}
          <a className="underline underline-offset-2" href="/admin/exam-intelligence">
            exam intelligence
          </a>{" "}
          are locked by review.
        </p>
      </Card>
    </div>
  );
}
