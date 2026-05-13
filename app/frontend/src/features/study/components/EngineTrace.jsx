import React from "react";
import { Cpu } from "lucide-react";

const STATUS_DOT = {
  available: "bg-sage-500",
  missing: "bg-clay-300",
  not_connected: "bg-dusk-300",
};

const STATUS_LABEL = {
  available: "Available",
  missing: "Not available",
  not_connected: "Not connected yet",
};

export default function EngineTrace({ steps }) {
  const items = Array.isArray(steps) ? steps : [];
  if (!items.length) return null;
  return (
    <section
      className="soft-card rounded-2xl p-5"
      aria-labelledby="engine-trace-heading"
      data-testid="engine-trace"
    >
      <div className="flex items-center gap-2">
        <Cpu className="h-4 w-4 text-clay-500" aria-hidden="true" />
        <h2
          id="engine-trace-heading"
          className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold"
        >
          Engine trace
        </h2>
      </div>
      <ol className="mt-3 space-y-2">
        {items.map((step, i) => (
          <li
            key={`${step.label}-${i}`}
            className="flex items-start gap-3 text-sm"
            data-testid={`engine-trace-step-${i}`}
          >
            <span
              className={`mt-1 inline-block h-2 w-2 rounded-full ${
                STATUS_DOT[step.status] || "bg-clay-200"
              }`}
              aria-hidden="true"
            />
            <div className="flex-1">
              <div className="font-medium text-clay-800">{step.label}</div>
              <div className="text-xs text-muted-foreground">
                {step.details}
              </div>
            </div>
            <span className="pill text-[10px] uppercase tracking-wider text-muted-foreground">
              {STATUS_LABEL[step.status] || step.status}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
