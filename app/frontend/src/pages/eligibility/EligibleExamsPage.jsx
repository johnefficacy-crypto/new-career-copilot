import React from "react";
import { Link } from "react-router-dom";
import EligibleExamsCard from "../../features/exam-eligibility/EligibleExamsCard";

// PR3 reorg: per the page contract, this page reuses EligibleExamsCard
// (do not duplicate) for the "Eligible for you" pinned view. The
// EligibleExamsCard already owns its own loading / error / empty
// states and the conditional vs. eligible split, so the page just
// frames it with a header and a pointer to recruitments.
//
// Deferred (Backend gap): the spec asks for chips
//   All / Eligible / Conditional / Not yet / Saved, plus level /
//   category / frequency filters and a full exam-name search across
//   the catalogue. There is no aspirant-facing exam-catalogue
//   endpoint today (only the eligibility summary which powers
//   EligibleExamsCard). Building chips/search/filters against an
//   invented payload would violate the "do not fake data" rule, so
//   they're deferred to a follow-up PR once a /api/exams/catalogue
//   (or equivalent) lands. FLAGGED in PR description.
export default function EligibleExamsPage() {
  return (
    <section data-testid="eligibility-exams-page" aria-labelledby="eligibility-exams-heading">
      <div className="flex items-end justify-between flex-wrap gap-3 mb-4">
        <div>
          <h2
            id="eligibility-exams-heading"
            className="font-heading text-2xl font-semibold tracking-tight"
          >
            Exams you can target
          </h2>
          <p className="text-sm text-muted-foreground mt-1">
            Baseline rules evaluated against your saved profile. Conditional rows tell you
            exactly which fields to complete before they convert.
          </p>
        </div>
        <Link
          to="/app/eligibility/recruitments"
          className="text-[12px] font-semibold link-under text-clay-700"
        >
          See open recruitments →
        </Link>
      </div>

      <EligibleExamsCard variant="panel" />
    </section>
  );
}
