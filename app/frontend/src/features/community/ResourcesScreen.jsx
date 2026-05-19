import React, { useCallback, useEffect, useMemo, useState } from "react";
import { api } from "../../lib/api";
import useApiAction from "../../lib/hooks/useApiAction";
import { useAuth } from "../../lib/authContext";
import { COMMUNITY_USERS, RESOURCES } from "./data";
import {
  FieldAvatar,
  FieldButton,
  FieldCard,
  FieldDivider,
  FieldDrawer,
  FieldEmpty,
  FieldFieldGroup,
  FieldHeader,
  FieldInput,
  FieldLabel,
  FieldPage,
  FieldPill,
  FieldSourceTrust,
  FieldTextarea,
} from "./ui";

const TYPE_ICONS = {
  pyq_paper: { glyph: "◎", label: "PYQ paper" },
  notes: { glyph: "≣", label: "Notes" },
  strategy_guide: { glyph: "◆", label: "Strategy guide" },
  video_link: { glyph: "▷", label: "Video" },
  course_link: { glyph: "⊞", label: "Course" },
  book: { glyph: "❒", label: "Book" },
};

export default function ResourcesScreen() {
  const { user } = useAuth();
  // Default to the user's primary exam if known; otherwise show everything.
  const defaultExam =
    Array.isArray(user?.goal_exams) && user.goal_exams.length > 0 ? user.goal_exams[0] : "all";
  const [type, setType] = useState("all");
  const [trust, setTrust] = useState("all");
  const [exam, setExam] = useState(defaultExam);
  const [items, setItems] = useState(RESOURCES);
  const [contributeOpen, setContributeOpen] = useState(false);
  const [reportFor, setReportFor] = useState(null);
  const { run } = useApiAction();

  const reload = useCallback(async (params = {}) => {
    try {
      const cleanedEntries = Object.entries(params).filter(([, v]) => v && v !== "all");
      const qs = new URLSearchParams(cleanedEntries).toString();
      const d = await api.get(`/api/community/resources${qs ? `?${qs}` : ""}`);
      if (Array.isArray(d?.items)) setItems(d.items);
    } catch {
      // Keep seed visible.
    }
  }, []);

  useEffect(() => {
    reload({ exam, type, trust });
  }, [reload, exam, type, trust]);

  const filtered = useMemo(
    () =>
      items.filter((r) => {
        if (type !== "all" && r.type !== type) return false;
        if (trust !== "all" && r.sourceTrust !== trust) return false;
        if (exam !== "all" && r.exam !== exam) return false;
        return true;
      }),
    [items, type, trust, exam],
  );

  async function vote(r) {
    const prev = items;
    await run({
      action: () => api.post(`/api/community/resources/${r.id}/vote`, {}),
      optimistic: () =>
        setItems((list) =>
          list.map((it) =>
            it.id === r.id
              ? { ...it, upvotes: (it.upvotes || 0) + (it.youVoted ? -1 : 1), youVoted: !it.youVoted }
              : it,
          ),
        ),
      rollback: () => setItems(prev),
      onSuccess: () => reload({ exam, type, trust }),
      errorMessage: "Could not record vote.",
    });
  }

  async function submitReport(reason) {
    if (!reportFor) return;
    await run({
      action: () => api.post(`/api/community/resources/${reportFor.id}/report`, { reason }),
      successMessage: "Report submitted. A moderator will review.",
      errorMessage: "Could not submit report.",
      onSuccess: () => setReportFor(null),
    });
  }

  return (
    <FieldPage testId="resources-page">
      <FieldHeader
        eyebrow="Resource library"
        title="Free, source-tagged resources — never silently 'recommended'."
        sub="Every resource carries a source label. Community submissions stay pending until reviewed; reported material goes to moderation."
        right={
          <FieldButton
            variant="primary"
            size="sm"
            onClick={() => setContributeOpen(true)}
            data-testid="resource-contribute-btn"
          >
            + Contribute resource
          </FieldButton>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-[240px_1fr] gap-6">
        <FilterSidebar
          type={type}
          setType={setType}
          trust={trust}
          setTrust={setTrust}
          exam={exam}
          setExam={setExam}
        />

        <div className="space-y-5 min-w-0">
          <div className="flex items-center justify-between flex-wrap gap-3">
            <div>
              <FieldLabel>Showing</FieldLabel>
              <div className="font-sans text-[17px] font-semibold mt-1 text-field-ink">
                {filtered.length} of {items.length} resources
              </div>
            </div>
          </div>

          {filtered.length === 0 ? (
            <FieldEmpty
              icon="◌"
              title="Nothing matches these filters."
              body="Loosen filters or contribute the first resource."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {filtered.map((r) => (
                <ResourceCard key={r.id} r={r} onVote={() => vote(r)} onReport={() => setReportFor(r)} />
              ))}
            </div>
          )}

          <FlaggedHelp />
        </div>
      </div>

      {contributeOpen ? (
        <ContributeDrawer
          onClose={() => setContributeOpen(false)}
          onContributed={() => reload({ exam, type, trust })}
        />
      ) : null}
      {reportFor ? (
        <ReportDrawer resource={reportFor} onClose={() => setReportFor(null)} onSubmit={submitReport} />
      ) : null}
    </FieldPage>
  );
}

function FilterSidebar({ type, setType, trust, setTrust, exam, setExam }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 self-start" data-testid="resources-filters">
      <FieldCard>
        <FieldLabel>Exam</FieldLabel>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["all", "UPSC CSE", "SSC CGL", "IBPS PO", "RBI Grade B"].map((e) => (
            <FilterChip
              key={e}
              active={exam === e}
              onClick={() => setExam(e)}
              testId={`res-exam-${e === "all" ? "all" : e.replace(/\s+/g, "-").toLowerCase()}`}
            >
              {e === "all" ? "All" : e}
            </FilterChip>
          ))}
        </div>
      </FieldCard>

      <FieldCard>
        <FieldLabel>Type</FieldLabel>
        <div className="mt-2 flex flex-col gap-0.5">
          {[
            ["all", "All types"],
            ["pyq_paper", "PYQ paper"],
            ["notes", "Notes"],
            ["strategy_guide", "Strategy guide"],
            ["video_link", "Video link"],
            ["course_link", "Course link"],
            ["book", "Book"],
          ].map(([k, label]) => (
            <FilterRow
              key={k}
              active={type === k}
              onClick={() => setType(k)}
              testId={`res-type-${k}`}
            >
              {label}
            </FilterRow>
          ))}
        </div>
      </FieldCard>

      <FieldCard>
        <FieldLabel>Source trust</FieldLabel>
        <div className="mt-2 flex flex-col gap-0.5">
          {[
            ["all", "All"],
            ["official", "Official"],
            ["community", "Community"],
            ["coaching", "Coaching"],
            ["unknown", "Unknown · needs review"],
          ].map(([k, label]) => (
            <FilterRow
              key={k}
              active={trust === k}
              onClick={() => setTrust(k)}
              testId={`res-trust-${k}`}
              leading={k !== "all" ? <FieldSourceTrust trust={k} /> : null}
            >
              {label}
            </FilterRow>
          ))}
        </div>
      </FieldCard>

      <FieldCard tone="accent" className="!border-field-accent/40">
        <FieldLabel>Topper review flag</FieldLabel>
        <div className="font-sans text-[14px] font-medium mt-1 text-field-accent-ink leading-snug">
          Shown only when moderation records a Topper review on the resource.
        </div>
        <p className="text-[11.5px] text-field-accent-ink/85 mt-1.5 leading-relaxed">
          It doesn't mean the resource is perfect — it means the review provenance exists.
        </p>
      </FieldCard>
    </aside>
  );
}

function FilterChip({ active, onClick, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`text-[11.5px] px-2.5 h-7 rounded-md border transition-colors ${
        active
          ? "bg-field-accent text-white border-field-accent"
          : "border-field-line text-field-ink-muted hover:bg-field-line-soft"
      }`}
    >
      {children}
    </button>
  );
}

function FilterRow({ active, onClick, leading, children, testId }) {
  return (
    <button
      type="button"
      onClick={onClick}
      data-testid={testId}
      className={`flex items-center gap-2 text-left text-[12.5px] px-2.5 py-1.5 rounded-md transition-colors ${
        active
          ? "bg-field-accent-soft text-field-accent-ink"
          : "text-field-ink-muted hover:bg-field-line-soft hover:text-field-ink"
      }`}
    >
      {leading}
      <span className="flex-1">{children}</span>
    </button>
  );
}

function ResourceCard({ r, onVote, onReport }) {
  const u = COMMUNITY_USERS[r.contributedBy] || { name: r.contributedBy };
  const typeInfo = TYPE_ICONS[r.type] || { glyph: "·", label: r.type };
  return (
    <article
      className={`rounded-md border bg-field-canvas p-4 transition-colors flex flex-col ${
        r.flagged ? "border-field-danger/40" : "border-field-line"
      }`}
      data-testid={`resource-card-${r.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          aria-hidden="true"
          className="w-10 h-10 rounded-md flex items-center justify-center text-[18px] shrink-0 bg-field-paper border border-field-line text-field-ink-muted"
        >
          {typeInfo.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <FieldSourceTrust trust={r.sourceTrust} />
            <FieldPill tone="outline">{typeInfo.label}</FieldPill>
            {r.verifiedByTopper ? <FieldPill tone="accent">✓ Topper</FieldPill> : null}
            {r.flagged ? <FieldPill tone="danger">Flagged · review</FieldPill> : null}
          </div>
          <h3 className="font-sans text-[15px] font-semibold mt-2 leading-snug text-field-ink">{r.title}</h3>
          <div className="font-mono text-[10.5px] text-field-ink-quiet mt-1.5 uppercase tracking-[0.06em]">
            {r.subject !== "Meta" ? `${r.exam} · ${r.subject}` : r.exam} · {r.size}
          </div>
        </div>
      </div>

      <FieldDivider className="my-3" />
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <FieldAvatar user={u} size={22} />
          <div className="min-w-0">
            <div className="text-[11.5px] text-field-ink truncate">{u.name}</div>
            <div className="font-mono text-[10px] text-field-ink-quiet uppercase tracking-[0.06em]">
              contributed {r.createdAt}
            </div>
          </div>
        </div>
        <button
          type="button"
          onClick={onVote}
          aria-pressed={!!r.youVoted}
          aria-label={`Upvote, currently ${r.upvotes || 0}`}
          className={`inline-flex items-center gap-1.5 px-2 h-7 rounded-md border transition-colors ${
            r.youVoted
              ? "bg-field-accent-soft border-field-accent/30 text-field-accent-ink"
              : "bg-field-canvas border-field-line text-field-ink-muted hover:text-field-ink hover:bg-field-line-soft"
          }`}
        >
          <svg width="10" height="10" viewBox="0 0 12 12" aria-hidden="true">
            <path d="M6 2L2 7h2.5v3h3V7H10L6 2z" fill="currentColor" />
          </svg>
          <span className="font-mono text-[11px] tabular-nums">{r.upvotes || 0}</span>
        </button>
      </div>

      <div className="mt-3 flex gap-2">
        {r.sourceUrl ? (
          <FieldButton
            variant="primary"
            size="sm"
            as="a"
            href={r.sourceUrl}
            target="_blank"
            rel="noopener noreferrer"
            data-testid={`resource-open-${r.id}`}
            className="flex-1"
          >
            Open ↗
          </FieldButton>
        ) : (
          <FieldButton variant="secondary" size="sm" disabled className="flex-1">
            No link
          </FieldButton>
        )}
        <FieldButton
          variant="ghost"
          size="sm"
          onClick={onReport}
          data-testid={`resource-report-${r.id}`}
        >
          Report{r.reportCount ? ` (${r.reportCount})` : ""}
        </FieldButton>
      </div>
    </article>
  );
}

function FlaggedHelp() {
  return (
    <FieldCard className="!border-field-danger/30 !bg-field-danger-soft/50">
      <div className="flex items-start gap-3">
        <svg width="20" height="20" viewBox="0 0 24 24" className="mt-0.5 shrink-0" aria-hidden="true">
          <path
            d="M12 8v5M12 16.5v.5M3.5 19h17L12 4.5 3.5 19z"
            stroke="#8B2F1F"
            strokeWidth="1.6"
            strokeLinejoin="round"
            fill="none"
          />
        </svg>
        <div className="flex-1 min-w-0">
          <FieldLabel>How flagging works</FieldLabel>
          <h3 className="font-sans text-[16px] font-semibold mt-1 text-field-danger">
            DMCA / copyright concerns are taken seriously.
          </h3>
          <p className="text-[12.5px] text-field-danger/85 mt-1.5 leading-relaxed">
            Flagged resources stay visible with a clear warning until admin review. After review, they're either
            restored or removed. Resource-library moderation lives in /admin/community.
          </p>
        </div>
      </div>
    </FieldCard>
  );
}

const REPORT_REASONS = [
  { k: "dmca", label: "DMCA / copyright concern" },
  { k: "spam", label: "Spam / off-topic" },
  { k: "incorrect", label: "Factually incorrect" },
  { k: "broken", label: "Broken or dead link" },
  { k: "other", label: "Other" },
];

function ReportDrawer({ resource, onClose, onSubmit }) {
  const [reasonKey, setReasonKey] = useState("");
  const [details, setDetails] = useState("");
  const composed = useMemo(() => {
    const labeled = REPORT_REASONS.find((r) => r.k === reasonKey)?.label;
    const trimmed = details.trim();
    if (!labeled && !trimmed) return "";
    if (labeled && trimmed) return `${labeled}: ${trimmed}`;
    return labeled || trimmed;
  }, [reasonKey, details]);
  // Backend enforces 3 <= reason <= 300.
  const valid = composed.length >= 3 && composed.length <= 300;
  return (
    <FieldDrawer
      open
      onClose={onClose}
      title="Report resource"
      width={460}
      footer={
        <div className="flex justify-end gap-2">
          <FieldButton variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </FieldButton>
          <FieldButton
            variant="primary"
            size="sm"
            onClick={() => onSubmit(composed)}
            disabled={!valid}
            data-testid="report-submit"
          >
            Submit report
          </FieldButton>
        </div>
      }
    >
      <div className="space-y-5" data-testid="report-drawer">
        <div className="rounded-md border border-field-line bg-field-paper p-3">
          <FieldLabel>Resource</FieldLabel>
          <div className="font-sans text-[14px] font-medium mt-1 text-field-ink">{resource.title}</div>
        </div>

        <FieldFieldGroup label="Reason">
          <div className="flex flex-col gap-1">
            {REPORT_REASONS.map((r) => (
              <label
                key={r.k}
                className="flex items-center gap-2 text-[12.5px] cursor-pointer px-2 py-1.5 rounded-md hover:bg-field-line-soft"
              >
                <input
                  type="radio"
                  name="report-reason"
                  value={r.k}
                  checked={reasonKey === r.k}
                  onChange={() => setReasonKey(r.k)}
                  className="accent-field-accent"
                />
                {r.label}
              </label>
            ))}
          </div>
        </FieldFieldGroup>

        <FieldFieldGroup
          label={`Details ${reasonKey === "other" ? "(required)" : "(optional)"}`}
        >
          <FieldTextarea
            rows={3}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="Describe what's wrong. Moderators read every report."
            aria-label="Report details"
          />
          <div className="font-mono text-[10px] text-field-ink-quiet mt-1.5">{composed.length}/300</div>
        </FieldFieldGroup>
      </div>
    </FieldDrawer>
  );
}

function ContributeDrawer({ onClose, onContributed }) {
  const [form, setForm] = useState({
    title: "",
    type: "notes",
    exam: "UPSC CSE",
    subject: "Meta",
    sourceTrust: "community",
    sourceUrl: "",
    size: "link",
  });
  const [submitting, setSubmitting] = useState(false);

  async function submit() {
    if (form.title.trim().length < 4 || !form.sourceUrl.trim()) return;
    setSubmitting(true);
    try {
      await api.post("/api/community/resources", form);
      onContributed && onContributed();
      onClose();
    } catch {
      setSubmitting(false);
    }
  }

  const selectCls =
    "w-full h-9 px-3 rounded-md border border-field-line bg-field-canvas text-[13px] text-field-ink focus:outline-none focus:border-field-accent focus:ring-1 focus:ring-field-accent/40 transition";

  return (
    <FieldDrawer
      open
      onClose={onClose}
      title="Contribute a resource"
      width={500}
      footer={
        <div className="flex justify-end gap-2">
          <FieldButton variant="secondary" size="sm" onClick={onClose}>
            Cancel
          </FieldButton>
          <FieldButton
            variant="primary"
            size="sm"
            onClick={submit}
            disabled={submitting || form.title.trim().length < 4 || !form.sourceUrl.trim()}
            data-testid="resource-contribute-submit"
          >
            {submitting ? "Submitting…" : "Submit resource"}
          </FieldButton>
        </div>
      }
    >
      <div className="space-y-4" data-testid="contribute-drawer">
        <FieldFieldGroup label="Title">
          <FieldInput
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="A clear, specific title (4+ chars)"
          />
        </FieldFieldGroup>
        <div className="grid grid-cols-2 gap-3">
          <FieldFieldGroup label="Type">
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className={selectCls}
            >
              {Object.keys(TYPE_ICONS).map((k) => (
                <option key={k} value={k}>
                  {TYPE_ICONS[k].label}
                </option>
              ))}
            </select>
          </FieldFieldGroup>
          <FieldFieldGroup label="Source trust">
            <select
              value={form.sourceTrust}
              onChange={(e) => setForm({ ...form, sourceTrust: e.target.value })}
              className={selectCls}
            >
              {["official", "community", "coaching", "unknown"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </FieldFieldGroup>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <FieldFieldGroup label="Exam">
            <FieldInput value={form.exam} onChange={(e) => setForm({ ...form, exam: e.target.value })} />
          </FieldFieldGroup>
          <FieldFieldGroup label="Subject">
            <FieldInput value={form.subject} onChange={(e) => setForm({ ...form, subject: e.target.value })} />
          </FieldFieldGroup>
        </div>
        <FieldFieldGroup label="Source URL">
          <FieldInput
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            placeholder="https://..."
            data-testid="resource-source-url"
          />
        </FieldFieldGroup>
        <div className="rounded-md border border-field-accent/30 bg-field-accent-soft p-3 text-[12px] text-field-accent-ink leading-relaxed">
          <strong className="font-medium">Before posting:</strong> use the original source link. Reported or
          unverified material is held for review.
        </div>
      </div>
    </FieldDrawer>
  );
}
