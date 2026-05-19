import React from "react";
import { MemoryRouter } from "react-router-dom";
import { act, render, screen, fireEvent } from "@testing-library/react";

import ExamDetailAnchorNav, { ANCHOR_NAV_OFFSET } from "./ExamDetailAnchorNav";

const SECTIONS = [
  { id: "about", label: "About" },
  { id: "eligibility", label: "Eligibility" },
  { id: "competition", label: "Competition" },
];

function renderNav({ initialPath = "/app/eligibility/exams/foo" } = {}) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <ExamDetailAnchorNav sections={SECTIONS} ready={true} />
      {SECTIONS.map((s) => (
        <section key={s.id} id={s.id}>
          {s.label} body
        </section>
      ))}
    </MemoryRouter>,
  );
}

let observerInstances = [];

beforeEach(() => {
  observerInstances = [];
  // Reset hash so a replaceState from a previous test doesn't leak into
  // the next test's deep-link useEffect.
  window.history.replaceState(null, "", "/");
  global.IntersectionObserver = class {
    constructor(cb) {
      this.cb = cb;
      this.observed = new Set();
      observerInstances.push(this);
    }
    observe(el) {
      this.observed.add(el);
    }
    unobserve(el) {
      this.observed.delete(el);
    }
    disconnect() {
      this.observed.clear();
    }
    // Test-only: emit a synthetic intersection.
    __emit(entries) {
      this.cb(entries);
    }
  };
  // jsdom doesn't implement scrollTo; stub it.
  window.scrollTo = jest.fn();
  // Default: not reduced-motion.
  window.matchMedia =
    window.matchMedia ||
    jest.fn().mockImplementation((q) => ({
      matches: false,
      media: q,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
});

describe("ExamDetailAnchorNav (PR11)", () => {
  test("renders one chip per section with role=tab and aria-selected on first by default", () => {
    renderNav();
    SECTIONS.forEach((s) => {
      expect(screen.getByTestId(`anchor-chip-${s.id}`)).toBeTruthy();
    });
    expect(
      screen.getByTestId("anchor-chip-about").getAttribute("aria-selected"),
    ).toBe("true");
    expect(
      screen.getByTestId("anchor-chip-eligibility").getAttribute("aria-selected"),
    ).toBe("false");
  });

  test("clicking a chip scrolls (with smooth behavior) and updates aria-selected", () => {
    renderNav();
    const chip = screen.getByTestId("anchor-chip-competition");
    fireEvent.click(chip);
    expect(window.scrollTo).toHaveBeenCalled();
    const args = window.scrollTo.mock.calls[0][0];
    expect(args.behavior).toBe("smooth");
    expect(typeof args.top).toBe("number");
    expect(chip.getAttribute("aria-selected")).toBe("true");
    expect(
      screen.getByTestId("anchor-chip-about").getAttribute("aria-selected"),
    ).toBe("false");
  });

  test("click target subtracts the sticky offset", () => {
    renderNav();
    // jsdom returns 0 for getBoundingClientRect().top and window.scrollY,
    // so the resulting scroll target should be exactly -OFFSET. We assert
    // the offset constant rather than the raw math to lock the contract
    // even if the section moves around.
    fireEvent.click(screen.getByTestId("anchor-chip-eligibility"));
    const args = window.scrollTo.mock.calls.pop()[0];
    expect(args.top).toBe(-ANCHOR_NAV_OFFSET);
  });

  test("ArrowRight moves focus to the next chip (manual activation — no scroll)", () => {
    renderNav();
    const first = screen.getByTestId("anchor-chip-about");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowRight" });
    expect(document.activeElement).toBe(screen.getByTestId("anchor-chip-eligibility"));
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  test("ArrowLeft wraps from first to last", () => {
    renderNav();
    const first = screen.getByTestId("anchor-chip-about");
    first.focus();
    fireEvent.keyDown(first, { key: "ArrowLeft" });
    expect(document.activeElement).toBe(screen.getByTestId("anchor-chip-competition"));
  });

  test("Home / End jump to first / last", () => {
    renderNav();
    const middle = screen.getByTestId("anchor-chip-eligibility");
    middle.focus();
    fireEvent.keyDown(middle, { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("anchor-chip-competition"));
    const last = screen.getByTestId("anchor-chip-competition");
    fireEvent.keyDown(last, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByTestId("anchor-chip-about"));
  });

  test("Enter on a focused chip scrolls to it", () => {
    renderNav();
    const chip = screen.getByTestId("anchor-chip-competition");
    chip.focus();
    fireEvent.keyDown(chip, { key: "Enter" });
    expect(window.scrollTo).toHaveBeenCalled();
    expect(chip.getAttribute("aria-selected")).toBe("true");
  });

  test("IntersectionObserver-driven scroll-spy updates active chip and URL hash", () => {
    renderNav();
    expect(observerInstances).toHaveLength(1);
    const obs = observerInstances[0];
    const eligEl = document.getElementById("eligibility");
    const compEl = document.getElementById("competition");

    // Simulate eligibility becoming the topmost visible.
    act(() => {
      obs.__emit([{ target: eligEl, isIntersecting: true }]);
    });
    expect(
      screen.getByTestId("anchor-chip-eligibility").getAttribute("aria-selected"),
    ).toBe("true");
    expect(window.location.hash).toBe("#eligibility");

    // Scroll further: competition becomes visible too. Earlier section
    // is still in the band → we keep the topmost (eligibility).
    act(() => {
      obs.__emit([{ target: compEl, isIntersecting: true }]);
    });
    expect(
      screen.getByTestId("anchor-chip-eligibility").getAttribute("aria-selected"),
    ).toBe("true");

    // Eligibility leaves the band → competition becomes active.
    act(() => {
      obs.__emit([{ target: eligEl, isIntersecting: false }]);
    });
    expect(
      screen.getByTestId("anchor-chip-competition").getAttribute("aria-selected"),
    ).toBe("true");
    expect(window.location.hash).toBe("#competition");
  });

  test("deep-link hash on mount scrolls to the requested section when ready", () => {
    window.history.replaceState(null, "", "/app/eligibility/exams/foo#competition");
    renderNav({ initialPath: "/app/eligibility/exams/foo#competition" });
    expect(window.scrollTo).toHaveBeenCalled();
  });

  test("invalid hash on mount does not scroll", () => {
    window.history.replaceState(null, "", "/app/eligibility/exams/foo#bogus");
    renderNav({ initialPath: "/app/eligibility/exams/foo#bogus" });
    expect(window.scrollTo).not.toHaveBeenCalled();
  });

  test("respects prefers-reduced-motion: uses behavior=auto for clicks", () => {
    window.matchMedia = jest.fn().mockImplementation((q) => ({
      matches: true,
      media: q,
      addListener: jest.fn(),
      removeListener: jest.fn(),
    }));
    renderNav();
    fireEvent.click(screen.getByTestId("anchor-chip-eligibility"));
    const args = window.scrollTo.mock.calls[0][0];
    expect(args.behavior).toBe("auto");
  });

  test("uses replaceState (not pushState) so the back stack stays clean", () => {
    renderNav();
    const before = window.history.length;
    fireEvent.click(screen.getByTestId("anchor-chip-competition"));
    expect(window.history.length).toBe(before);
  });
});
