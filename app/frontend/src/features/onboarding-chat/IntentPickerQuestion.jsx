import React from "react";
import { Compass } from "lucide-react";

// The cold-path opener: "What brought you here today?". Tap-first, one
// option per row, large thumb-friendly targets. This is the only question
// the cold path is guaranteed to ask first; everything after it comes
// from the existing persona question infrastructure.
export default function IntentPickerQuestion({ question, value, onChange, disabled }) {
  const options = Array.isArray(question?.options) ? question.options : [];
  return (
    <div data-testid="intent-picker">
      <div className="flex items-center gap-2 text-clay-600 mb-1">
        <Compass className="h-4 w-4" aria-hidden="true" />
        <span className="text-[11px] uppercase tracking-widest font-medium">
          Starting point
        </span>
      </div>
      <h2 className="font-heading font-semibold text-lg sm:text-xl text-clay-900">
        {question?.question_text || "What brought you here today?"}
      </h2>
      <div className="mt-4 flex flex-col gap-2.5" role="radiogroup" aria-label="Choose your intent">
        {options.map((opt) => {
          const selected = value === opt.value;
          return (
            <button
              key={opt.value}
              type="button"
              role="radio"
              aria-checked={selected}
              disabled={disabled}
              onClick={() => onChange(opt.value)}
              data-testid={`intent-option-${opt.value}`}
              className={`text-left rounded-2xl border px-4 py-3.5 text-sm font-medium transition-colors duration-150 ${
                selected
                  ? "border-clay-500 bg-clay-50 text-clay-900"
                  : "border-clay-200 hover:bg-clay-50 text-clay-800"
              } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
            >
              {opt.label}
            </button>
          );
        })}
      </div>
    </div>
  );
}
