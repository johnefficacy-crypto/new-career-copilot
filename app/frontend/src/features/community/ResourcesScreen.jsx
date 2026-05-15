import React, { useState, useMemo } from "react";
import {
  Avatar,
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

  const filtered = useMemo(
    () =>
      RESOURCES.filter((r) => {
        if (type !== "all" && r.type !== type) return false;
        if (trust !== "all" && r.sourceTrust !== trust) return false;
        if (exam !== "all" && r.exam !== exam) return false;
        return true;
      }),
    [type, trust, exam],
  );

  return (
    <div className="space-y-6" data-testid="resources-page">
      <PageHeader
        eyebrow="Resource library"
        title="Free, source-tagged resources — never silently 'recommended'."
        sub="Every resource carries a source-trust label. Verified-by-Topper is admin-granted. Pirated material is removed, regardless of upvotes."
        right={
          <button type="button" className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">
            + Contribute resource
          </button>
        }
      />

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
                  {filtered.length} of {RESOURCES.length} resources
                </div>
              </div>
              <div className="flex gap-2 items-center">
                <span className="num-mono text-[10.5px] text-clay-700">Sort:</span>
                <Pill tone="ink">Top</Pill>
                <Pill tone="outline">New</Pill>
                <Pill tone="outline">Verified-by-Topper</Pill>
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
                <ResourceCard key={r.id} r={r} />
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
                  ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
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
                type === k ? "bg-[#2E2218] text-[#F3EADB]" : "text-[#3a2e22] hover:bg-[#F3EADB]"
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
                trust === k ? "bg-[#2E2218] text-[#F3EADB]" : "text-[#3a2e22] hover:bg-[#F3EADB]"
              }`}
            >
              {k !== "all" ? <SourceTrustStamp trust={k} /> : <span className="w-2 h-2 bg-[#A68057] rounded-sm" />}
              <span>{label}</span>
            </button>
          ))}
        </div>
      </Card>

      <Card className="!bg-[#F0F5EF] !border-[#B9CFAF]">
        <Eyebrow>Verified-by-Topper</Eyebrow>
        <div className="font-heading text-[15px] mt-1 text-[#33482F]">
          Admin grants this flag after a Verified Topper signs off on the resource.
        </div>
        <p className="text-[11.5px] text-[#33482F] mt-1">
          It does not mean the resource is perfect — it means a Topper read it.
        </p>
      </Card>
    </aside>
  );
}

function ResourceCard({ r }) {
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
          <VoteColumn count={r.upvotes} vertical={false} />
        </div>
      </div>

      <div className="rule mt-3 pt-2 flex gap-2">
        <button
          type="button"
          className="flex-1 text-[11.5px] px-2.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold"
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
          className="text-[11.5px] px-2.5 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold"
        >
          Report
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
