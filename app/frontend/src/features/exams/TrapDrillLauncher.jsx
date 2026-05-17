import React, { useCallback, useEffect, useState } from "react";
import { Flame, Target } from "lucide-react";

import { api } from "../../lib/api";
import TrapDrillModal from "./TrapDrillModal";

/**
 * Small CTA card that opens the trap-awareness drill modal.
 *
 * Owns the deep-link contract: when ``?drill_seed=<n>`` is in the URL
 * on mount, the modal auto-opens against that seed. After every drill
 * the modal echoes back the seed it actually used (so freshly-
 * generated seeds are pinnable too), and the launcher writes that into
 * the current URL via ``history.replaceState`` — keeps refreshes /
 * back-navigation honest without piling up history entries.
 *
 * Also renders the user's drill streak when they have one, so the
 * "start drill" CTA isn't the only signal that practice is sticky.
 */
export default function TrapDrillLauncher({ examSlug, topicId, size = 5 }) {
  const [open, setOpen] = useState(false);
  const [initialSeed, setInitialSeed] = useState(null);
  const [streak, setStreak] = useState(null);

  // Parse the seed once on mount so refreshes don't keep re-opening
  // the modal while the user is mid-edit elsewhere on the page.
  useEffect(() => {
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    const seed = params.get("drill_seed");
    if (seed && /^\d+$/.test(seed)) {
      setInitialSeed(Number(seed));
      setOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Pull streak alongside the launcher so the badge renders without
  // opening the modal.
  useEffect(() => {
    if (!examSlug) return undefined;
    let cancelled = false;
    api
      .get(`/api/exam-intelligence/exams/${examSlug}/trap-drill/streak`)
      .then((d) => {
        if (!cancelled) setStreak(d);
      })
      .catch(() => {
        // Streak is purely decorative — failing it shouldn't surface.
      });
    return () => {
      cancelled = true;
    };
  }, [examSlug, open]);

  const handleSeedChange = useCallback((seed) => {
    if (typeof window === "undefined" || !seed) return;
    const params = new URLSearchParams(window.location.search);
    if (String(params.get("drill_seed")) === String(seed)) return;
    params.set("drill_seed", String(seed));
    window.history.replaceState(
      {},
      "",
      `${window.location.pathname}?${params.toString()}`
    );
  }, []);

  const handleClose = useCallback(() => {
    setOpen(false);
    // Drop the deep-link query param so a fresh "Start drill" press
    // gets a brand-new shuffle.
    if (typeof window === "undefined") return;
    const params = new URLSearchParams(window.location.search);
    if (params.has("drill_seed")) {
      params.delete("drill_seed");
      const qs = params.toString();
      window.history.replaceState(
        {},
        "",
        qs
          ? `${window.location.pathname}?${qs}`
          : window.location.pathname
      );
    }
    setInitialSeed(null);
  }, []);

  if (!examSlug) return null;

  const currentStreak = streak?.current_streak_days || 0;
  const thisWeek = streak?.drills_this_week || 0;

  return (
    <>
      <section
        className="soft-card rounded-2xl p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        data-testid="trap-drill-launcher"
        aria-labelledby="trap-drill-launcher-title"
      >
        <div className="flex items-start gap-3">
          <Target
            className="h-5 w-5 text-clay-600 mt-1 shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Practice · verified PYQs
            </div>
            <h3
              id="trap-drill-launcher-title"
              className="font-heading text-lg font-semibold mt-0.5"
            >
              Run a {size}-question trap-awareness drill
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              {topicId
                ? "Scoped to the topic you've selected above. "
                : ""}
              Quick MCQ from verified past papers, weighted toward questions
              with known trap patterns. Each answer reveals the trap insight
              before you move on.
            </p>
            {currentStreak > 0 && (
              <div
                className="mt-2 inline-flex items-center gap-1 text-xs text-clay-700"
                data-testid="trap-drill-streak"
                aria-label={`Current streak ${currentStreak} day${
                  currentStreak === 1 ? "" : "s"
                }, ${thisWeek} drill${thisWeek === 1 ? "" : "s"} this week`}
              >
                <Flame
                  className="h-3.5 w-3.5 text-amber-600"
                  aria-hidden="true"
                />
                <span>
                  {currentStreak}-day streak
                  {thisWeek > 0 ? ` · ${thisWeek} this week` : ""}
                </span>
              </div>
            )}
          </div>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-primary"
            data-testid="trap-drill-start"
          >
            Start drill
          </button>
        </div>
      </section>
      <TrapDrillModal
        open={open}
        onClose={handleClose}
        examSlug={examSlug}
        topicId={topicId}
        size={size}
        initialSeed={initialSeed}
        onSeedChange={handleSeedChange}
      />
    </>
  );
}
