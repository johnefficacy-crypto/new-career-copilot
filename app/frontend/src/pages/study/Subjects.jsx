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
  // Per-endpoint error state so users can distinguish "no data yet" from
  // "endpoint broke." Without this, allSettled silently swallowed each
  // failure and the section stayed in its empty state forever.
  const [errors, setErrors] = useState({ subjects: null, topics: null });
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setSubjectsLoading(true);
      setTopicsLoading(true);
      const [subjectsRes, mcRes, topicsRes] = await Promise.allSettled([
        api.get("/api/study/subjects"),
        api.get("/api/study/mission-control"),
        api.get("/api/study/topics"),
      ]);
      if (cancelled) return;
      const nextErrors = { subjects: null, topics: null };
      if (subjectsRes.status === "fulfilled") {
        const d = subjectsRes.value;
        setItems(Array.isArray(d?.items) ? d.items : []);
      } else {
        nextErrors.subjects = subjectsRes.reason?.message || "Couldn’t load subjects.";
      }
      if (mcRes.status === "fulfilled") {
        setExamContext(mcRes.value?.exam_context || null);
      }
      // Mission control failure is non-fatal here — the exam context card
      // already has its own empty state, so we don't surface that error.
      if (topicsRes.status === "fulfilled") {
        setTopics(Array.isArray(topicsRes.value?.items) ? topicsRes.value.items : []);
      } else {
        nextErrors.topics = topicsRes.reason?.message || "Couldn’t load topics.";
      }
      setErrors(nextErrors);
      setSubjectsLoading(false);
      setTopicsLoading(false);
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [reloadKey]);

  function ErrorBanner({ message, onRetry, testid }) {
    return (
      <div
        className="rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[12px] text-amber-800 flex items-center justify-between gap-2"
        role="status"
        data-testid={testid}
      >
        <span>{message}</span>
        <button
          type="button"
          onClick={onRetry}
          className="font-semibold underline underline-offset-2 hover:text-amber-900"
        >
          Retry
        </button>
      </div>
    );
  }

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
        right={<StatusDot state="partial" label="Partial · progress live, topics available after review" />}
      />

      <ExamContextCard examContext={examContext} />

      {errors.subjects ? (
        <ErrorBanner
          message={errors.subjects}
          onRetry={() => setReloadKey((k) => k + 1)}
          testid="subjects-error"
        />
      ) : null}

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

      {errors.topics ? (
        <ErrorBanner
          message={errors.topics}
          onRetry={() => setReloadKey((k) => k + 1)}
          testid="topics-error"
        />
      ) : null}

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
