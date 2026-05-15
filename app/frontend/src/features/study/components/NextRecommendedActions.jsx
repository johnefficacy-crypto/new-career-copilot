import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  Chip,
  SectionHeader,
  StatusDot,
  StudyCard,
} from "../../../shared/ui/studyos";

const ACTION_COPY = {
  concept_learning: { verb: "Concept block", chip: "weak-area", layer: "engine" },
  retrieval_practice: { verb: "Retrieval practice", chip: "retrieval", layer: "engine" },
  revision: { verb: "Spaced revision", chip: "spaced", layer: "engine" },
};

// NextRecommendedActions — per-subject engine-selected next move, derived
// from the locked topics endpoint. Each subject's recommended topic is
// the highest-priority locked row that still has gap signal (low mastery,
// logged errors, or revision-due).
export default function NextRecommendedActions({ topics }) {
  const perSubject = useMemo(() => {
    const rows = Array.isArray(topics) ? topics : [];
    if (!rows.length) return [];
    const buckets = new Map();
    for (const t of rows) {
      const sid = t.subject_id || t.subject || "General";
      const cur = buckets.get(sid);
      // Higher priority wins; ties broken by "needs the most work" — lower
      // mastery and any error signal.
      const score =
        (t.exam_priority_score || 0) * 10 -
        (t.mastery_score || 100) +
        (t.error_pattern_count ? 25 : 0);
      if (!cur || score > cur.score) {
        buckets.set(sid, {
          sid,
          subject: t.subject || "General",
          topic: t,
          score,
        });
      }
    }
    return Array.from(buckets.values()).slice(0, 6);
  }, [topics]);

  return (
    <StudyCard data-testid="next-recommended-actions">
      <SectionHeader
        eyebrow="Next recommended actions"
        title="Per subject — engine selected."
        right={<StatusDot state={perSubject.length ? "live" : "preview"} label="" />}
      />
      {!perSubject.length ? (
        <p className="text-[12.5px] text-clay-700">
          No locked topics yet — once exam intelligence locks topics for your target exam, the
          engine&rsquo;s next move per subject will appear here.
        </p>
      ) : (
        <ul className="space-y-3">
          {perSubject.map((row) => {
            const copy = ACTION_COPY[row.topic.next_action] || ACTION_COPY.concept_learning;
            const reason = describeReason(row.topic);
            return (
              <li
                key={row.sid}
                className="rounded-xl border border-[#EFE2C9] bg-[#FBF6EF]/70 p-3"
              >
                <div className="flex items-center justify-between">
                  <div className="num-mono text-[10.5px] text-clay-700 uppercase tracking-[0.18em]">
                    {row.subject}
                  </div>
                  <Link
                    to="/app/study/focus"
                    className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
                  >
                    Open focus →
                  </Link>
                </div>
                <div className="text-[13px] mt-1 text-clay-900">
                  {copy.verb} · {row.topic.topic}
                </div>
                <div className="mt-1.5 flex items-center gap-2 text-[11px] flex-wrap">
                  <Chip layer={copy.layer}>{copy.chip}</Chip>
                  <span className="text-clay-700">{reason}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </StudyCard>
  );
}

function describeReason(t) {
  const parts = [];
  if (t.is_high_yield) parts.push("high-yield");
  if (t.error_pattern_count) parts.push("errors logged");
  if (t.revision_due) parts.push("revision due");
  if (t.mastery_score != null && t.mastery_score < 50) parts.push(`mastery ${Math.round(t.mastery_score)}%`);
  if (!parts.length) parts.push(`priority ${Math.round(t.exam_priority_score || 0)}`);
  return parts.join(" · ");
}
