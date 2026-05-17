import React from "react";
import { ArrowRight } from "lucide-react";
import { Link } from "react-router-dom";
import { Eyebrow } from "../../../shared/ui/studyos";

const ACTION_TO_LINK = {
  study_task: null, // intra-page scroll; see scrollToTodayTasks fallback below
  progressive_question: null, // intra-page scroll; see scrollToTodayTasks fallback below
  focus_session: "/app/study/focus",
  mock_review: "/app/study/mocks",
  weekly_review: "/app/study/review",
  study_plan: "/app/study-plan",
};

// Default action when no `onPrimary` is wired: scroll the today-tasks card
// into view if it's mounted on this page. Used to be a silent no-op which
// produced the dead-button class that the audit flagged.
function scrollToTodayTasks() {
  if (typeof document === "undefined") return;
  const target = document.querySelector('[data-testid="today-tasks"]');
  if (target && typeof target.scrollIntoView === "function") {
    target.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

// Mirrors the prototype's dark "one decision now" card.
export default function NextBestActionCard({ action, onPrimary }) {
  if (!action) return null;
  const link = ACTION_TO_LINK[action.action_type] || null;
  const handlePrimary = onPrimary || scrollToTodayTasks;

  const Body = (
    <div className="px-7 py-6 flex items-start gap-5">
      <div className="shrink-0 mt-1">
        <div className="w-12 h-12 rounded-2xl bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center">
          <ArrowRight className="h-5 w-5 text-[#F3EADB]" aria-hidden="true" />
        </div>
      </div>
      <div className="flex-1 min-w-0">
        <Eyebrow dark>Next best action · one decision now</Eyebrow>
        <h2 className="font-heading text-[24px] text-[#F3EADB] mt-1 leading-tight">
          {action.title}
        </h2>
        {action.description ? (
          <p className="text-[13px] text-[#D6BC93] mt-2 max-w-[64ch]">{action.description}</p>
        ) : null}
        {action.reason ? (
          <p className="text-[12px] text-[#A68057] mt-2 italic">{action.reason}</p>
        ) : null}
      </div>
      <div className="shrink-0 hidden sm:flex items-center">
        <span className="px-4 py-2 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold text-[13px] inline-flex items-center gap-1.5">
          {action.cta || "Open"} <ArrowRight className="h-3.5 w-3.5" aria-hidden="true" />
        </span>
      </div>
    </div>
  );

  const cardClass =
    "soft-card grain relative overflow-hidden rounded-[18px] block w-full text-left !bg-[#2E2218] !border-[#2E2218] hover:brightness-110 transition";

  if (link) {
    return (
      <Link to={link} className={cardClass} data-testid="next-best-action">
        {Body}
      </Link>
    );
  }
  return (
    <button type="button" onClick={handlePrimary} className={cardClass} data-testid="next-best-action">
      {Body}
    </button>
  );
}
