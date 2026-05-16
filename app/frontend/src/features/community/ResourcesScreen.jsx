import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  Avatar,
  Drawer,
  Eyebrow,
  PageHeader,
  Pill,
  SourceTrustStamp,
  StudyCard as Card,
  StudyEmptyState as EmptyState,
  UserBadge,
  VerifiedTopperBadge,
  VoteColumn,
} from "../../shared/ui/studyos";
import { api } from "../../lib/api";
import { COMMUNITY_USERS, RESOURCES } from "./data";

// Production port of docs/reference/UI_claude-code/screen-resources.jsx.

const TYPE_ICONS = {
  pyq_paper: { glyph: "◎", label: "PYQ paper" },
  notes: { glyph: "≣", label: "Notes" },
  strategy_guide: { glyph: "◆", label: "Strategy guide" },
  video_link: { glyph: "▷", label: "Video" },
  course_link: { glyph: "⊞", label: "Course" },
  book: { glyph: "❒", label: "Book" },
};

export default function ResourcesScreen() {
  const [type, setType] = useState("all");
  const [trust, setTrust] = useState("all");
  const [exam, setExam] = useState("UPSC CSE");
  const [items, setItems] = useState(RESOURCES);
  const [contributeOpen, setContributeOpen] = useState(false);

  const reload = useCallback(async (params = {}) => {
    try {
      const qs = new URLSearchParams(params).toString();
      const d = await api.get(`/api/community/resources${qs ? `?${qs}` : ""}`);
      if (Array.isArray(d?.items) && d.items.length) setItems(d.items);
    } catch {}
  }, []);

  useEffect(() => {
    reload();
  }, [reload]);

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

  async function vote(id) {
    try {
      await api.post(`/api/community/resources/${id}/vote`, {});
      reload();
    } catch {}
  }

  async function report(id, reason) {
    try {
      await api.post(`/api/community/resources/${id}/report`, { reason });
    } catch {}
  }

  return (
    <div className="space-y-6" data-testid="resources-page">
      <PageHeader
        eyebrow="Resource library"
        title="Free, source-tagged resources — never silently 'recommended'."
        sub="Every resource carries a source label. Community submissions stay pending until reviewed; reported material goes to moderation."
        right={
          <button
            type="button"
            onClick={() => setContributeOpen(true)}
            data-testid="resource-contribute-btn"
            className="text-[12px] px-3 py-1.5 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold"
          >
            + Contribute resource
          </button>
        }
      />
      {contributeOpen ? (
        <ContributeDrawer onClose={() => setContributeOpen(false)} onContributed={reload} />
      ) : null}

      <div className="grid grid-cols-1 lg:grid-cols-[260px_1fr] gap-6">
        <FilterSidebar
          type={type}
          setType={setType}
          trust={trust}
          setTrust={setTrust}
          exam={exam}
          setExam={setExam}
        />

        <div className="space-y-6 min-w-0">
          <Card>
            <div className="flex items-center justify-between flex-wrap gap-3">
              <div>
                <Eyebrow>Showing</Eyebrow>
                <div className="font-heading text-[19px] mt-1">
                  {filtered.length} of {items.length} resources
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="num-mono text-[10.5px] text-clay-700">Sort:</span>
                <Pill tone="ink">Top</Pill>
                <Pill tone="outline">New</Pill>
                <Pill tone="outline">Topper review</Pill>
              </div>
            </div>
          </Card>

          {filtered.length === 0 ? (
            <EmptyState
              icon="◌"
              title="Nothing matches these filters."
              body="Loosen filters or contribute the first resource."
            />
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {filtered.map((r) => (
                <ResourceCard key={r.id} r={r} onVote={() => vote(r.id)} onReport={() => report(r.id, "user-reported via UI")} />
              ))}
            </div>
          )}

          <FlaggedResourcesCard />
        </div>
      </div>
    </div>
  );
}

function FilterSidebar({ type, setType, trust, setTrust, exam, setExam }) {
  return (
    <aside className="space-y-4 lg:sticky lg:top-4 self-start" data-testid="resources-filters">
      <Card>
        <Eyebrow>Exam</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {["all", "UPSC CSE", "SSC CGL", "IBPS PO", "RBI Grade B"].map((e) => (
            <button
              key={e}
              type="button"
              onClick={() => setExam(e)}
              data-testid={`res-exam-${e === "all" ? "all" : e.replace(/\s+/g, "-").toLowerCase()}`}
              className={`text-[11px] px-2.5 py-1 rounded-full border ${
                exam === e
                  ? "bg-[#4E3A29] text-[#F3EADB] border-[#4E3A29]"
                  : "border-[#E7DECB] text-clay-700"
              }`}
            >
              {e === "all" ? "All" : e}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Type</Eyebrow>
        <div className="mt-2 flex flex-col gap-1">
          {[
            ["all", "All types"],
            ["pyq_paper", "PYQ paper"],
            ["notes", "Notes"],
            ["strategy_guide", "Strategy guide"],
            ["video_link", "Video link"],
            ["course_link", "Course link"],
            ["book", "Book"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setType(k)}
              data-testid={`res-type-${k}`}
              className={`text-left text-[12px] px-2.5 py-1.5 rounded-md ${
                type === k ? "bg-[#4E3A29] text-[#F3EADB]" : "text-[#3a2e22] hover:bg-[#F3EADB]"
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </Card>

      <Card>
        <Eyebrow>Source trust</Eyebrow>
        <div className="mt-2 flex flex-col gap-1.5">
          {[
            ["all", "All"],
            ["official", "Official"],
            ["community", "Community"],
            ["coaching", "Coaching"],
            ["unknown", "Unknown · needs review"],
          ].map(([k, label]) => (
            <button
              key={k}
              type="button"
              onClick={() => setTrust(k)}
              data-testid={`res-trust-${k}`}
              className={`flex items-center gap-2 text-left text-[12px] px-2.5 py-1.5 rounded-md ${
                trust === k ? "bg-[#4E3A29] text-[#F3EADB]" : "text-[#3a2e22] hover:bg-[#F3EADB]"
              }`}
            >
              {k !== "all" ? <SourceTrustStamp trust={k} /> : <span className="w-2 h-2 bg-[#A68057] rounded-sm" />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
        <Eyebrow>Topper review flag</Eyebrow>
        <div className="font-heading text-[15px] mt-1 text-[#33482F]">
          Shown only when moderation records a Topper review on the resource.
        </div>
        <p className="text-[11.5px] text-[#33482F] mt-1">
          It does not mean the resource is perfect — it means the review provenance exists.
        </p>
      </Card>
    </aside>
  );
}

function ResourceCard({ r, onVote, onReport }) {
  const u = COMMUNITY_USERS[r.contributedBy] || { name: r.contributedBy };
  const typeInfo = TYPE_ICONS[r.type] || { glyph: "·", label: r.type };
  return (
    <article
      className={`rounded-xl border bg-white/70 p-4 transition hover:border-[#A68057] ${
        r.flagged ? "border-[#D9B4A6]" : "border-[#E7DECB]"
      }`}
      data-testid={`resource-card-${r.id}`}
    >
      <div className="flex items-start gap-3">
        <span
          className="w-10 h-10 rounded-lg flex items-center justify-center text-[18px] shrink-0"
          style={{ background: "#F3EADB", color: "#6C5038", border: "1px solid #E7DECB" }}
        >
          {typeInfo.glyph}
        </span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-1.5 flex-wrap">
            <SourceTrustStamp trust={r.sourceTrust} />
            <Pill tone="outline" className="!text-[9.5px]">
              {typeInfo.label}
            </Pill>
            {r.verifiedByTopper ? <VerifiedTopperBadge rank="✓ Topper" compact /> : null}
            {r.flagged ? (
              <span
                className="stamp"
                style={{ background: "#F2DDD6", color: "#7A3925", border: "1px solid #D9B4A6" }}
              >
                Flagged · review
              </span>
            ) : null}
          </div>
          <h3 className="font-heading text-[16px] mt-2 leading-snug">{r.title}</h3>
          <div className="num-mono text-[10.5px] text-clay-700 mt-1.5">
            {r.subject !== "Meta" ? `${r.exam} · ${r.subject}` : r.exam} · {r.size}
          </div>
        </div>
      </div>

      <div className="rule mt-3 pt-3 flex items-center justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <Avatar user={u} size={22} />
          <div className="min-w-0">
            <div className="text-[11.5px] truncate flex items-center gap-1.5">
              {u.name}
              <UserBadge user={u} compact />
            </div>
            <div className="num-mono text-[10px] text-clay-700">contributed {r.createdAt}</div>
          </div>
        </div>
        <div className="flex items-center gap-3 text-[10.5px] text-clay-700 shrink-0">
          <VoteColumn
            count={r.upvotes}
            vertical={false}
            voted={r.youVoted ? 1 : null}
            onVote={(d) => d === 1 && onVote && onVote()}
          />
        </div>
      </div>

      <div className="rule mt-3 pt-2 flex gap-2">
        <button
          type="button"
          className="flex-1 text-[11.5px] px-2.5 py-1.5 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold"
        >
          Open
        </button>
        <button
          type="button"
          className="text-[11.5px] px-2.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
        >
          Save
        </button>
        <button
          type="button"
          onClick={() => onReport && onReport()}
          data-testid={`resource-report-${r.id}`}
          className="text-[11.5px] px-2.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
        >
          Report{r.reportCount ? ` (${r.reportCount})` : ""}
        </button>
      </div>
    </article>
  );
}

function FlaggedResourcesCard() {
  return (
    <Card className="!bg-[#F2DDD6] !border-[#D9B4A6]">
      <div className="flex items-start gap-3">
        <svg
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          className="mt-0.5 shrink-0"
          aria-hidden="true"
        >
          <path
            d="M12 8v5M12 16.5v.5M3.5 19h17L12 4.5 3.5 19z"
            stroke="#7A3925"
            strokeWidth="1.6"
            strokeLinejoin="round"
          />
        </svg>
        <div className="flex-1">
          <Eyebrow>How flagging works</Eyebrow>
          <h3 className="font-heading text-[18px] text-[#7A3925] mt-1">
            DMCA / copyright concerns are taken seriously.
          </h3>
          <p className="text-[12.5px] text-[#7A3925]/90 mt-1.5">
            Flagged resources stay visible but with a clear warning until admin review. After review they're either
            restored or removed. Resource library moderation lives in /admin/community.
          </p>
        </div>
      </div>
    </Card>
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

  return (
    <Drawer open onClose={onClose} title="Contribute a resource" width={500}>
      <div className="space-y-4" data-testid="contribute-drawer">
        <div>
          <Eyebrow>Title</Eyebrow>
          <input
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
            placeholder="A clear, specific title (4+ chars)"
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[14px] outline-none"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Eyebrow>Type</Eyebrow>
            <select
              value={form.type}
              onChange={(e) => setForm({ ...form, type: e.target.value })}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px]"
            >
              {Object.keys(TYPE_ICONS).map((k) => (
                <option key={k} value={k}>
                  {TYPE_ICONS[k].label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <Eyebrow>Source trust</Eyebrow>
            <select
              value={form.sourceTrust}
              onChange={(e) => setForm({ ...form, sourceTrust: e.target.value })}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px]"
            >
              {["official", "community", "coaching", "unknown"].map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </select>
          </div>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <Eyebrow>Exam</Eyebrow>
            <input
              value={form.exam}
              onChange={(e) => setForm({ ...form, exam: e.target.value })}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px]"
            />
          </div>
          <div>
            <Eyebrow>Subject</Eyebrow>
            <input
              value={form.subject}
              onChange={(e) => setForm({ ...form, subject: e.target.value })}
              className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px]"
            />
          </div>
        </div>
        <div>
          <Eyebrow>Source URL</Eyebrow>
          <input
            value={form.sourceUrl}
            onChange={(e) => setForm({ ...form, sourceUrl: e.target.value })}
            placeholder="https://..."
            className="mt-2 w-full px-3 py-2 rounded-lg border border-[#E7DECB] bg-white/70 text-[13px]"
            data-testid="resource-source-url"
          />
        </div>
        <div className="rounded-lg bg-[#F0F5EF] border border-[#B9CFAF] p-3 text-[11.5px] text-[#33482F]">
          <strong>Before posting:</strong> use the original source link. Reported or unverified material is held for review.
        </div>
        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-full border border-[#E7DECB] text-clay-700 font-semibold text-[12px]"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={submitting || form.title.trim().length < 4 || !form.sourceUrl.trim()}
            data-testid="resource-contribute-submit"
            className="px-4 py-2 rounded-full bg-[#4E3A29] text-[#F3EADB] font-semibold text-[12px] disabled:opacity-50"
          >
            {submitting ? "Submitting…" : "Submit resource"}
          </button>
        </div>
      </div>
    </Drawer>
  );
}
