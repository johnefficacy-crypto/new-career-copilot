import React, { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { X } from "lucide-react";
import useProfileCompletion from "../hooks/useProfileCompletion";

// PR5 of the reorg: profile banner on Today.
//
// Thresholds:
//   - pct < 50  : persistent, NOT dismissable (red dot in UserMenu).
//   - 50 ≤ pct < 80 : dismissable; reappears after 7 days.
//   - pct ≥ 80 : hidden (only the green dot in UserMenu remains).
//
// Dismissal is persisted to localStorage so the rule survives reloads
// and tab restores. Key + reappearance window are part of the spec.
const DISMISS_KEY = "today.profileBanner.dismissedAt";
const REAPPEAR_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function readDismissedAt() {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(DISMISS_KEY);
    if (!raw) return null;
    const t = Date.parse(raw);
    return Number.isFinite(t) ? t : null;
  } catch {
    return null;
  }
}

function writeDismissedAt(iso) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(DISMISS_KEY, iso);
  } catch {
    // Quota / privacy mode — the banner will simply not be dismissable
    // for this session, which matches the spec's "fail safe" intent.
  }
}

export default function TodayProfileBanner() {
  const { pct, status, loading, error } = useProfileCompletion();
  const [dismissedAt, setDismissedAt] = useState(() => readDismissedAt());

  // Re-read the dismissal timestamp when the tab regains focus so a
  // dismissal made in another tab is honoured here without a reload.
  useEffect(() => {
    function onStorage(e) {
      if (e.key === DISMISS_KEY) setDismissedAt(readDismissedAt());
    }
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const onDismiss = useCallback(() => {
    const iso = new Date().toISOString();
    writeDismissedAt(iso);
    setDismissedAt(Date.parse(iso));
  }, []);

  // Don't render anything until we have a real reading. A flicker showing
  // a red banner that vanishes when data lands would be worse than a
  // short blank slot.
  if (loading || error) return null;

  // Spec: hidden when completion ≥ 80%; the UserMenu dot carries the
  // signal from here on.
  if (status === "green") return null;

  const isDismissable = status === "amber";

  // If the user dismissed within the reappearance window AND we are in
  // the dismissable tier, suppress the banner.
  if (isDismissable && dismissedAt && Date.now() - dismissedAt < REAPPEAR_AFTER_MS) {
    return null;
  }

  const tone =
    status === "red"
      ? "border-rose-200 bg-rose-50"
      : "border-amber-200 bg-amber-50";

  return (
    <div
      className={`soft-card rounded-2xl p-5 border ${tone}`}
      data-testid="today-profile-banner"
      data-tone={status}
      data-pct={pct}
      role="region"
      aria-label="Profile setup reminder"
    >
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="min-w-0">
          <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
            Profile setup
          </div>
          <div className="font-heading text-lg font-semibold mt-1">
            Continue setup
          </div>
          <p className="text-sm text-muted-foreground mt-1">
            Picks up where you left off.
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Link
            to="/app/onboarding"
            data-testid="today-profile-banner-cta"
            aria-label={`Continue profile setup, ${pct}% complete`}
            className="btn btn-primary focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
          >
            Continue setup
          </Link>
          {isDismissable ? (
            <button
              type="button"
              data-testid="today-profile-banner-dismiss"
              aria-label="Dismiss profile reminder for 7 days"
              onClick={onDismiss}
              className="h-9 w-9 grid place-items-center rounded-lg border border-border bg-white/70 hover:bg-white focus:outline-none focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:ring-primary"
            >
              <X className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
