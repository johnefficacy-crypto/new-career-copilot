import React from "react";
import { Eyebrow, StudyCard } from "../../../shared/ui/studyos";

// Engine trace styled after the prototype: a left rail describing the engine
// and a list of trace steps with prototype `.sdot` status indicators.
const SDOT = {
  available: "sdot-live",
  missing: "sdot-preview",
  not_connected: "sdot-not",
};
const STATUS_LABEL = {
  available: "Available",
  missing: "Not available",
  not_connected: "Not connected",
};

export default function EngineTrace({ steps }) {
  const items = Array.isArray(steps) ? steps : [];
  if (!items.length) return null;
  return (
    <StudyCard padded={false} data-testid="engine-trace">
      <div className="grid md:grid-cols-[220px_1fr]">
        <div className="p-6 md:border-r border-[#EFE2C9]">
          <Eyebrow>Engine trace</Eyebrow>
          <div className="font-heading text-[22px] mt-1.5 leading-[1.1]">
            Why today
            <br />
            looks like this.
          </div>
          <p className="text-[12px] text-clay-700 mt-3 leading-relaxed">
            Study OS composes the plan from your signals, exam intelligence and
            recent progress — every step is auditable.
          </p>
        </div>
        <ol className="p-6 space-y-2.5">
          {items.map((step, i) => (
            <li
              key={`${step.label}-${i}`}
              className="flex items-start gap-3 text-[13px]"
              data-testid={`engine-trace-step-${i}`}
            >
              <span
                className={`sdot ${SDOT[step.status] || "sdot-preview"} mt-1.5`}
                aria-hidden="true"
              />
              <div className="flex-1">
                <div className="font-medium text-clay-900">{step.label}</div>
                {step.details ? (
                  <div className="text-[12px] text-clay-700">{step.details}</div>
                ) : null}
              </div>
              <span className="num-mono text-[10px] text-clay-700 mt-1 shrink-0">
                {STATUS_LABEL[step.status] || step.status}
              </span>
            </li>
          ))}
        </ol>
      </div>
    </StudyCard>
  );
}
