import React, { useMemo } from "react";
import { Link } from "react-router-dom";
import TodaysActions, { buildTodayActions } from "../features/dashboard/components/TodaysActions";
import useDashboardData from "../features/dashboard/hooks/useDashboardData";
import { rankRecruitments } from "../lib/recruitmentRanking";
import { useAuth } from "../lib/authContext";
import { Eyebrow, StudyCard } from "../shared/ui/studyos";
import TodayProfileBanner from "../features/profile/components/TodayProfileBanner";
import HowItWorksHeaderButton from "../shared/components/HowItWorksHeaderButton";

// PR3 reorg: Today is now scoped to what an aspirant needs to act on
// today — one primary action, up to three quick actions, an
// applications snapshot, and (eventually) a profile banner + unseen
// policy updates. Study task lists, mission-control metrics, the
// truth panel, eligibility grid, persona questions, and every
// "why recommendation" prototype panel moved to Study Home / behind
// the "How it works" drawer in later PRs.
//
// Deferred to subsequent PRs:
//   - profile banner thresholds  (PR5)
//   - unseen policy updates feed (no current backend endpoint; FLAG)
export default function Today() {
  const auth = useAuth();
  const dash = useDashboardData();

  const dashApps = useMemo(() => dash.apps || [], [dash.apps]);
  const appByRecruitmentId = useMemo(
    () => Object.fromEntries(dashApps.map((a) => [a.recruitment_id, a])),
    [dashApps],
  );
  const dashTopMatches = useMemo(
    () =>
      rankRecruitments(dash.recruitments?.items || [], auth.user, {
        appByRecruitmentId,
      }).slice(0, 6),
    [dash.recruitments, auth.user, appByRecruitmentId],
  );
  const dashInProgressForms = dashApps.filter((a) => a.status === "in_progress").length;
  const dashSubmittedCount = dashApps.filter((a) => !!a.submitted_at).length;
  const dashPendingDocs = dashApps.reduce(
    (n, a) => n + (Array.isArray(a.documents_pending) ? a.documents_pending.length : 0),
    0,
  );

  const todayActions = buildTodayActions({
    topMatches: dashTopMatches,
    pendingDocs: dashPendingDocs,
    inProgressForms: dashInProgressForms,
  });
  const heroAction = todayActions[0];

  return (
    <div className="space-y-6" data-testid="today-page">
      <div className="flex justify-end">
        <HowItWorksHeaderButton
          defaultTopic="today_overview"
          pageName="Today"
        />
      </div>
      <TodayProfileBanner />

      {heroAction ? (
        <StudyCard data-testid="hero-next-action">
          <div className="flex items-start justify-between gap-6 flex-wrap">
            <div>
              <Eyebrow>Next action</Eyebrow>
              <h1 className="font-heading text-[28px] leading-[1.1] mt-2">
                {heroAction.label}
              </h1>
              <p className="text-[13px] text-clay-700 mt-1.5">
                Tap to start. The rest of today's actions are below.
              </p>
            </div>
            <div className="flex items-center gap-3">
              <Link
                to={heroAction.to}
                className="btn btn-primary"
                data-testid="hero-next-action-cta"
              >
                Start now
              </Link>
              <Link
                to="/app/eligibility/tracker"
                className="text-[12px] font-semibold link-under text-clay-700"
                data-testid="hero-view-all-actions"
              >
                View all today's actions →
              </Link>
            </div>
          </div>
        </StudyCard>
      ) : null}

      <TodaysActions
        topMatches={dashTopMatches}
        pendingDocs={dashPendingDocs}
        inProgressForms={dashInProgressForms}
        take={3}
      />

      <ApplicationsSnapshot
        inProgress={dashInProgressForms}
        submitted={dashSubmittedCount}
        pendingDocs={dashPendingDocs}
      />
    </div>
  );
}

function ApplicationsSnapshot({ inProgress, submitted, pendingDocs }) {
  const total = inProgress + submitted + pendingDocs;
  if (total === 0) {
    return (
      <div className="soft-card rounded-2xl p-5" data-testid="apps-snapshot-empty">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Applications
        </div>
        <p className="text-sm text-clay-700 mt-2">
          No active applications yet.{" "}
          <Link to="/app/eligibility/exams" className="link-under">
            Browse eligible recruitments
          </Link>
          .
        </p>
      </div>
    );
  }
  return (
    <div className="soft-card rounded-2xl p-5" data-testid="apps-snapshot">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          Applications
        </div>
        <Link
          to="/app/eligibility/tracker"
          className="text-[12px] font-semibold link-under text-clay-700"
        >
          Open tracker →
        </Link>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-3">
        <SnapshotStat label="In progress" value={inProgress} />
        <SnapshotStat label="Submitted" value={submitted} />
        <SnapshotStat label="Docs pending" value={pendingDocs} />
      </div>
    </div>
  );
}

function SnapshotStat({ label, value }) {
  return (
    <div className="rounded-xl border border-border bg-white/70 px-4 py-3">
      <div className="num-mono text-[22px] font-semibold leading-tight">{value}</div>
      <div className="text-[11px] uppercase tracking-[0.18em] text-muted-foreground mt-1">
        {label}
      </div>
    </div>
  );
}
