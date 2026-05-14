import React, { useCallback, useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { api } from "../../lib/api";
import ExamIntelligenceOverviewCards from "../../features/admin/exam-intelligence/ExamIntelligenceOverviewCards";
import ExamListTable from "../../features/admin/exam-intelligence/ExamListTable";
import ReviewQueueTable from "../../features/admin/exam-intelligence/ReviewQueueTable";
import TopicCoveragePreview from "../../features/admin/exam-intelligence/TopicCoveragePreview";
import CompetitionMetricsTable from "../../features/admin/exam-intelligence/CompetitionMetricsTable";
import PolicyUpdatesTable from "../../features/admin/exam-intelligence/PolicyUpdatesTable";
import PlanImpactPreview from "../../features/admin/exam-intelligence/PlanImpactPreview";
import { AdminSafetyBanner } from "../../shared/ui";
import { StatusDot } from "../../shared/ui/studyos";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "exams", label: "Exams" },
  { id: "review", label: "Review queue" },
  { id: "coverage", label: "Topic Coverage" },
  { id: "competition", label: "Competition Metrics" },
  { id: "policy", label: "Policy Updates" },
  { id: "impact", label: "Plan Impact" },
];

const COVERAGE_STATUSES = ["all", "draft", "pending_review", "reviewed", "locked", "rejected"];
const POLICY_STATUSES = ["all", "pending", "verified", "rejected", "needs_correction"];
const POLICY_SOURCE_TYPES = ["all", "official", "aggregator", "research", "opportunity", "unknown"];

const KINDS = [
  { value: "syllabus_topic_mention", label: "Syllabus mentions" },
  { value: "pyq_question_topic_tag", label: "PYQ topic tags" },
  { value: "pyq_question", label: "PYQ questions" },
];

const STATUSES = ["pending", "verified", "rejected", "needs_correction", "all"];

export default function AdminExamIntelligence() {
  const [tab, setTab] = useState("overview");

  const [overview, setOverview] = useState(null);
  const [overviewError, setOverviewError] = useState("");

  const [exams, setExams] = useState({ items: [], count: 0 });
  const [examsLoading, setExamsLoading] = useState(false);

  const [selectedExam, setSelectedExam] = useState(null);
  const [kind, setKind] = useState("syllabus_topic_mention");
  const [statusFilter, setStatusFilter] = useState("pending");
  const [items, setItems] = useState({ items: [], count: 0 });
  const [itemsLoading, setItemsLoading] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [busyRowId, setBusyRowId] = useState(null);

  const [coverage, setCoverage] = useState({ items: [], count: 0 });
  const [coverageLoading, setCoverageLoading] = useState(false);
  const [coverageStatus, setCoverageStatus] = useState("all");
  const [coverageBusyRowId, setCoverageBusyRowId] = useState(null);
  const [coverageError, setCoverageError] = useState("");

  const [competition, setCompetition] = useState({ items: [], count: 0 });
  const [competitionLoading, setCompetitionLoading] = useState(false);
  const [competitionStatus, setCompetitionStatus] = useState("all");
  const [competitionBusyRowId, setCompetitionBusyRowId] = useState(null);
  const [competitionError, setCompetitionError] = useState("");

  const [policy, setPolicy] = useState({ items: [], count: 0 });
  const [policyLoading, setPolicyLoading] = useState(false);
  const [policyStatus, setPolicyStatus] = useState("all");
  const [policySourceType, setPolicySourceType] = useState("all");
  const [policyBusyRowId, setPolicyBusyRowId] = useState(null);
  const [policyError, setPolicyError] = useState("");

  const loadOverview = useCallback(async () => {
    setOverviewError("");
    try {
      const d = await api.get("/api/admin/exam-intelligence/overview");
      setOverview(d);
    } catch (e) {
      setOverviewError(e?.message || "Could not load overview");
    }
  }, []);

  const loadExams = useCallback(async () => {
    setExamsLoading(true);
    try {
      const d = await api.get("/api/admin/exam-intelligence/exams?limit=200");
      setExams({ items: d?.items || [], count: d?.count || 0 });
    } catch {
      setExams({ items: [], count: 0 });
    } finally {
      setExamsLoading(false);
    }
  }, []);

  const loadItems = useCallback(async () => {
    if (!selectedExam) {
      setItems({ items: [], count: 0 });
      return;
    }
    setItemsLoading(true);
    setReviewError("");
    try {
      const params = new URLSearchParams({ kind, status: statusFilter, limit: "100" });
      const d = await api.get(
        `/api/admin/exam-intelligence/exams/${encodeURIComponent(selectedExam.id)}/items?${params.toString()}`,
      );
      setItems({ items: d?.items || [], count: d?.count || 0 });
    } catch (e) {
      setReviewError(e?.message || "Could not load items");
      setItems({ items: [], count: 0 });
    } finally {
      setItemsLoading(false);
    }
  }, [selectedExam, kind, statusFilter]);

  const loadCoverage = useCallback(async () => {
    setCoverageLoading(true);
    try {
      const params = new URLSearchParams({ status: coverageStatus, limit: "200" });
      const d = await api.get(
        `/api/admin/exam-intelligence/topic-coverage?${params.toString()}`,
      );
      setCoverage({ items: d?.items || [], count: d?.count || 0 });
    } catch {
      setCoverage({ items: [], count: 0 });
    } finally {
      setCoverageLoading(false);
    }
  }, [coverageStatus]);

  const loadCompetition = useCallback(async () => {
    setCompetitionLoading(true);
    try {
      const params = new URLSearchParams({ status: competitionStatus, limit: "200" });
      const d = await api.get(
        `/api/admin/exam-intelligence/competition-metrics?${params.toString()}`,
      );
      setCompetition({ items: d?.items || [], count: d?.count || 0 });
    } catch {
      setCompetition({ items: [], count: 0 });
    } finally {
      setCompetitionLoading(false);
    }
  }, [competitionStatus]);

  const loadPolicy = useCallback(async () => {
    setPolicyLoading(true);
    try {
      const params = new URLSearchParams({
        status: policyStatus,
        source_type: policySourceType,
        limit: "200",
      });
      const d = await api.get(
        `/api/admin/exam-intelligence/policy-updates?${params.toString()}`,
      );
      setPolicy({ items: d?.items || [], count: d?.count || 0 });
    } catch {
      setPolicy({ items: [], count: 0 });
    } finally {
      setPolicyLoading(false);
    }
  }, [policyStatus, policySourceType]);

  useEffect(() => {
    if (tab === "overview") loadOverview();
    if (tab === "exams") loadExams();
    if (tab === "review") loadItems();
    if (tab === "coverage") loadCoverage();
    if (tab === "competition") loadCompetition();
    if (tab === "policy") loadPolicy();
  }, [tab, loadOverview, loadExams, loadItems, loadCoverage, loadCompetition, loadPolicy]);

  function gotoReviewQueue(exam) {
    setSelectedExam(exam);
    setTab("review");
  }

  async function reviewRow(row, nextStatus) {
    if (!row || !row.id) return;
    setBusyRowId(row.id);
    setReviewError("");
    try {
      await api.patch(
        `/api/admin/exam-intelligence/items/${encodeURIComponent(kind)}/${encodeURIComponent(row.id)}/review`,
        { reviewer_status: nextStatus },
      );
      await loadItems();
    } catch (e) {
      setReviewError(e?.message || "Review failed");
    } finally {
      setBusyRowId(null);
    }
  }

  async function reviewCoverageRow(row, nextStatus) {
    if (!row || !row.id) return;
    setCoverageBusyRowId(row.id);
    setCoverageError("");
    try {
      await api.patch(
        `/api/admin/exam-intelligence/topic-coverage/${encodeURIComponent(row.id)}/review`,
        { reviewer_status: nextStatus },
      );
      await loadCoverage();
    } catch (e) {
      setCoverageError(e?.message || "Coverage review failed");
    } finally {
      setCoverageBusyRowId(null);
    }
  }

  async function reviewCompetitionRow(row, nextStatus) {
    if (!row || !row.id) return;
    setCompetitionBusyRowId(row.id);
    setCompetitionError("");
    try {
      await api.patch(
        `/api/admin/exam-intelligence/competition-metrics/${encodeURIComponent(row.id)}/review`,
        { reviewer_status: nextStatus },
      );
      await loadCompetition();
    } catch (e) {
      setCompetitionError(e?.message || "Competition review failed");
    } finally {
      setCompetitionBusyRowId(null);
    }
  }

  async function reviewPolicyRow(row, nextStatus) {
    if (!row || !row.id) return;
    setPolicyBusyRowId(row.id);
    setPolicyError("");
    try {
      await api.patch(
        `/api/admin/exam-intelligence/policy-updates/${encodeURIComponent(row.id)}/review`,
        { reviewer_status: nextStatus },
      );
      await loadPolicy();
    } catch (e) {
      setPolicyError(e?.message || "Policy update review failed");
    } finally {
      setPolicyBusyRowId(null);
    }
  }

  return (
    <div className="space-y-6" data-testid="admin-exam-intelligence-page">
      <header className="flex items-end justify-between gap-6 flex-wrap">
        <div>
          <div className="eyebrow inline-flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5" /> Exam intelligence · internal
          </div>
          <h1 className="font-heading text-[34px] leading-[1.05] mt-2">
            Exam Intelligence Review
          </h1>
          <p className="text-[14px] text-clay-700 mt-2 max-w-[72ch]">
            Move syllabus mentions and PYQ tags into <em>verified</em> only after checking an
            admin-reviewed source. Nothing on this page is generated by AI.
          </p>
        </div>
        <StatusDot state="live" label="Live · /api/admin/exam-intelligence" />
      </header>

      <AdminSafetyBanner
        title="Verified-only contract"
        testId="admin-exam-intel-safety"
      >
        User-facing exam intelligence (Study OS today view) reads only rows
        you've marked <span className="font-mono">verified</span> or{" "}
        <span className="font-mono">locked</span>. Pending and rejected rows
        never reach the aspirant. No AI is used to generate, interpret, or
        auto-verify these rows — your judgement is the source of truth.
      </AdminSafetyBanner>

      <nav
        className="flex flex-wrap gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB] w-fit"
        aria-label="Exam intelligence tabs"
      >
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`exam-intel-tab-${t.id}`}
            className={`px-3.5 py-1.5 rounded-full text-[12px] font-semibold transition ${
              tab === t.id
                ? "bg-[#2E2218] text-[#F3EADB]"
                : "text-clay-700 hover:bg-[#E7D6BA]"
            }`}
            aria-pressed={tab === t.id}
          >
            {t.label}
          </button>
        ))}
      </nav>

      {tab === "overview" ? (
        <section>
          {overviewError ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2 mb-3">
              {overviewError}
            </div>
          ) : null}
          <ExamIntelligenceOverviewCards overview={overview} />
        </section>
      ) : null}

      {tab === "exams" ? (
        <section className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">
              {exams.count} exam{exams.count === 1 ? "" : "s"} registered.
            </p>
            <button type="button" onClick={loadExams} className="btn btn-ghost text-xs">
              {examsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          <ExamListTable items={exams.items} onSelect={gotoReviewQueue} />
        </section>
      ) : null}

      {tab === "review" ? (
        <section className="space-y-3">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm flex-1 min-w-[200px]">
              <span className="text-muted-foreground text-xs">Exam</span>
              <select
                className="mt-1 w-full rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={selectedExam?.id || ""}
                onChange={(e) => {
                  const id = e.target.value;
                  const next = exams.items.find((x) => x.id === id) || null;
                  setSelectedExam(next);
                }}
              >
                <option value="">Choose an exam…</option>
                {exams.items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.name} ({e.slug})
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Kind</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={kind}
                onChange={(e) => setKind(e.target.value)}
              >
                {KINDS.map((k) => (
                  <option key={k.value} value={k.value}>
                    {k.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Status</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={loadItems} className="btn btn-ghost">
              {itemsLoading ? "Loading…" : "Refresh"}
            </button>
          </div>
          {!selectedExam ? (
            <div className="soft-card rounded-2xl p-5 text-sm text-muted-foreground">
              Pick an exam to view its review queue.
            </div>
          ) : null}
          {reviewError ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">
              {reviewError}
            </div>
          ) : null}
          {selectedExam ? (
            <ReviewQueueTable
              items={items.items}
              kind={kind}
              onReview={reviewRow}
              busyRowId={busyRowId}
            />
          ) : null}
        </section>
      ) : null}

      {tab === "coverage" ? (
        <section className="space-y-3" data-testid="exam-intel-coverage">
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Status</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={coverageStatus}
                onChange={(e) => setCoverageStatus(e.target.value)}
              >
                {["all", "draft", "pending_review", "reviewed", "locked", "rejected"].map(
                  (s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ),
                )}
              </select>
            </label>
            <button type="button" onClick={loadCoverage} className="btn btn-ghost">
              {coverageLoading ? "Loading…" : "Refresh"}
            </button>
            <p className="text-xs text-muted-foreground self-center">
              {coverage.count} row{coverage.count === 1 ? "" : "s"}
            </p>
          </div>
          {coverageError ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">
              {coverageError}
            </div>
          ) : null}
          <TopicCoveragePreview
            items={coverage.items}
            onReview={reviewCoverageRow}
            busyRowId={coverageBusyRowId}
          />
        </section>
      ) : null}

      {tab === "competition" ? (
        <section className="space-y-3" data-testid="exam-intel-competition">
          <p className="text-xs text-muted-foreground max-w-prose">
            Competition Intelligence keeps the plan realistic: vacancy,
            applicant ratio, cutoff and difficulty trends. Only{" "}
            <span className="font-mono">locked</span> rows are read by the
            Study OS planner.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Status</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={competitionStatus}
                onChange={(e) => setCompetitionStatus(e.target.value)}
              >
                {COVERAGE_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={loadCompetition} className="btn btn-ghost">
              {competitionLoading ? "Loading…" : "Refresh"}
            </button>
            <p className="text-xs text-muted-foreground self-center">
              {competition.count} row{competition.count === 1 ? "" : "s"}
            </p>
          </div>
          {competitionError ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">
              {competitionError}
            </div>
          ) : null}
          <CompetitionMetricsTable
            items={competition.items}
            onReview={reviewCompetitionRow}
            busyRowId={competitionBusyRowId}
          />
        </section>
      ) : null}

      {tab === "policy" ? (
        <section className="space-y-3" data-testid="exam-intel-policy">
          <p className="text-xs text-muted-foreground max-w-prose">
            Policy / Update Intelligence tracks official notification, cycle,
            syllabus and vacancy changes. Only verified{" "}
            <span className="font-mono">official</span> rows reach the
            planner — aggregator, research and opportunity rows are
            discovery-only and can never change a plan.
          </p>
          <div className="flex flex-wrap items-end gap-2">
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Status</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={policyStatus}
                onChange={(e) => setPolicyStatus(e.target.value)}
              >
                {POLICY_STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm">
              <span className="text-muted-foreground text-xs">Source type</span>
              <select
                className="mt-1 block rounded-xl border border-clay-200 px-3 py-2 text-sm"
                value={policySourceType}
                onChange={(e) => setPolicySourceType(e.target.value)}
              >
                {POLICY_SOURCE_TYPES.map((s) => (
                  <option key={s} value={s}>
                    {s}
                  </option>
                ))}
              </select>
            </label>
            <button type="button" onClick={loadPolicy} className="btn btn-ghost">
              {policyLoading ? "Loading…" : "Refresh"}
            </button>
            <p className="text-xs text-muted-foreground self-center">
              {policy.count} row{policy.count === 1 ? "" : "s"}
            </p>
          </div>
          {policyError ? (
            <div className="rounded-xl bg-dusk-50 text-dusk-800 text-xs px-3 py-2">
              {policyError}
            </div>
          ) : null}
          <PolicyUpdatesTable
            items={policy.items}
            onReview={reviewPolicyRow}
            busyRowId={policyBusyRowId}
          />
        </section>
      ) : null}

      {tab === "impact" ? (
        <section data-testid="exam-intel-impact">
          <PlanImpactPreview />
        </section>
      ) : null}
    </div>
  );
}
