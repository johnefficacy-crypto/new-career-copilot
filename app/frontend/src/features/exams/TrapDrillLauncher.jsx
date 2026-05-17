import React, { useState } from "react";
import { Target } from "lucide-react";

import TrapDrillModal from "./TrapDrillModal";

/**
 * Small CTA card that opens the trap-awareness drill modal. Kept as a
 * standalone surface so the Exam Intelligence tab composes it next to
 * the OptionInsightsCard without bundling concerns into one component.
 */
export default function TrapDrillLauncher({ examSlug, topicId, size = 5 }) {
  const [open, setOpen] = useState(false);
  if (!examSlug) return null;
  return (
    <>
      <section
        className="soft-card rounded-2xl p-5 flex flex-col gap-3 md:flex-row md:items-center md:justify-between"
        data-testid="trap-drill-launcher"
        aria-labelledby="trap-drill-launcher-title"
      >
        <div className="flex items-start gap-3">
          <Target
            className="h-5 w-5 text-clay-600 mt-1 shrink-0"
            aria-hidden="true"
          />
          <div>
            <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
              Practice · verified PYQs
            </div>
            <h3
              id="trap-drill-launcher-title"
              className="font-heading text-lg font-semibold mt-0.5"
            >
              Run a {size}-question trap-awareness drill
            </h3>
            <p className="text-xs text-muted-foreground mt-1 max-w-md">
              Quick MCQ from verified past papers, weighted toward questions
              with known trap patterns. Each answer reveals the trap insight
              before you move on.
            </p>
          </div>
        </div>
        <div className="flex shrink-0">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="btn btn-primary"
            data-testid="trap-drill-start"
          >
            Start drill
          </button>
        </div>
      </section>
      <TrapDrillModal
        open={open}
        onClose={() => setOpen(false)}
        examSlug={examSlug}
        topicId={topicId}
        size={size}
      />
    </>
  );
}
