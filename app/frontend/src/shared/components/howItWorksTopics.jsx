import React from "react";
import StudyPolicyPreview from "../../features/study/components/StudyPolicyPreview";
import PlanReasoningCard from "../../features/study/components/PlanReasoningCard";
import IntelligenceLayersPanel from "../../features/study/components/IntelligenceLayersPanel";

// PR6 of the Today / Eligibility / Study reorg.
// Registry of topics that the global "How it works" drawer can render.
// Each topic returns `{ title, description, render(data) -> ReactNode }`.
// `data` is the optional `detail.data` payload from the
// `ccp:how-it-works:open` CustomEvent so a caller can pass live values
// (e.g. the active `policy`, `reasoning`) into the drawer.
//
// New topics: add a key here and document any required `data` shape.
// Removing a topic only requires deleting the entry — call sites that
// reference an unknown topic show the generic fallback below.
export const HOW_IT_WORKS_TOPICS = {
  persona: {
    title: "How we read you",
    description:
      "Persona is computed, never edited directly. We combine the structured fields you've shared with the engine's behaviour signals to keep your plan and matches honest.",
    render: () => (
      <div className="space-y-3 text-sm text-clay-800">
        <p>
          Each line on your persona card is a signal — a structured fact (from
          your profile or onboarding) or a behaviour signal (from how you use
          the app). We never invent persona text; if a signal isn't present, we
          show "Not enough data yet" rather than guessing.
        </p>
        <p>
          The signals roll into a private snapshot the engine uses to prioritise
          recommendations. You can refresh persona by completing missing
          profile fields or by answering an onboarding question.
        </p>
        <ul className="list-disc pl-5 space-y-1.5">
          <li>Profile fields update persona immediately on save.</li>
          <li>Behaviour signals roll up over a few days of use.</li>
          <li>Persona never overrides deterministic eligibility checks.</li>
        </ul>
      </div>
    ),
  },

  study_policy: {
    title: "How your study policy works",
    description:
      "Constraints the planner respects when building each day — sleep window, break minutes, quiet hours, focus blocks.",
    render: (data) => (
      <div className="space-y-4">
        <p className="text-sm text-clay-800">
          The policy is a set of constraints, not a prescription. We only show
          values that are explicitly set — empty entries are treated as "not
          provided" and ignored by the planner.
        </p>
        {data?.policy ? (
          <StudyPolicyPreview policy={data.policy} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No active policy passed in. Open this drawer from a page that
            knows your policy to see the live values.
          </p>
        )}
      </div>
    ),
  },

  plan_reasoning: {
    title: "Why today's plan looks the way it does",
    description:
      "Each entry is tagged by signal channel — persona, exam intelligence, competition pressure, policy updates, or progress.",
    render: (data) => (
      <div className="space-y-4">
        <p className="text-sm text-clay-800">
          Reasoning is explanatory, not editorial. The planner is
          deterministic; these notes describe which inputs moved the needle.
        </p>
        {data?.reasoning && data.reasoning.length > 0 ? (
          <PlanReasoningCard reasoning={data.reasoning} />
        ) : (
          <p className="text-sm text-muted-foreground">
            No reasoning entries to show right now.
          </p>
        )}
      </div>
    ),
  },

  intelligence_layers: {
    title: "Intelligence layers",
    description:
      "Four layers feed the engine: user, exam, news / policy updates, and the computed plan itself. Each layer has its own data path.",
    render: () => (
      <div className="space-y-4">
        <p className="text-sm text-clay-800">
          The captions are written in future tense for layers that aren't fully
          wired yet — we'd rather be honest about a stub than dress one up as
          live data.
        </p>
        <IntelligenceLayersPanel />
      </div>
    ),
  },

  why_recommendation: {
    title: "Why this recommendation?",
    description:
      "Recommendations combine the deterministic eligibility verdict, application state, apply-window timing, and your saved preferences.",
    render: (data) => (
      <div className="space-y-3 text-sm text-clay-800">
        <p>
          Every recommendation card is the output of the same scoring function.
          The scoring inputs are: deterministic eligibility verdict, your
          application state, the apply window, and your saved preferences.
        </p>
        <p>
          The card's "next action" is the literal next thing the engine thinks
          unblocks the recruitment — it is not a marketing nudge.
        </p>
        {data?.reasons && data.reasons.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Reasons it scored highly
            </div>
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              {data.reasons.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
        {data?.risks && data.risks.length > 0 ? (
          <div>
            <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
              Risks the engine flagged
            </div>
            <ul className="list-disc pl-5 mt-1.5 space-y-1">
              {data.risks.map((r, i) => (
                <li key={i}>{r}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    ),
  },
};

export function lookupTopic(topic) {
  if (!topic) return null;
  return HOW_IT_WORKS_TOPICS[topic] || null;
}
