import React, { useCallback, useEffect, useState } from "react";
import { SlidersHorizontal } from "lucide-react";
import { api } from "../../../lib/api";

// User autonomy over the deterministic planner. Lets an aspirant steer the
// weighting "focus", the plan shape (task count / size) and whether
// event-driven regeneration runs — then save, or save and regenerate now.

const FOCUS_OPTIONS = [
  { value: "balanced", label: "Balanced" },
  { value: "weak_areas", label: "My weak areas" },
  { value: "exam_priority", label: "Exam priority" },
  { value: "high_yield", label: "High-yield" },
];

const SIZE_OPTIONS = [
  { value: null, label: "Auto" },
  { value: "small", label: "Small" },
  { value: "medium", label: "Medium" },
  { value: "large", label: "Large" },
];

const TASK_COUNT_OPTIONS = [null, 1, 2, 3, 4, 5, 6, 7, 8];

function Segmented({ label, options, value, onChange }) {
  return (
    <div>
      <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
        {label}
      </div>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {options.map((o) => {
          const active = o.value === value;
          return (
            <button
              key={String(o.value)}
              type="button"
              onClick={() => onChange(o.value)}
              aria-pressed={active}
              className={`text-xs rounded-full border px-3 py-1 ${
                active
                  ? "border-clay-500 bg-clay-50 text-clay-800"
                  : "border-clay-200 text-muted-foreground hover:bg-clay-50"
              }`}
            >
              {o.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}

export default function PlanPreferencesCard({ onRegenerated }) {
  const [prefs, setPrefs] = useState(null);
  const [loading, setLoading] = useState(true);
  const [dirty, setDirty] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const d = await api.get("/api/study/plan/preferences");
      setPrefs(d || {});
      setError("");
    } catch (e) {
      setError(e?.message || "Could not load plan settings");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  function update(patch) {
    setPrefs((p) => ({ ...(p || {}), ...patch }));
    setDirty(true);
    setMessage("");
  }

  async function save({ regenerate }) {
    if (!prefs) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await api.put("/api/study/plan/preferences", {
        focus: prefs.focus,
        max_tasks_per_day: prefs.max_tasks_per_day ?? null,
        preferred_task_size: prefs.preferred_task_size ?? null,
        auto_regenerate: prefs.auto_regenerate,
      });
      setDirty(false);
      if (regenerate) {
        const res = await api.post("/api/study/plan/generate", {});
        if (res?.generated) {
          setMessage(`Plan regenerated — ${res.task_count} task(s).`);
          if (typeof onRegenerated === "function") onRegenerated();
        } else {
          setMessage(
            `Settings saved. Plan not regenerated: ${res?.reason || "unknown"}.`,
          );
        }
      } else {
        setMessage("Settings saved.");
      }
    } catch (e) {
      setError(e?.message || "Could not save plan settings");
      // Pull server truth back so the segmented buttons stop reflecting an
      // unsaved local edit. Without this the user sees their changed value
      // as if persisted and re-saves the same failing payload.
      load();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="soft-card rounded-2xl p-6" data-testid="plan-preferences-card">
      <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
        <SlidersHorizontal className="h-3.5 w-3.5" aria-hidden="true" /> Your plan settings
      </div>
      <p className="text-xs text-muted-foreground mt-1 max-w-prose">
        Steer how the planner weights your day. These settings override the
        defaults derived from your study persona.
      </p>

      {loading || !prefs ? (
        <p className="mt-3 text-sm text-muted-foreground">Loading settings…</p>
      ) : (
        <div className="mt-4 space-y-4">
          <Segmented
            label="Weighting focus"
            options={FOCUS_OPTIONS}
            value={prefs.focus || "balanced"}
            onChange={(v) => update({ focus: v })}
          />
          <Segmented
            label="Tasks per day"
            options={TASK_COUNT_OPTIONS.map((n) => ({
              value: n,
              label: n === null ? "Auto" : String(n),
            }))}
            value={prefs.max_tasks_per_day ?? null}
            onChange={(v) => update({ max_tasks_per_day: v })}
          />
          <Segmented
            label="Task block size"
            options={SIZE_OPTIONS}
            value={prefs.preferred_task_size ?? null}
            onChange={(v) => update({ preferred_task_size: v })}
          />

          <div className="flex items-center justify-between">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-muted-foreground font-semibold">
                Auto-regenerate
              </div>
              <p className="text-xs text-muted-foreground mt-0.5 max-w-prose">
                Refresh the plan automatically when you log a mock or overnight.
              </p>
            </div>
            <button
              type="button"
              role="switch"
              aria-checked={!!prefs.auto_regenerate}
              onClick={() => update({ auto_regenerate: !prefs.auto_regenerate })}
              className={`relative h-6 w-11 rounded-full transition-colors shrink-0 ${
                prefs.auto_regenerate ? "bg-sage-500" : "bg-clay-200"
              }`}
            >
              <span
                className={`absolute top-0.5 h-5 w-5 rounded-full bg-white shadow transition-transform ${
                  prefs.auto_regenerate ? "translate-x-5" : "translate-x-0.5"
                }`}
              />
            </button>
          </div>

          {error ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">
              {error}
            </div>
          ) : null}
          {message ? (
            <div className="rounded-xl bg-sage-50 text-sage-800 text-xs px-3 py-2">
              {message}
            </div>
          ) : null}

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => save({ regenerate: true })}
              disabled={busy}
              className="btn btn-primary text-sm disabled:opacity-50"
              data-testid="plan-prefs-save-regenerate"
            >
              {busy ? "Working…" : "Save & regenerate plan"}
            </button>
            <button
              type="button"
              onClick={() => save({ regenerate: false })}
              disabled={busy || !dirty}
              className="btn btn-ghost text-sm disabled:opacity-50"
            >
              Save only
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
