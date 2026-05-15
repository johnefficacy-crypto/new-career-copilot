import React, { useEffect, useState } from "react";
import { TrendingUp, TrendingDown, Minus } from "lucide-react";
import { api } from "../../lib/api";
import ExamContextCard from "../../features/study/components/ExamContextCard";
import { Card, Drawer, PageHeader, Pill, SectionHeader, StatusDot, StudyEmptyState, TrustStamp } from "../../shared/ui/studyos";

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
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [selectedTopic, setSelectedTopic] = useState(null);
  const [evidence, setEvidence] = useState(null);
  const [evidenceLoading, setEvidenceLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      // Subject progress always loads; exam intelligence is best-effort and
      // only ever shows verified/locked topics (handled by ExamContextCard).
      const [subjectsRes, mcRes, topicsRes] = await Promise.allSettled([
        api.get("/api/study/subjects"),
        api.get("/api/study/mission-control"),
        api.get("/api/study/topics"),
      ]);
      if (cancelled) return;
      if (subjectsRes.status === "fulfilled") {
        const d = subjectsRes.value;
        setItems(Array.isArray(d?.items) ? d.items : []);
      }
      if (mcRes.status === "fulfilled") {
        setExamContext(mcRes.value?.exam_context || null);
      }
      if (topicsRes.status === "fulfilled") {
        setTopics(Array.isArray(topicsRes.value?.items) ? topicsRes.value.items : []);
      }
      setLoading(false);
      setTopicsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  async function openTopic(topic) {
    setSelectedTopic(topic);
    setEvidence(null);
    if (!topic?.topic_id) return;
    setEvidenceLoading(true);
    try {
      // Evidence is admin-gated; users see a generic preview if 403/404.
      const e = await api.get(`/api/evidence/exam_topic_coverage/${encodeURIComponent(topic.topic_id)}`);
      setEvidence(e);
    } catch {
      setEvidence({ trust: { status: "locked" } });
    } finally {
      setEvidenceLoading(false);
    }
  }

  const topicsBySubject = topics.reduce((acc, t) => {
    const key = t.subject || "General";
    if (!acc[key]) acc[key] = [];
    acc[key].push(t);
    return acc;
  }, {});

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
          eyebrow="Topic tree · locked only"
          title="Click any topic to see priority + evidence."
          sub="High-yield only appears on topics admin has locked. Observed difficulty is your data; expected difficulty is exam intelligence."
          right={<TrustStamp kind="locked" />}
        />
        {topicsLoading ? (
          <p className="text-sm text-clay-700">Loading topic intelligence…</p>
        ) : !topics.length ? (
          <StudyEmptyState
            icon="◑"
            title="No locked topics yet for your target exam."
            body="Backend topics endpoint returned no locked rows. Verified topics from /admin/exam-intelligence will populate here once they are locked by review."
            cta={
              <a
                className="text-[12px] font-semibold text-clay-900 link-under"
                href="/admin/exam-intelligence"
              >
                Open exam intelligence →
              </a>
            }
          />
        ) : (
          <div className="space-y-4">
            {Object.entries(topicsBySubject).map(([subject, list]) => (
              <div key={subject} className="rounded-xl border border-[#E7DECB] bg-white/60">
                <div className="px-4 py-2.5 border-b border-[#E7DECB] flex items-center justify-between">
                  <div className="font-heading text-[14px]">{subject}</div>
                  <span className="num-mono text-[11px] text-clay-700">{list.length} topics</span>
                </div>
                <ul className="divide-y divide-[#E7DECB]">
                  {list.map((t) => (
                    <li key={t.topic_id}>
                      <button
                        type="button"
                        onClick={() => openTopic(t)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-2.5 text-left hover:bg-[#F3EADB] transition"
                        data-testid={`topic-row-${t.topic_id}`}
                      >
                        <div className="min-w-0">
                          <div className="text-[13px] text-clay-900 truncate">{t.topic}</div>
                          <div className="mt-1 flex flex-wrap gap-1.5 items-center">
                            {t.is_high_yield ? <Pill tone="amber">High yield</Pill> : null}
                            <span className="num-mono text-[10.5px] text-clay-700">
                              priority {Math.round(t.exam_priority_score || 0)}
                            </span>
                            <span className="num-mono text-[10.5px] text-clay-700">
                              · pyq {t.verified_pyq_count}
                            </span>
                            {t.mastery_score != null ? (
                              <span className="num-mono text-[10.5px] text-clay-700">
                                · mastery {Math.round(t.mastery_score)}%
                              </span>
                            ) : null}
                          </div>
                        </div>
                        <Pill tone="dusk">{t.next_action.replace(/_/g, " ")}</Pill>
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        <p className="mt-3 text-[11.5px] text-clay-700">
          Source labels (locked / high-yield) are returned by the backend and never derived on the
          client. Manage locks in{" "}
          <a className="underline underline-offset-2" href="/admin/exam-intelligence">
            exam intelligence
          </a>
          .
        </p>
      </Card>

      <Drawer
        open={!!selectedTopic}
        onClose={() => setSelectedTopic(null)}
        title={selectedTopic?.topic || "Topic evidence"}
        width={460}
      >
        {selectedTopic ? (
          <div className="space-y-4">
            <div className="flex flex-wrap items-center gap-2">
              <TrustStamp kind="locked" />
              {selectedTopic.is_high_yield ? <Pill tone="amber">High yield</Pill> : null}
              <Pill tone="dusk">{selectedTopic.next_action.replace(/_/g, " ")}</Pill>
            </div>
            <ul className="text-[13px] text-clay-800 space-y-1.5">
              <li>Subject: <strong>{selectedTopic.subject || "—"}</strong></li>
              <li>Exam priority score: <strong>{Math.round(selectedTopic.exam_priority_score || 0)}</strong></li>
              <li>Verified PYQ count: <strong>{selectedTopic.verified_pyq_count}</strong></li>
              <li>
                Mastery:{" "}
                <strong>
                  {selectedTopic.mastery_score != null ? `${Math.round(selectedTopic.mastery_score)}%` : "no data yet"}
                </strong>
              </li>
              <li>Revision due: <strong>{selectedTopic.revision_due ? "yes" : "no"}</strong></li>
              <li>Error patterns: <strong>{selectedTopic.error_pattern_count}</strong></li>
            </ul>
            <div className="pt-3 border-t border-[#E7DECB]">
              <div className="text-[11px] uppercase tracking-wider text-clay-700">Source</div>
              {evidenceLoading ? (
                <p className="text-[12px] text-clay-700 mt-2">Loading evidence…</p>
              ) : evidence?.row ? (
                <pre className="mt-2 max-h-48 overflow-auto rounded-lg bg-clay-50 p-2.5 text-[11px] num-mono text-clay-800">
                  {JSON.stringify(evidence.row, null, 2)}
                </pre>
              ) : (
                <p className="text-[12px] text-clay-700 mt-2">
                  Detailed source row is admin-only. Trust status above is server-confirmed.
                </p>
              )}
            </div>
          </div>
        ) : null}
      </Drawer>
    </div>
  );
}
