import React, { useCallback, useEffect, useRef, useState } from "react";
import { useLocation } from "react-router-dom";

// PR11 anchor nav for /app/eligibility/exams/:slug.
// Sticky chip strip rendered below the page header card.
// Behaviour:
//   - role=tablist + role=tab + aria-selected sync via scroll-spy.
//   - Arrow Left/Right (and Home/End) move keyboard FOCUS; Enter / Space
//     (or click) activates a section (manual activation per the WAI-ARIA
//     tab pattern — "active" still tracks scroll position so the
//     selected chip mirrors what the user is reading).
//   - IntersectionObserver computes "topmost visible section" with a
//     rootMargin that accounts for the sticky TopBar (64px) + this
//     chip strip's own height + an 8px buffer so headings never sit
//     flush against the sticky strip.
//   - On scroll, URL hash is updated via history.replaceState so the
//     forward/back stack stays clean.
//   - prefers-reduced-motion: "smooth" → "auto" for both click and
//     deep-link scrolls.

// Sticky offset components, used by both the IO rootMargin and the
// click-target scrollTop calculation. Keeping them in one place so
// scroll-spy and click-scroll never disagree on where a section
// "starts".
const TOPBAR_HEIGHT = 64;        // DashShell <TopBar> is `h-16`
const CHIP_STRIP_HEIGHT = 56;    // chip row at sticky size (incl. padding)
const SAFE_BUFFER = 8;
const OFFSET = TOPBAR_HEIGHT + CHIP_STRIP_HEIGHT + SAFE_BUFFER;

function prefersReducedMotion() {
  if (typeof window === "undefined" || !window.matchMedia) return false;
  try {
    return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

export default function ExamDetailAnchorNav({ sections, ready }) {
  const { pathname } = useLocation();
  const [active, setActive] = useState(sections[0]?.id || "");
  const chipRefs = useRef([]);
  // Track which sections are currently in the spy band so we can always
  // resolve "the topmost visible one" without re-querying the DOM.
  const visibleRef = useRef(new Set());

  // Helper kept on a ref so the IntersectionObserver effect doesn't see a
  // stale `pathname`. (`replaceState` writes the full URL each time.)
  const writeHash = useCallback(
    (id) => {
      if (typeof window === "undefined") return;
      const want = id ? `#${id}` : "";
      if (window.location.hash === want) return;
      window.history.replaceState(null, "", `${pathname}${want}`);
    },
    [pathname],
  );

  const scrollToSection = useCallback(
    (id, opts = {}) => {
      const el = typeof document !== "undefined" ? document.getElementById(id) : null;
      if (!el) return;
      const top = el.getBoundingClientRect().top + window.scrollY - OFFSET;
      const behavior =
        opts.behavior || (prefersReducedMotion() ? "auto" : "smooth");
      window.scrollTo({ top, behavior });
      setActive(id);
      writeHash(id);
    },
    [writeHash],
  );

  // Scroll-spy: pick the topmost section that's intersecting the band
  // (between the bottom of the chip strip and 50% down the viewport).
  useEffect(() => {
    if (!ready) return undefined;
    const targets = sections
      .map((s) => document.getElementById(s.id))
      .filter(Boolean);
    if (targets.length === 0) return undefined;

    function recomputeActive() {
      for (const s of sections) {
        if (visibleRef.current.has(s.id)) {
          setActive((prev) => {
            if (prev === s.id) return prev;
            writeHash(s.id);
            return s.id;
          });
          return;
        }
      }
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) visibleRef.current.add(entry.target.id);
          else visibleRef.current.delete(entry.target.id);
        });
        recomputeActive();
      },
      {
        rootMargin: `-${OFFSET}px 0px -50% 0px`,
        threshold: 0,
      },
    );
    targets.forEach((el) => observer.observe(el));
    return () => observer.disconnect();
  }, [sections, ready, writeHash]);

  // Deep-link on mount once the data is ready (so section offsets are stable).
  useEffect(() => {
    if (!ready || typeof window === "undefined") return;
    const id = window.location.hash.replace(/^#/, "");
    if (!id) return;
    if (!sections.some((s) => s.id === id)) return; // invalid → ignore
    const el = document.getElementById(id);
    if (!el) return;
    const top = el.getBoundingClientRect().top + window.scrollY - OFFSET;
    const behavior = prefersReducedMotion() ? "auto" : "smooth";
    window.scrollTo({ top, behavior });
    setActive(id);
    // No replaceState here — the URL already has the hash.
  }, [ready, sections]);

  const focusChip = useCallback((idx) => {
    const list = chipRefs.current.filter(Boolean);
    if (list.length === 0) return;
    const next = (idx + list.length) % list.length;
    list[next]?.focus();
  }, []);

  const onKeyDown = useCallback(
    (e, idx) => {
      switch (e.key) {
        case "ArrowRight":
          e.preventDefault();
          focusChip(idx + 1);
          break;
        case "ArrowLeft":
          e.preventDefault();
          focusChip(idx - 1);
          break;
        case "Home":
          e.preventDefault();
          focusChip(0);
          break;
        case "End":
          e.preventDefault();
          focusChip(sections.length - 1);
          break;
        case "Enter":
        case " ":
          e.preventDefault();
          scrollToSection(sections[idx].id);
          break;
        default:
          break;
      }
    },
    [focusChip, scrollToSection, sections],
  );

  return (
    <div
      role="tablist"
      aria-label="Exam detail sections"
      data-testid="exam-detail-anchor-nav"
      className="sticky top-16 z-20 -mx-1 mb-4 flex gap-1 overflow-x-auto scrollbar-none px-1 py-2 bg-[#FBF6EF]/95 backdrop-blur border-b border-border"
    >
      {sections.map((s, i) => {
        const isActive = active === s.id;
        return (
          <button
            key={s.id}
            ref={(el) => {
              chipRefs.current[i] = el;
            }}
            type="button"
            role="tab"
            aria-selected={isActive}
            aria-controls={s.id}
            tabIndex={isActive ? 0 : -1}
            data-testid={`anchor-chip-${s.id}`}
            onClick={() => scrollToSection(s.id)}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={[
              "whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF6EF]",
              isActive
                ? "border-clay-500 bg-clay-500 text-white"
                : "border-border bg-white/70 text-clay-800 hover:bg-clay-100",
            ].join(" ")}
          >
            {s.label}
          </button>
        );
      })}
    </div>
  );
}

export { OFFSET as ANCHOR_NAV_OFFSET, prefersReducedMotion };
