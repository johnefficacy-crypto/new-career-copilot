import React, { useCallback, useRef } from "react";
import { NavLink, useLocation } from "react-router-dom";

// Accessible tablist used by EligibilityShell and StudyShell.
// - role="tablist" with aria-selected on the active tab
// - Left/Right (and Home/End) arrow keys move focus + activate
// - Horizontal chip strip; scrolls on overflow so mobile doesn't need a nested hamburger
export default function ShellSubNav({ tabs, ariaLabel = "Section navigation", testId }) {
  const { pathname } = useLocation();
  const refs = useRef([]);

  const isActive = useCallback(
    (tab) => {
      if (tab.end) return pathname === tab.to;
      return pathname === tab.to || pathname.startsWith(`${tab.to}/`);
    },
    [pathname],
  );

  const focusTab = (idx) => {
    const list = refs.current.filter(Boolean);
    if (!list.length) return;
    const next = (idx + list.length) % list.length;
    list[next]?.focus();
  };

  const onKeyDown = (e, index) => {
    switch (e.key) {
      case "ArrowRight":
        e.preventDefault();
        focusTab(index + 1);
        break;
      case "ArrowLeft":
        e.preventDefault();
        focusTab(index - 1);
        break;
      case "Home":
        e.preventDefault();
        focusTab(0);
        break;
      case "End":
        e.preventDefault();
        focusTab(refs.current.length - 1);
        break;
      default:
        break;
    }
  };

  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      data-testid={testId}
      className="-mx-1 mb-4 flex gap-1 overflow-x-auto scrollbar-none px-1 py-1"
    >
      {tabs.map((tab, i) => {
        const active = isActive(tab);
        return (
          <NavLink
            key={tab.to}
            to={tab.to}
            end={tab.end}
            ref={(el) => {
              refs.current[i] = el;
            }}
            role="tab"
            aria-selected={active}
            tabIndex={active ? 0 : -1}
            data-testid={tab.testId}
            onKeyDown={(e) => onKeyDown(e, i)}
            className={[
              "whitespace-nowrap rounded-full border px-4 py-1.5 text-sm font-medium transition",
              "focus:outline-none focus-visible:ring-2 focus-visible:ring-clay-500 focus-visible:ring-offset-2 focus-visible:ring-offset-[#FBF6EF]",
              active
                ? "border-clay-500 bg-clay-500 text-white"
                : "border-border bg-white/70 text-clay-800 hover:bg-clay-100",
            ].join(" ")}
          >
            {tab.label}
          </NavLink>
        );
      })}
    </div>
  );
}
