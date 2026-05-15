import React from "react";
import SubjectCard from "./SubjectCard";

// Stable accent palette — ported from the prototype's subject colours.
const SUBJECT_COLORS = [
  "#54794E",
  "#A68057",
  "#524864",
  "#BE9C6B",
  "#94B28A",
  "#8F86A1",
  "#6C5038",
];

// SubjectCards — grid of subject progress tiles. Pass `onSelect` to make
// each tile a button that surfaces the selected subject upwards (used for
// filtering the topic tree).
export default function SubjectCards({ items, onSelect, activeId }) {
  const rows = Array.isArray(items) ? items : [];
  if (!rows.length) {
    return (
      <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-5 text-sm text-clay-700">
        No subject progress yet — set up a study plan to start tracking.
      </div>
    );
  }
  return (
    <div className="grid sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3">
      {rows.map((s, i) => {
        const color = SUBJECT_COLORS[i % SUBJECT_COLORS.length];
        const isActive = activeId && (s.subject_id === activeId || s.subject === activeId);
        return (
          <div
            key={s.subject_id || s.subject}
            className={isActive ? "ring-2 ring-[#2E2218] rounded-xl" : ""}
          >
            <SubjectCard s={s} color={color} onSelect={onSelect} />
          </div>
        );
      })}
    </div>
  );
}
