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
import { Drawer, PageHeader, StatusDot } from "../../shared/ui/studyos";

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
  const [coverageEditRow, setCoverageEditRow] = useState(null);
  const [coverageEditForm, setCoverageEditForm] = useState({});
  const [coverageEditBusy, setCoverageEditBusy] = useState(false);

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

  function openCoverageEditor(row) {
    setCoverageEditRow(row);
    setCoverageEditForm({
      coverage_depth: row.coverage_depth || "",
      expected_difficulty: row.expected_difficulty || "",
      exam_priority_score: row.priority_score ?? "",
      is_high_yield: !!row.high_yield,
      confidence_score: row.confidence_score ?? "",
      source_basis: row.source_basis || "",
      reviewer_notes: row.reviewer_notes || "",
    });
  }

  async function saveCoverageEdit() {
    if (!coverageEditRow) return;
    setCoverageEditBusy(true);
    setCoverageError("");
    try {
      const payload = { ...coverageEditForm };
      if (payload.exam_priority_score === "") delete payload.exam_priority_score;
      if (payload.confidence_score === "") delete payload.confidence_score;
      if (payload.coverage_depth === "") delete payload.coverage_depth;
      if (payload.expected_difficulty === "") delete payload.expected_difficulty;
      if (payload.source_basis === "") delete payload.source_basis;
      if (payload.reviewer_notes === "") delete payload.reviewer_notes;
      if (payload.exam_priority_score !== undefined) {
        payload.exam_priority_score = Number(payload.exam_priority_score);
      }
      if (payload.confidence_score !== undefined) {
        payload.confidence_score = Number(payload.confidence_score);
      }
      await api.patch(
        `/api/admin/exam-intelligence/topic-coverage/${encodeURIComponent(coverageEditRow.id)}`,
        payload,
      );
      setCoverageEditRow(null);
      await loadCoverage();
    } catch (e) {
      setCoverageError(e?.message || "Edit failed");
    } finally {
      setCoverageEditBusy(false);
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
      <PageHeader
        eyebrow={
          <span className="inline-flex items-center gap-2">
            <GraduationCap className="h-3.5 w-3.5" /> Exam intelligence · internal
          </span>
        }
        title="Exam Intelligence Review"
        sub={
          <>
            Move syllabus mentions and PYQ tags into <em>verified</em> only after checking an
            admin-reviewed source. Nothing on this page is generated by AI.
          </>
        }
        right={<StatusDot state="live" label="Live · /api/admin/exam-intelligence" />}
      />

      <AdminSafetyBanner
        title="Verified-only contract"
        testId="admin-exam-intel-safety"
        tone="clay"
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
                ? "bg-[#FFFDF9] text-[#2E2218] border border-[#D9C7A7]"
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
            onEdit={openCoverageEditor}
            busyRowId={coverageBusyRowId}
          />
          <Drawer
            open={!!coverageEditRow}
            onClose={() => setCoverageEditRow(null)}
            title={coverageEditRow ? `Edit · ${coverageEditRow.topic || coverageEditRow.id}` : "Edit"}
            width={480}
          >
            {coverageEditRow ? (
              <div className="space-y-3 text-sm">
                <p className="text-[12px] text-clay-700">
                  Lock lifecycle is unchanged by edits here. Use the review action buttons to move
                  the row to a different lifecycle state.
                </p>
                <Field label="Coverage depth">
                  <input
                    className="input-row"
                    value={coverageEditForm.coverage_depth || ""}
                    onChange={(e) => setCoverageEditForm((p) => ({ ...p, coverage_depth: e.target.value }))}
                  />
                </Field>
                <Field label="Expected difficulty">
                  <input
                    className="input-row"
                    value={coverageEditForm.expected_difficulty || ""}
                    onChange={(e) => setCoverageEditForm((p) => ({ ...p, expected_difficulty: e.target.value }))}
                  />
                </Field>
                <Field label="Exam priority score (0–100)">
                  <input
                    type="number"
                    step="0.1"
                    className="input-row"
                    value={coverageEditForm.exam_priority_score ?? ""}
                    onChange={(e) =>
                      setCoverageEditForm((p) => ({ ...p, exam_priority_score: e.target.value }))
                    }
                  />
                </Field>
                <Field label="Confidence score (0–1)">
                  <input
                    type="number"
                    step="0.01"
                    className="input-row"
                    value={coverageEditForm.confidence_score ?? ""}
                    onChange={(e) =>
                      setCoverageEditForm((p) => ({ ...p, confidence_score: e.target.value }))
                    }
                  />
                </Field>
                <label className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={!!coverageEditForm.is_high_yield}
                    onChange={(e) =>
                      setCoverageEditForm((p) => ({ ...p, is_high_yield: e.target.checked }))
                    }
                  />
                  High yield
                </label>
                <Field label="Source basis">
                  <input
                    className="input-row"
                    value={coverageEditForm.source_basis || ""}
                    onChange={(e) => setCoverageEditForm((p) => ({ ...p, source_basis: e.target.value }))}
                  />
                </Field>
                <Field label="Reviewer notes">
                  <textarea
                    rows={3}
                    className="input-row"
                    value={coverageEditForm.reviewer_notes || ""}
                    onChange={(e) =>
                      setCoverageEditForm((p) => ({ ...p, reviewer_notes: e.target.value }))
                    }
                  />
                </Field>
                <div className="flex justify-end gap-2 pt-2 border-t border-clay-200">
                  <button
                    type="button"
                    className="btn btn-ghost"
                    onClick={() => setCoverageEditRow(null)}
                    disabled={coverageEditBusy}
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    onClick={saveCoverageEdit}
                    disabled={coverageEditBusy}
                    data-testid="coverage-edit-save"
                  >
                    {coverageEditBusy ? "Saving…" : "Save"}
                  </button>
                </div>
                <style>{`.input-row{width:100%;padding:0.55rem 0.9rem;border-radius:0.75rem;background:rgba(255,255,255,0.85);border:1px solid #E7DECB;font-size:14px;}`}</style>
              </div>
            ) : null}
          </Drawer>
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

function Field({ label, children }) {
  return (
    <label className="block">
      <span className="text-[10.5px] uppercase tracking-wider text-clay-700">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}
