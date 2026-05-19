import React, { useState } from "react";
import { Check } from "lucide-react";

// Post-session reflection. The current /api/study/focus/stop contract does
// not accept these fields, so values stay local and the panel is clearly
// labelled "reflection preview". When the planner endpoint gains support,
// the collected `reflection` object can be passed through `onSave`.
const COMPLETION = [
  { value: "completed", label: "Completed" },
  { value: "partial", label: "Partial" },
  { value: "not_done", label: "Not done" },
];
const DIFFICULTY = [
  { value: "easy", label: "Easy" },
  { value: "ok", label: "OK" },
  { value: "hard", label: "Hard" },
];
const REVISE = [
  { value: "yes", label: "Yes, soon" },
  { value: "not_yet", label: "Not yet" },
];

function ToggleGroup({ legend, options, value, onChange, name }) {
  return (
    <fieldset>
      <legend className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
        {legend}
      </legend>
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={legend}>
        {options.map((o) => {
          const active = value === o.value;
          return (
            <button
              key={o.value}
              type="button"
              name={name}
              aria-pressed={active}
              onClick={() => onChange(active ? null : o.value)}
              className={`px-3 py-1.5 rounded-full text-xs font-semibold transition border ${
                active
                  ? "bg-dusk-900 text-white border-dusk-900"
                  : "bg-white/70 text-foreground/80 border-border hover:bg-clay-50"
              }`}
            >
              {active ? <Check className="h-3 w-3 inline mr-1" aria-hidden="true" /> : null}
              {o.label}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

export default function FocusReflectionPanel({ session, onDismiss, onSave, bare = false }) {
  const [completion, setCompletion] = useState(null);
  const [difficulty, setDifficulty] = useState(null);
  const [distractions, setDistractions] = useState(0);
  const [confidence, setConfidence] = useState(60);
  const [revise, setRevise] = useState(null);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    const reflection = {
      subject: session?.subject || "",
      topic: session?.topic || "",
      completed_min: session?.completedMin ?? null,
      completion_quality: completion,
      perceived_difficulty: difficulty,
      distraction_count: distractions,
      confidence_after: confidence,
      should_revise: revise,
      saved_at: new Date().toISOString(),
    };
    setSaving(true);
    setSaveError("");
    try {
      // Persist locally so the "kept on this device" copy is accurate even
      // before a backend endpoint exists. Keyed by a stable session id when
      // available; falls back to a session-anonymous bucket of recent
      // reflections (cap at 50 to bound localStorage usage).
      try {
        const key = session?.id
          ? `focus.reflection.${session.id}`
          : "focus.reflection.recent";
        if (session?.id) {
          window.localStorage.setItem(key, JSON.stringify(reflection));
        } else {
          const prior = JSON.parse(
            window.localStorage.getItem(key) || "[]",
          );
          const next = Array.isArray(prior) ? prior : [];
          next.unshift(reflection);
          window.localStorage.setItem(key, JSON.stringify(next.slice(0, 50)));
        }
      } catch {
        // localStorage may be disabled (private mode / quota). Don't
        // surface a false "saved" — if we couldn't persist AND there's
        // no remote onSave, treat that as a save failure.
        if (typeof onSave !== "function") {
          throw new Error("Local storage is disabled — couldn’t save reflection.");
        }
      }
      if (typeof onSave === "function") await onSave(reflection);
      setSaved(true);
    } catch (e) {
      setSaveError(e?.message || "Couldn’t save reflection — try again.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <section
      className={
        bare
          ? "space-y-4"
          : "soft-card rounded-2xl p-6 space-y-4"
      }
      data-testid="focus-reflection-panel"
      aria-labelledby="focus-reflection-heading"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Post-session reflection
          </div>
          <h2 id="focus-reflection-heading" className="font-heading text-lg font-semibold mt-0.5">
            How did that block go?
          </h2>
          {session?.subject || session?.topic ? (
            <p className="text-xs text-muted-foreground mt-0.5">
              {[session?.subject, session?.topic].filter(Boolean).join(" · ")}
              {session?.completedMin ? ` · ${session.completedMin} min` : ""}
            </p>
          ) : null}
        </div>
        <span className="pill pill-dusk text-[10px]">Reflection preview</span>
      </div>

      {saved ? (
        <div
          className="rounded-xl bg-sage-50 text-sage-700 text-sm px-4 py-3"
          role="status"
        >
          Reflection noted for this session. It is kept on this device for now — the
          planner endpoint does not yet store reflection fields.
        </div>
      ) : (
        <>
          <div className="grid sm:grid-cols-2 gap-4">
            <ToggleGroup
              legend="Completion quality"
              options={COMPLETION}
              value={completion}
              onChange={setCompletion}
              name="completion"
            />
            <ToggleGroup
              legend="Perceived difficulty"
              options={DIFFICULTY}
              value={difficulty}
              onChange={setDifficulty}
              name="difficulty"
            />
          </div>

          <div>
            <div className="text-[11px] uppercase tracking-widest text-muted-foreground mb-1.5">
              Distractions
            </div>
            <div className="flex items-center gap-1.5 flex-wrap" role="group" aria-label="Distraction count">
              {[0, 1, 2, 3, 4].map((n) => (
                <button
                  key={n}
                  type="button"
                  aria-pressed={distractions === n}
                  aria-label={`${n} distraction${n === 1 ? "" : "s"}`}
                  onClick={() => setDistractions(n)}
                  className={`h-8 w-8 rounded-full text-xs font-semibold transition border ${
                    distractions === n
                      ? "bg-dusk-900 text-white border-dusk-900"
                      : "bg-white/70 text-foreground/80 border-border hover:bg-clay-50"
                  }`}
                >
                  {n}
                </button>
              ))}
              {/* Free-form input for 5+: keeps an exact count instead of
                  silently clamping at 5 the way the prior preset did. */}
              <label className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                <span className="sr-only">5 or more — enter exact count</span>
                <span aria-hidden="true">5+</span>
                <input
                  type="number"
                  min="5"
                  step="1"
                  inputMode="numeric"
                  value={distractions >= 5 ? distractions : ""}
                  placeholder="N"
                  aria-label="5 or more distractions — enter exact count"
                  onChange={(e) => {
                    const v = e.target.value;
                    if (v === "") return setDistractions(4);
                    const n = Number(v);
                    if (Number.isFinite(n) && n >= 5) setDistractions(n);
                  }}
                  className="w-14 h-8 rounded-full border border-border bg-white/70 px-2 text-xs text-foreground/80 focus-visible:ring-2 focus-visible:ring-clay-900"
                />
              </label>
            </div>
          </div>

          <div>
            <label
              htmlFor="focus-confidence"
              className="text-[11px] uppercase tracking-widest text-muted-foreground"
            >
              Confidence after session
            </label>
            <div className="flex items-center gap-3 mt-1.5">
              <input
                id="focus-confidence"
                type="range"
                min="0"
                max="100"
                step="5"
                value={confidence}
                onChange={(e) => setConfidence(Number(e.target.value))}
                className="flex-1 accent-clay-500"
              />
              <span className="font-heading text-lg font-semibold w-12 text-right tabular-nums">
                {confidence}%
              </span>
            </div>
          </div>

          <ToggleGroup
            legend="Should this topic be revised soon?"
            options={REVISE}
            value={revise}
            onChange={setRevise}
            name="revise"
          />

          <div className="flex items-center gap-2 pt-1">
            <button
              type="button"
              className="btn btn-primary"
              onClick={handleSave}
              disabled={saving}
            >
              {saving ? "Saving…" : "Save reflection"}
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={onDismiss}
              disabled={saving}
            >
              Skip
            </button>
          </div>
          {saveError ? (
            <div
              className="text-[11px] text-rose-700"
              role="status"
              data-testid="focus-reflection-error"
            >
              {saveError}
            </div>
          ) : null}
        </>
      )}

      {saved ? (
        <div className="flex items-center gap-2">
          <button type="button" className="btn btn-ghost" onClick={onDismiss}>
            Done
          </button>
        </div>
      ) : null}
    </section>
  );
}
