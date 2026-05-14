import React, { useCallback, useEffect, useState } from "react";
import { GraduationCap } from "lucide-react";
import { api } from "../../lib/api";
import ExamIntelligenceOverviewCards from "../../features/admin/exam-intelligence/ExamIntelligenceOverviewCards";
import ExamListTable from "../../features/admin/exam-intelligence/ExamListTable";
import ReviewQueueTable from "../../features/admin/exam-intelligence/ReviewQueueTable";
import TopicCoveragePreview from "../../features/admin/exam-intelligence/TopicCoveragePreview";
import PlanImpactPreview from "../../features/admin/exam-intelligence/PlanImpactPreview";
import { AdminSafetyBanner } from "../../shared/ui";

const TABS = [
  { id: "overview", label: "Overview" },
  { id: "exams", label: "Exams" },
  { id: "review", label: "Review queue" },
  { id: "coverage", label: "Topic Coverage" },
  { id: "impact", label: "Plan Impact" },
];

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

  useEffect(() => {
    if (tab === "overview") loadOverview();
    if (tab === "exams") loadExams();
    if (tab === "review") loadItems();
  }, [tab, loadOverview, loadExams, loadItems]);

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

  return (
    <div className="space-y-6" data-testid="admin-exam-intelligence-page">
      <header>
        <div className="flex items-center gap-2 text-[11px] uppercase tracking-[0.22em] text-muted-foreground font-semibold">
          <GraduationCap className="h-3.5 w-3.5" /> Exam intelligence
        </div>
        <h1 className="mt-1 font-heading text-3xl font-semibold tracking-tight">
          Exam Intelligence Review
        </h1>
        <p className="text-muted-foreground mt-1">
          Move syllabus mentions and PYQ tags into <em>verified</em> only after
          checking an admin-reviewed source. Nothing on this page is generated
          by AI.
        </p>
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

      <nav className="flex flex-wrap gap-2" aria-label="Exam intelligence tabs">
        {TABS.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setTab(t.id)}
            data-testid={`exam-intel-tab-${t.id}`}
            className={`pill px-3 py-1 text-xs rounded-full border ${
              tab === t.id
                ? "border-clay-500 bg-clay-50 text-clay-800"
                : "border-clay-200 text-muted-foreground hover:bg-clay-50"
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
        <section data-testid="exam-intel-coverage">
          <TopicCoveragePreview items={[]} />
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
