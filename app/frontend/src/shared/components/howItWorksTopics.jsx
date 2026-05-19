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

// PR9: page-level explainers reached from the header "?" trigger on
// Study Home, Study Plan, and Today. Plain-language, deterministic
// framing — the planner is the authority and AI only assists.
HOW_IT_WORKS_TOPICS.study_home = {
  title: "How Study Home works",
  description:
    "A single view of your active plan, your next study action, focus time, and the latest report-card snapshot.",
  render: () => (
    <div className="space-y-3 text-sm text-clay-800">
      <p>
        Study Home reads from the same sources as the rest of the app — your
        active plan, your task list, your focus sessions, and your weekly
        report card. Nothing on this page is generated; every card shows live
        values from your data, or an explicit empty state when there is
        nothing to show.
      </p>
      <p>
        "Next study action" is picked deterministically from your plan, in
        this order:
      </p>
      <ol className="list-decimal pl-5 space-y-1.5">
        <li>Overdue tasks first, earliest due date wins.</li>
        <li>Then upcoming tasks, by due date.</li>
        <li>If two tasks tie, the original plan order breaks the tie.</li>
      </ol>
      <p>
        No AI ranks this list — the same input always produces the same next
        action.
      </p>
    </div>
  ),
};

HOW_IT_WORKS_TOPICS.study_plan = {
  title: "How Study Plan works",
  description:
    "A deterministic planner owns your schedule. AI only suggests and explains; you decide what to apply.",
  render: () => (
    <div className="space-y-3 text-sm text-clay-800">
      <p>
        Your plan is produced by a deterministic planner that respects your
        target exam, your locked topic coverage, and your study policy. The
        same inputs always produce the same plan — the planner is the
        authority over what is scheduled.
      </p>
      <p>
        AI never edits the plan in place. When it has something to say it
        appears as a suggestion: an explanation of why a slot moved, or a
        proposed change you can preview.
      </p>
      <ul className="list-disc pl-5 space-y-1.5">
        <li>
          <span className="font-medium">Regenerate plan</span> asks the
          planner to recompute the schedule against your current inputs.
        </li>
        <li>
          <span className="font-medium">Suggest changes</span> surfaces
          planner-suggested edits for review.
        </li>
        <li>
          <span className="font-medium">Preview changes</span> shows the
          diff before anything is saved.
        </li>
        <li>
          <span className="font-medium">Apply selected changes</span> is the
          only action that mutates the live plan.
        </li>
      </ul>
    </div>
  ),
};

HOW_IT_WORKS_TOPICS.today_overview = {
  title: "How Today works",
  description:
    "A cross-product overview of what to act on right now — applications, eligibility, and study — pulled live from each surface.",
  render: () => (
    <div className="space-y-3 text-sm text-clay-800">
      <p>
        Today is a snapshot, not a separate data store. The hero action, the
        quick actions, and the applications snapshot are computed from the
        same recruitments, applications, and document data you see on their
        owning pages.
      </p>
      <p>
        The profile banner only appears when a profile signal crosses a
        threshold — for example, missing required fields for an active
        recruitment, an expired document, or a stale preference that
        blocks an eligibility check. When every threshold is clear, the
        banner stays hidden.
      </p>
      <p>
        Policy updates shown here follow a freshness rule: only items
        published since your last visit and still relevant to your tracked
        exams are surfaced. Older items roll off automatically — they are
        not deleted, just no longer flagged as new.
      </p>
    </div>
  ),
};

export function lookupTopic(topic) {
  if (!topic) return null;
  return HOW_IT_WORKS_TOPICS[topic] || null;
}
