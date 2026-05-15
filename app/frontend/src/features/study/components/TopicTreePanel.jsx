import React from "react";
import TopicRow from "./TopicRow";
import {
  SectionHeader,
  StudyCard,
  StudyEmptyState,
  TrustStamp,
} from "../../../shared/ui/studyos";

// TopicTreePanel — locked-only topic intelligence grouped by subject.
// Filtering by `activeSubjectId` lets a parent SubjectCards selection
// drive the panel without the panel making any state assumptions.
export default function TopicTreePanel({
  topics,
  loading,
  activeSubjectId,
  onClear,
}) {
  const rows = Array.isArray(topics) ? topics : [];
  const filtered = activeSubjectId
    ? rows.filter((t) => t.subject_id === activeSubjectId)
    : rows;
  const groups = filtered.reduce((acc, t) => {
    const key = t.subject_id || t.subject || "General";
    if (!acc[key]) acc[key] = { subject: t.subject || "General", items: [] };
    acc[key].items.push(t);
    return acc;
  }, {});

  return (
    <StudyCard data-testid="topic-tree-panel">
      <SectionHeader
        eyebrow="Topic tree · locked only"
        title="Click any topic to see priority + evidence."
        sub="High-yield only appears on topics admin has locked. Observed difficulty is your data; expected difficulty is exam intelligence."
        right={<TrustStamp kind="locked" />}
      />

      {activeSubjectId ? (
        <div className="flex items-center gap-2 mb-3 text-[11.5px] text-clay-700">
          <span>
            Filtered to <strong className="text-clay-900">{filtered[0]?.subject || activeSubjectId}</strong>
          </span>
          {onClear ? (
            <button
              type="button"
              onClick={onClear}
              className="num-mono text-[10.5px] underline underline-offset-2 text-clay-700 hover:text-clay-900"
            >
              clear filter
            </button>
          ) : null}
        </div>
      ) : null}

      {loading ? (
        <p className="text-sm text-clay-700">Loading topic intelligence…</p>
      ) : !filtered.length ? (
        <StudyEmptyState
          icon="◑"
          title={
            activeSubjectId
              ? "No locked topics for this subject yet."
              : "No locked topics yet for your target exam."
          }
          body="Verified topics from /admin/exam-intelligence populate here once they are locked by review."
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
          {Object.entries(groups).map(([key, group]) => (
            <div key={key} className="rounded-xl border border-[#E7DECB] bg-white/60">
              <div className="px-4 py-2.5 border-b border-[#E7DECB] flex items-center justify-between">
                <div className="font-heading text-[14px]">{group.subject}</div>
                <span className="num-mono text-[11px] text-clay-700">
                  {group.items.length} topic{group.items.length === 1 ? "" : "s"}
                </span>
              </div>
              <ul>
                {group.items.map((t) => (
                  <TopicRow key={t.topic_id} topic={t} />
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <p className="mt-3 text-[11.5px] text-clay-700">
        Source labels (locked / high-yield) are returned by the backend and never derived on
        the client. Manage locks in{" "}
        <a className="underline underline-offset-2" href="/admin/exam-intelligence">
          exam intelligence
        </a>
        .
      </p>
    </StudyCard>
  );
}
