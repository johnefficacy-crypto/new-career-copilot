import React from "react";
import { ExternalLink } from "lucide-react";
import SourceTrustBadge from "./SourceTrustBadge";

// Preview content. Real updates will come from an Update Intelligence endpoint
// once it lands. Sample items are clearly marked "Static example" so they are
// not mistaken for live verified intelligence.
const SAMPLE_OFFICIAL = [
  {
    id: "sample-u1",
    title: "Exam cycle notification (example)",
    summary:
      "Official notifications, dates and eligibility changes appear here once the Update Intelligence endpoint is connected.",
    source: "(static example)",
    tag: "Cycle update",
    effect: "Affects deadlines",
  },
  {
    id: "sample-u2",
    title: "Syllabus addendum (example)",
    summary:
      "Verified syllabus changes will flow into your subject tree and microtopic list, and into today's plan automatically.",
    source: "(static example)",
    tag: "Syllabus change",
    effect: "Affects plan",
  },
];

const SAMPLE_UNVERIFIED = [
  {
    id: "sample-u3",
    title: "Date rumor from aggregator (example)",
    summary:
      "Items from aggregator sites are surfaced for awareness only. They never silently rewrite your plan.",
    source: "(static example)",
    kind: "aggregator",
    tag: "Date rumor",
    effect: "No plan change",
  },
  {
    id: "sample-u4",
    title: "Pattern shift research note (example)",
    summary:
      "Research and trend analysis is shown as a hint, not as an official communication.",
    source: "(static example)",
    kind: "research",
    tag: "Trend",
    effect: "Hint only",
  },
  {
    id: "sample-u5",
    title: "Adjacent recruitment opportunity (example)",
    summary:
      "When you become eligible for an adjacent recruitment, it surfaces here — not in your main plan.",
    source: "(static example)",
    kind: "opportunity",
    tag: "Opportunity",
    effect: "Affects eligibility",
  },
];

function normalizeUpdate(u) {
  return {
    id: u.id,
    title: u.title || "Update",
    summary: u.summary || "",
    source: u.source || "",
    sourceUrl: u.source_url || u.sourceUrl,
    tag: u.tag || "",
    effect: u.effect || "",
    receivedAt: u.received_at || u.receivedAt || "",
    kind: u.kind || u.sourceType || "official",
  };
}

function OfficialCard({ u }) {
  return (
    <article
      className="rounded-xl border border-sage-200 bg-sage-50/40 p-4"
      data-testid={`update-card-${u.id}`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <SourceTrustBadge kind="official" compact />
        {u.tag ? <span className="pill pill-sage">{u.tag}</span> : null}
      </div>
      <h3 className="font-heading text-base font-semibold mt-2 leading-snug">
        {u.title}
      </h3>
      <p className="text-sm text-clay-800 mt-1.5">{u.summary}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Source
          </div>
          <div className="font-mono text-clay-800 mt-0.5 break-words">{u.source || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Effect on plan
          </div>
          <div className="text-sage-700 mt-0.5">{u.effect || "—"}</div>
        </div>
      </div>
      {u.sourceUrl ? (
        <a
          href={u.sourceUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-3 inline-flex items-center gap-1 text-xs text-sage-700 hover:underline"
        >
          Open original <ExternalLink className="h-3 w-3" aria-hidden="true" />
        </a>
      ) : null}
    </article>
  );
}

function UnverifiedCard({ u }) {
  const kind = u.kind === "aggregator" || u.kind === "research" || u.kind === "opportunity"
    ? u.kind
    : "needs_verification";
  return (
    <article
      className="rounded-xl border border-dashed border-dusk-300 bg-dusk-50/40 p-4"
      data-testid={`update-card-${u.id}`}
    >
      <div className="flex items-start gap-2 flex-wrap">
        <SourceTrustBadge kind={kind} compact />
        {u.tag ? <span className="pill pill-dusk">{u.tag}</span> : null}
      </div>
      <h3 className="font-heading text-base font-semibold mt-2 leading-snug text-dusk-800">
        {u.title}
      </h3>
      <p className="text-sm text-clay-800 mt-1.5">{u.summary}</p>
      <div className="mt-3 grid grid-cols-2 gap-3 text-xs">
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Source
          </div>
          <div className="font-mono text-dusk-800 mt-0.5 break-words">{u.source || "—"}</div>
        </div>
        <div>
          <div className="text-[10px] uppercase tracking-[0.18em] text-muted-foreground font-semibold">
            Effect on plan
          </div>
          <div className="text-dusk-700 mt-0.5">{u.effect || "Surfaced only"}</div>
        </div>
      </div>
    </article>
  );
}

export default function UpdateIntelligencePanel({ official, unverified, isPreview = true }) {
  const officialList = Array.isArray(official) && official.length
    ? official.map(normalizeUpdate)
    : SAMPLE_OFFICIAL.map(normalizeUpdate);
  const unverifiedList = Array.isArray(unverified) && unverified.length
    ? unverified.map(normalizeUpdate)
    : SAMPLE_UNVERIFIED.map(normalizeUpdate);

  const noOfficial = !Array.isArray(official) || !official.length;
  const noUnverified = !Array.isArray(unverified) || !unverified.length;
  const showingPreview = isPreview || (noOfficial && noUnverified);

  return (
    <section
      className="soft-card rounded-2xl p-5"
      aria-labelledby="update-intel-heading"
      data-testid="update-intelligence-panel"
    >
      <div className="flex items-start justify-between flex-wrap gap-2">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Update intelligence
          </div>
          <h2
            id="update-intel-heading"
            className="font-heading text-xl font-semibold mt-1"
          >
            Exam updates, separated by trust.
          </h2>
          <p className="text-xs text-muted-foreground mt-1 max-w-prose">
            Official updates have a verified badge and can change your plan
            automatically. Aggregator, research and opportunity updates are
            surfaced only — they never silently rewrite your plan.
          </p>
        </div>
        {showingPreview ? (
          <span className="pill pill-amber" data-testid="updates-preview-tag">
            Preview · static example
          </span>
        ) : null}
      </div>

      <div className="mt-4 grid lg:grid-cols-2 gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span className="h-2 w-2 rounded-full bg-sage-500" aria-hidden="true" />
            <div className="text-[10px] uppercase tracking-[0.22em] text-sage-700 font-semibold">
              Officially verified · auto-applied
            </div>
          </div>
          <div className="space-y-3">
            {officialList.map((u) => (
              <OfficialCard key={u.id} u={u} />
            ))}
          </div>
        </div>
        <div>
          <div className="flex items-center gap-2 mb-2">
            <span
              className="h-2 w-2 rounded-full border border-dashed border-dusk-400"
              aria-hidden="true"
            />
            <div className="text-[10px] uppercase tracking-[0.22em] text-dusk-700 font-semibold">
              Needs verification · informational
            </div>
          </div>
          <div className="space-y-3">
            {unverifiedList.map((u) => (
              <UnverifiedCard key={u.id} u={u} />
            ))}
          </div>
        </div>
      </div>

      {showingPreview ? (
        <div className="mt-4 text-[11px] text-muted-foreground italic">
          Update intelligence endpoint is not connected yet — these cards are
          static examples illustrating the trust contract.
        </div>
      ) : null}
    </section>
  );
}
