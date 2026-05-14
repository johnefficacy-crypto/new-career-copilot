import React from "react";
import { HelpCircle } from "lucide-react";

// One-line "Why we ask" rationale. Sourced from the backend's question
// help_text or a safe generated fallback — never an internal persona label.
export default function WhyWeAsk({ reason }) {
  if (!reason) return null;
  return (
    <p
      data-testid="why-we-ask"
      className="mt-2 flex items-start gap-1.5 text-xs text-muted-foreground"
    >
      <HelpCircle className="h-3.5 w-3.5 mt-0.5 shrink-0 text-clay-400" aria-hidden="true" />
      <span>
        <span className="font-medium text-clay-700">Why we ask:</span> {reason}
      </span>
    </p>
  );
}
