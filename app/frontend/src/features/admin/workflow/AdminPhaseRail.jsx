import React from "react";

// AdminPhaseRail — the top-of-page mode switcher between
// "Setup & Run" and "Review & Publish" (plan §7 mode split).
// Hides every action that doesn't belong to the active mode by
// communicating the active phase to its parent.
export default function AdminPhaseRail({ phase, onChange }) {
  return (
    <nav
      className="inline-flex rounded-2xl border border-gray-200 bg-white p-1 text-xs shadow-sm"
      aria-label="Operations console phase"
    >
      <PhaseButton
        active={phase === "setup_run"}
        onClick={() => onChange("setup_run")}
        label="Setup & Run"
      />
      <PhaseButton
        active={phase === "review_publish"}
        onClick={() => onChange("review_publish")}
        label="Review & Publish"
      />
    </nav>
  );
}

function PhaseButton({ active, onClick, label }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        "rounded-xl px-3 py-1.5 font-medium transition " +
        (active
          ? "bg-gray-900 text-white shadow"
          : "text-gray-600 hover:text-gray-900")
      }
    >
      {label}
    </button>
  );
}
