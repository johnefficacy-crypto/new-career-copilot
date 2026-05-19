import React from "react";
import { HelpCircle } from "lucide-react";
import useMyPersona from "../hooks/useMyPersona";

// PR5 of the reorg: read-only "How we read you" surface on the Profile
// page. Source: GET /api/persona/me (snapshot.evidence + dimensions).
// Per spec:
//   - Read-only; no edit affordance.
//   - One line per signal.
//   - Empty state: "Not enough data yet" — never invent values.
//   - Small "How it works" link. PR6 wires the global right-side drawer
//     that this link opens; for now it's an anchor with onClick that
//     dispatches a custom event so PR6 can attach without re-touching
//     this file.
//
// The persona endpoint is INTERNAL — we deliberately do NOT surface
// primary_persona, scores, or study_policy as user-visible labels.
// Only evidence (and a counted summary of dimensions) is shown.
function humanize(value) {
  if (value == null) return "";
  return String(value).replace(/_/g, " ");
}

function evidenceLine(item) {
  if (!item) return null;
  if (typeof item === "string") return humanize(item);
  if (typeof item !== "object") return String(item);
  // Common shapes coming back from compute_persona_snapshot.evidence:
  //   { type, label, summary, source, value }
  const label = item.label || item.summary || humanize(item.type);
  if (!label) return null;
  const value = item.value != null ? ` · ${humanize(item.value)}` : "";
  const source = item.source ? ` · ${humanize(item.source)}` : "";
  return `${label}${value}${source}`;
}

function dimensionLine(key, payload) {
  if (!key) return null;
  const name = humanize(key);
  if (payload == null) return name;
  if (typeof payload === "string" || typeof payload === "number") {
    return `${name} · ${humanize(payload)}`;
  }
  if (payload && typeof payload === "object") {
    const v = payload.label || payload.value || payload.summary;
    return v != null ? `${name} · ${humanize(v)}` : name;
  }
  return name;
}

function openHowItWorks() {
  // PR6 attaches a listener for this event to open the global drawer.
  // Until then the click is a deliberate no-op rather than a broken
  // link — better than routing to a placeholder page.
  if (typeof window === "undefined") return;
  window.dispatchEvent(
    new CustomEvent("ccp:how-it-works:open", { detail: { topic: "persona" } }),
  );
}

export default function PersonaSummaryCard() {
  const { snapshot, loading, error } = useMyPersona();

  const lines = React.useMemo(() => {
    if (!snapshot) return [];
    const out = [];
    const evidence = Array.isArray(snapshot.evidence) ? snapshot.evidence : [];
    for (const item of evidence) {
      const line = evidenceLine(item);
      if (line) out.push(line);
    }
    // Fall back to dimensions when evidence is empty but the persona
    // engine has produced some structured reading. Never compose a
    // fictional sentence — we only stringify what's in the payload.
    if (out.length === 0 && snapshot.dimensions && typeof snapshot.dimensions === "object") {
      for (const [key, value] of Object.entries(snapshot.dimensions)) {
        const line = dimensionLine(key, value);
        if (line) out.push(line);
      }
    }
    return out;
  }, [snapshot]);

  return (
    <section
      data-testid="persona-summary"
      aria-labelledby="persona-summary-heading"
      className="soft-card rounded-2xl p-5"
    >
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Read-only
          </div>
          <h2
            id="persona-summary-heading"
            className="font-heading text-lg font-semibold mt-1"
          >
            How we read you
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Signals the engine has picked up so far. Update your profile or use the app
            to refine them.
          </p>
        </div>
        <button
          type="button"
          onClick={openHowItWorks}
          className="text-[12px] font-semibold link-under text-clay-700 inline-flex items-center gap-1"
          data-testid="persona-how-it-works"
        >
          <HelpCircle className="h-3.5 w-3.5" aria-hidden="true" />
          How it works
        </button>
      </div>

      <div className="mt-4">
        {loading ? (
          <div role="status" aria-live="polite" className="space-y-2">
            <div className="h-4 w-2/3 bg-clay-100 animate-pulse rounded" />
            <div className="h-4 w-1/2 bg-clay-100 animate-pulse rounded" />
            <span className="sr-only">Loading persona summary</span>
          </div>
        ) : error ? (
          <p data-testid="persona-summary-empty" className="text-sm text-muted-foreground">
            Not enough data yet. Use the app for a few days and we'll start picking up
            signals.
          </p>
        ) : lines.length === 0 ? (
          <p data-testid="persona-summary-empty" className="text-sm text-muted-foreground">
            Not enough data yet. Use the app for a few days and we'll start picking up
            signals.
          </p>
        ) : (
          <ul className="space-y-1.5 text-sm" data-testid="persona-summary-list">
            {lines.map((line, i) => (
              <li key={i} className="flex items-start gap-2">
                <span aria-hidden="true" className="mt-2 inline-block h-1 w-1 rounded-full bg-clay-500" />
                <span>{line}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </section>
  );
}
