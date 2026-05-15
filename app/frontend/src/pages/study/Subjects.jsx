import React, { useEffect, useState } from "react";
import { api } from "../../lib/api";
import ExamContextCard from "../../features/study/components/ExamContextCard";
import SubjectCards from "../../features/study/components/SubjectCards";
import TopicTreePanel from "../../features/study/components/TopicTreePanel";
import MasteryDistribution from "../../features/study/components/MasteryDistribution";
import NextRecommendedActions from "../../features/study/components/NextRecommendedActions";
import { PageHeader, StatusDot } from "../../shared/ui/studyos";

// Subjects page composes the prototype's topic-intelligence surface from
// four reusable components: SubjectCards (progress tiles), TopicTreePanel
// (locked-only rows with expandable detail), MasteryDistribution
// (per-subject comparison + target line) and NextRecommendedActions
// (engine-picked next move per subject).
export default function Subjects() {
  const [items, setItems] = useState([]);
  const [examContext, setExamContext] = useState(null);
  const [subjectsLoading, setSubjectsLoading] = useState(true);
  const [topics, setTopics] = useState([]);
  const [topicsLoading, setTopicsLoading] = useState(true);
  const [activeSubjectId, setActiveSubjectId] = useState(null);

  useEffect(() => {
    let cancelled = false;
    async function load() {
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
      setSubjectsLoading(false);
      setTopicsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, []);

  function onSelectSubject(s) {
    // Click again on the active card → clear filter.
    if (activeSubjectId && (activeSubjectId === s.subject_id || activeSubjectId === s.subject)) {
      setActiveSubjectId(null);
      return;
    }
    setActiveSubjectId(s.subject_id || s.subject);
  }

  return (
    <div className="space-y-6" data-testid="subjects-page">
      <PageHeader
        eyebrow="Subjects · topic intelligence"
        title="From subject to a concrete next action."
        sub="Subject progress comes from your study plan. Topic-level mastery and high-yield labels appear only once they have been verified and locked by review."
        right={<StatusDot state="partial" label="Partial · progress live, topics review-gated" />}
      />

      <ExamContextCard examContext={examContext} />

      {subjectsLoading ? (
        <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
          Loading subjects…
        </div>
      ) : (
        <SubjectCards
          items={items}
          onSelect={onSelectSubject}
          activeId={activeSubjectId}
        />
      )}

      <TopicTreePanel
        topics={topics}
        loading={topicsLoading}
        activeSubjectId={activeSubjectId}
        onClear={() => setActiveSubjectId(null)}
      />

      <div className="grid lg:grid-cols-[1fr_400px] gap-6 items-start">
        <MasteryDistribution items={items} />
        <NextRecommendedActions topics={topics} />
      </div>
    </div>
  );
}
