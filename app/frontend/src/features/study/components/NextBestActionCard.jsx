import React from "react";
import { ArrowRight, Zap } from "lucide-react";
import { Link } from "react-router-dom";

const ACTION_TO_LINK = {
  study_task: null, // stays on Today.jsx; consumer can wire scroll-to-task
  progressive_question: null, // stays on Today.jsx (card lives here)
  focus_session: "/app/study/focus",
  mock_review: "/app/study/mocks",
  weekly_review: "/app/study/review",
  study_plan: "/app/study-plan",
};

export default function NextBestActionCard({ action, onPrimary }) {
  if (!action) return null;
  const link = ACTION_TO_LINK[action.action_type] || null;

  const Body = (
    <div className="flex items-start gap-3">
      <Zap className="h-5 w-5 text-clay-500 mt-0.5" aria-hidden="true" />
      <div className="flex-1">
        <div className="text-[10px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Next best action
        </div>
        <div className="font-heading font-semibold text-base mt-1">
          {action.title}
        </div>
        {action.description ? (
          <p className="text-sm text-muted-foreground mt-1">
            {action.description}
          </p>
        ) : null}
        {action.reason ? (
          <p className="text-xs text-muted-foreground mt-2 italic">
            {action.reason}
          </p>
        ) : null}
      </div>
      <ArrowRight className="h-4 w-4 text-clay-500 mt-1" aria-hidden="true" />
    </div>
  );

  if (link) {
    return (
      <Link
        to={link}
        className="soft-card rounded-2xl p-5 block hover:bg-clay-50 transition"
        data-testid="next-best-action"
      >
        {Body}
      </Link>
    );
  }
  return (
    <button
      type="button"
      onClick={onPrimary}
      className="soft-card rounded-2xl p-5 w-full text-left hover:bg-clay-50 transition"
      data-testid="next-best-action"
    >
      {Body}
    </button>
  );
}
