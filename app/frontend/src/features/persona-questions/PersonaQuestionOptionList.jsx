import React from "react";

// Single-select option list. Multi-select uses a different shape, so we
// keep this component focused on the common case for PR2.
export default function PersonaQuestionOptionList({ options, value, onChange, disabled }) {
  if (!Array.isArray(options) || options.length === 0) return null;
  return (
    <div className="mt-3 flex flex-col gap-2" role="radiogroup">
      {options.map((opt) => {
        const selected = value === opt.value;
        return (
          <button
            type="button"
            key={opt.value}
            role="radio"
            aria-checked={selected}
            disabled={disabled}
            onClick={() => onChange(opt.value)}
            data-testid={`persona-question-option-${opt.value}`}
            className={`text-left rounded-xl border px-3 py-2 text-sm transition ${
              selected
                ? "border-clay-500 bg-clay-50"
                : "border-clay-200 hover:bg-clay-50"
            } ${disabled ? "opacity-60 cursor-not-allowed" : "cursor-pointer"}`}
          >
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
