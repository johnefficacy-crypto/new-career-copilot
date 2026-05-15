import React, { useState } from "react";
import { Card, Eyebrow, FooterStrip, PageHeader, Pill, PrototypePage, StatusDot, Tabs, TrustStamp } from "../ui";

const ELIG_DATA = {
  engineMeta: {
    lastRematch: "Today · 04:48 IST",
    rematchedRecruitments: 12,
    rematchedFacets: 9,
    version: "Eligibility engine v0.5 · 6 rules",
  },
  profile: {
    completeness: 0.78,
    facets: [
      { k: "Date of birth", v: "15 Mar 2002 · age 24", state: "filled", evidence: "Aadhaar" },
      { k: "Gender", v: "Male", state: "filled", evidence: "profile" },
      { k: "Category", v: "OBC · NCL (2025)", state: "filled", evidence: "NCL certificate" },
      { k: "PwBD status", v: "Not applicable", state: "filled", evidence: "self-declared" },
      { k: "Nationality", v: "Indian", state: "filled", evidence: "Aadhaar" },
      { k: "Domicile", v: "Uttar Pradesh", state: "filled", evidence: "address proof" },
      { k: "Education", v: "B.Tech · CSE · 2024 · 78%", state: "filled", evidence: "degree (uploaded)" },
      { k: "Extra credentials", v: "GATE 2024 · CS · 720", state: "filled", evidence: "scorecard" },
      { k: "Ex-serviceman", v: "—", state: "missing", evidence: "not provided" },
      { k: "Work experience", v: "—", state: "missing", evidence: "not provided" },
    ],
  },
  kpis: [
    { k: "Eligible now", v: 11, sub: "of 14 open", tone: "sage" },
    { k: "Conditional", v: 2, sub: "profile gap", tone: "amber" },
    { k: "Not eligible", v: 1, sub: "domicile", tone: "rose" },
    { k: "New this week", v: 3, sub: "since May 8", tone: "ink" },
    { k: "Verified criteria", v: "86%", sub: "of all open", tone: "sage" },
    { k: "Awaiting verification", v: 5, sub: "admin queue", tone: "amber" },
  ],
  recent: [
    { at: "May 14 · 04:48", text: "You added GATE 2024 score → +2 matches (ISRO Scientist, BARC OCES)", kind: "profile" },
    { at: "May 14 · 03:12", text: "RBI Grade B 2026 criteria locked by admin → match status verified", kind: "verify" },
    { at: "May 13 · 18:02", text: "UPPSC 2026 became eligible (domicile UP)", kind: "match" },
    { at: "May 12 · 09:14", text: "UPSC CSE 2026 notification verified · 3 deadlines added", kind: "verify" },
    { at: "May 11 · 22:40", text: "SSC CGL 2026 criteria re-scraped · awaiting admin review", kind: "scrape" },
  ],
  matches: [
    {
      id: "r1", name: "UPSC CSE 2026", family: "Civil Services", verdict: "eligible", trust: "verified",
      verifiedAt: "May 12", deadline: "Jun 11 · 2026", vacancy: 1056, attempts: "6 / 9 used",
      criteria: [
        { k: "Age", c: "21–32 (OBC +3 → 35)", you: "24", ok: true },
        { k: "Nationality", c: "Indian", you: "Indian", ok: true },
        { k: "Education", c: "Graduate · any", you: "B.Tech CSE 78%", ok: true },
        { k: "Domicile", c: "All India", you: "UP", ok: true },
        { k: "Attempts", c: "≤ 9 (OBC)", you: "6 used", ok: true },
      ],
      why: "All six rules pass. OBC-NCL relaxation applied to age and attempts.",
    },
    {
      id: "r2", name: "RBI Grade B 2026", family: "Banking", verdict: "eligible", trust: "verified",
      verifiedAt: "May 11", deadline: "Jun 04 · 2026", vacancy: 94, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "21–30 (OBC +3)", you: "24", ok: true },
        { k: "Education", c: "Graduate ≥ 60%", you: "78%", ok: true },
        { k: "Nationality", c: "Indian", you: "Indian", ok: true },
        { k: "Special", c: "—", you: "—", ok: true },
      ],
      why: "Age + education thresholds satisfied with margin.",
    },
    {
      id: "r3", name: "SSC CGL 2026", family: "SSC", verdict: "eligible", trust: "verified",
      verifiedAt: "May 09", deadline: "May 28 · 2026", vacancy: 9650, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "18–32 (OBC +3)", you: "24", ok: true },
        { k: "Education", c: "Graduate · any", you: "B.Tech", ok: true },
      ],
      why: "Standard graduate eligibility.",
    },
    {
      id: "r4", name: "UPPSC 2026", family: "State PSC", verdict: "eligible", trust: "verified",
      verifiedAt: "May 10", deadline: "Jun 18 · 2026", vacancy: 486, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "21–40 (OBC +3 → 43)", you: "24", ok: true },
        { k: "Domicile", c: "UP-domicile gets reservation", you: "UP", ok: true, note: "home-state benefit" },
        { k: "Education", c: "Graduate", you: "B.Tech", ok: true },
      ],
      why: "Eligible with domicile benefit. You'll be considered in the UP-state quota.",
    },
    {
      id: "r5", name: "ISRO Scientist (CS) · 2026", family: "Defense · others", verdict: "eligible", trust: "verified",
      verifiedAt: "May 08", deadline: "Jul 02 · 2026", vacancy: 64, attempts: "unlimited", tag: "matched via GATE",
      criteria: [
        { k: "Age", c: "≤ 28 (OBC +3 → 31)", you: "24", ok: true },
        { k: "Education", c: "B.E./B.Tech CSE · ≥ 65%", you: "78%", ok: true },
        { k: "GATE", c: "valid GATE CS score required", you: "720 (2024)", ok: true, note: "top decile" },
      ],
      why: "Strong match. GATE score qualifies for shortlist round.",
    },
    {
      id: "r6", name: "BARC OCES 2026", family: "Defense · others", verdict: "conditional", trust: "needs",
      scrapedAt: "May 13", deadline: "Jun 25 · 2026", vacancy: 54, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "≤ 26 (OBC +3 → 29)", you: "24", ok: true },
        { k: "Education", c: "B.E./B.Tech CSE · ≥ 60%", you: "78%", ok: true },
        { k: "GATE", c: "GATE CS accepted as shortlist", you: "720 (2024)", ok: "maybe", note: "criteria not yet admin-verified" },
      ],
      why: "Verdict is conditional — the GATE-pathway criterion is freshly scraped and awaits admin verification.",
      blockedBy: "Source criteria awaiting admin verification",
    },
    {
      id: "r7", name: "IBPS PO 2026", family: "Banking", verdict: "eligible", trust: "verified",
      verifiedAt: "May 07", deadline: "Jun 09 · 2026", vacancy: 5208, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "20–30", you: "24", ok: true },
        { k: "Education", c: "Graduate", you: "B.Tech", ok: true },
      ],
      why: "Within age range; graduate criterion satisfied.",
    },
    {
      id: "r8", name: "BPSC 67th Combined · 2026", family: "State PSC", verdict: "not-eligible", trust: "verified",
      verifiedAt: "May 06", deadline: "Jun 14 · 2026", vacancy: 382, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "22–37 (OBC +3 → 40)", you: "24", ok: true },
        { k: "Education", c: "Graduate", you: "B.Tech", ok: true },
        { k: "Domicile", c: "Bihar-domicile mandatory for reservation; non-domicile general only", you: "UP", ok: false, note: "non-domicile · general competition" },
      ],
      why: "Strictly speaking you can apply, but most posts are reserved for Bihar domicile. We mark this as not-eligible by default; switch to 'consider anyway' to keep tracking.",
    },
    {
      id: "r9", name: "NDA 2026·1", family: "Defense", verdict: "not-eligible", trust: "verified",
      verifiedAt: "May 08", deadline: "closed", vacancy: 415, attempts: "used",
      criteria: [{ k: "Age", c: "16.5–19.5", you: "24", ok: false, note: "over age" }],
      why: "Over the age window. Not actionable.",
      hidden: true,
    },
    {
      id: "r10", name: "Indian Forest Service 2026", family: "Civil Services", verdict: "conditional", trust: "verified",
      verifiedAt: "May 09", deadline: "Jun 11 · 2026", vacancy: 147, attempts: "6 used",
      criteria: [
        { k: "Age", c: "21–32 (OBC +3)", you: "24", ok: true },
        { k: "Education", c: "Bachelor's with biological/animal/agri/forestry/engineering science", you: "B.Tech CSE", ok: "maybe", note: "Engineering accepted; verify with specific UPSC discipline list" },
        { k: "Domicile", c: "All India", you: "UP", ok: true },
      ],
      why: "Conditional — your engineering degree is on the accepted list, but the specific discipline-mapping needs admin confirmation for CSE.",
      blockedBy: "Discipline mapping pending admin review",
    },
    {
      id: "r11", name: "SBI PO 2026", family: "Banking", verdict: "eligible", trust: "verified",
      verifiedAt: "May 05", deadline: "Jun 02 · 2026", vacancy: 2400, attempts: "4 used",
      criteria: [
        { k: "Age", c: "21–30", you: "24", ok: true },
        { k: "Education", c: "Graduate", you: "B.Tech", ok: true },
      ],
      why: "Standard banking eligibility.",
    },
    {
      id: "r12", name: "AFCAT 02/2026", family: "Defense", verdict: "eligible", trust: "verified",
      verifiedAt: "May 04", deadline: "Jun 30 · 2026", vacancy: 317, attempts: "unlimited",
      criteria: [
        { k: "Age", c: "20–24 (Ground Duty)", you: "24", ok: true, note: "upper boundary" },
        { k: "Education", c: "Graduate · 60%+ each", you: "78%", ok: true },
        { k: "Gender", c: "Male/Female", you: "M", ok: true },
      ],
      why: "Eligible at upper-age boundary for the round.",
    },
  ],
};

const VERDICTS = {
  eligible: { label: "Eligible", stamp: "verified", tone: "sage", icon: "✓" },
  conditional: { label: "Conditional", stamp: "needs", tone: "amber", icon: "~" },
  "not-eligible": { label: "Not eligible", stamp: "notcon", tone: "rose", icon: "×" },
  unknown: { label: "Unknown · need data", stamp: "preview", tone: "dusk", icon: "?" },
};

function Check() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <path d="M3 8.4 6.4 11.5 13 4.6" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
function Ex() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round" />
    </svg>
  );
}
function Tilde() {
  return (
    <svg width="9" height="9" viewBox="0 0 16 16" fill="none">
      <path d="M3 9c2-2 4 2 6 0s4-2 4-2" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" fill="none" />
    </svg>
  );
}

function EligKPIs() {
  const tones = { sage: "#33482F", amber: "#6F5A22", rose: "#7A3925", ink: "#2E2218" };
  return (
    <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
      {ELIG_DATA.kpis.map((k, i) => (
        <div key={i} className="soft-card grain relative px-4 py-3.5">
          <Eyebrow>{k.k}</Eyebrow>
          <div className="font-serif text-[26px] mt-1 leading-none" style={{ color: tones[k.tone] }}>{k.v}</div>
          <div className="text-[11px] text-clay-700 mt-2">{k.sub}</div>
        </div>
      ))}
    </div>
  );
}

function MatchReasoning({ m }) {
  const steps = [
    { k: "01", text: "Loaded your profile snapshot · 9 facets (8 filled)" },
    { k: "02", text: `Loaded criteria for ${m.name} (source: ${m.trust === "verified" ? "admin-verified" : "scraped, unverified"})` },
    { k: "03", text: `Ran ${m.criteria.length} rules · ${m.criteria.filter((c) => c.ok === true).length} passed, ${m.criteria.filter((c) => c.ok === "maybe").length} conditional, ${m.criteria.filter((c) => c.ok === false).length} failed` },
    { k: "04", text: "Applied OBC-NCL relaxation where allowed" },
    { k: "05", text: `Verdict: ${VERDICTS[m.verdict].label} · confidence ${m.trust === "verified" ? "0.95" : "0.62"}` },
  ];
  return (
    <div className="mt-3 rounded-lg border border-[#EFE2C9] bg-[#FBF6EF]/70 px-3 py-2.5">
      <Eyebrow>Reasoning trace</Eyebrow>
      <ol className="mt-1.5 space-y-1 text-[12px]">
        {steps.map((s, i) => (
          <li key={i} className="grid grid-cols-[26px_1fr] gap-2">
            <span className="num-mono text-[10.5px] text-clay-700">{s.k}</span>
            <span className="text-[#3a2e22]">{s.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function MatchCard({ m, expanded, onExpand }) {
  const V = VERDICTS[m.verdict];
  const passes = (m.criteria || []).filter((c) => c.ok === true).length;
  const total = (m.criteria || []).length;
  return (
    <article className="soft-card grain relative overflow-hidden">
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_auto] gap-4 px-5 py-4 items-start">
        <div className="min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className={`pill pill-${V.tone}`}>{V.icon} {V.label}</span>
            <TrustStamp
              kind={m.trust === "verified" ? "verified" : "needs"}
              label={m.trust === "verified" ? `Criteria verified · ${m.verifiedAt}` : `Awaiting verification · scraped ${m.scrapedAt}`}
            />
            <Pill tone="outline">{m.family}</Pill>
          </div>
          <h3 className="font-serif text-[20px] mt-2 leading-tight">{m.name}</h3>
          <div className="num-mono text-[11px] text-clay-700 mt-1">
            Apply by {m.deadline} · {m.vacancy.toLocaleString()} vacancies · attempts {m.attempts}
          </div>
          <p className="text-[12.5px] text-[#3a2e22] mt-2 max-w-[68ch]">{m.why}</p>
          <ul className="mt-3 grid sm:grid-cols-2 gap-x-5 gap-y-1.5 max-w-[680px]">
            {m.criteria.map((c, i) => (
              <li key={i} className="flex items-start gap-2 text-[12px]">
                <span
                  className="mt-1 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0"
                  style={{ background: c.ok === true ? "#54794E" : c.ok === false ? "#7A3925" : "#A68057", color: "#F0F5EF" }}
                >
                  {c.ok === true ? <Check /> : c.ok === false ? <Ex /> : <Tilde />}
                </span>
                <span className="text-[#3a2e22]">
                  <strong className="text-clay-900">{c.k}:</strong> {c.c} <span className="text-clay-700">· you: {c.you}</span>
                  {c.note ? <span className="block text-[11px] text-clay-700 mt-0.5">— {c.note}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          {m.blockedBy ? (
            <div className="mt-3 rounded-lg border border-dashed border-[#8F86A1] bg-[#FBF8F2] px-3 py-2 text-[11.5px] text-[#524864]">
              ⛔ {m.blockedBy} — we won't promote this to firm "eligible" until admin reviews.
            </div>
          ) : null}
          <div className="mt-3">
            <button onClick={onExpand} className="text-[11.5px] text-clay-700 hover:text-clay-900 underline underline-offset-2 decoration-dotted">
              {expanded ? "Hide reasoning" : "See engine reasoning →"}
            </button>
          </div>
          {expanded ? <MatchReasoning m={m} /> : null}
        </div>
        <div className="text-right shrink-0 lg:min-w-[160px]">
          <div className="num-mono text-[10.5px] text-clay-700">match strength</div>
          <div className="font-serif text-[24px] mt-1">{passes}/{total}</div>
          <div className="num-mono text-[10.5px] text-clay-700">rules passed</div>
          <div className="mt-4 flex flex-col gap-1.5">
            <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Save to tracker</button>
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Open details</button>
            {m.verdict === "not-eligible" ? (
              <button className="text-[11px] px-3 py-1.5 rounded-full border border-dashed border-[#D9B4A6] text-[#7A3925] font-semibold">Consider anyway</button>
            ) : null}
          </div>
        </div>
      </div>
    </article>
  );
}

function ProfileFacetsCard() {
  const p = ELIG_DATA.profile;
  return (
    <Card>
      <SectionHeaderLite
        eyebrow="Your profile · what we use"
        title={`${Math.round(p.completeness * 100)}% complete`}
        right={<button className="text-[11.5px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-clay-700 font-semibold">Edit</button>}
      />
      <div className="h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
        <div className="h-full bg-[#54794E]" style={{ width: `${p.completeness * 100}%` }} />
      </div>
      <ul className="mt-4 space-y-2">
        {p.facets.map((f, i) => (
          <li key={i} className="grid grid-cols-[110px_1fr_14px] gap-2 items-start text-[11.5px]">
            <span className="text-clay-700">{f.k}</span>
            <span className="text-clay-900">{f.v}</span>
            <span className={`mt-1 w-3 h-3 rounded-full ${f.state === "filled" ? "bg-[#54794E]" : "bg-[#C9B68F]"}`} />
          </li>
        ))}
      </ul>
      <div className="rule mt-4 pt-3 text-[11px] text-clay-700">
        Two facets missing reduce match precision. Adding them may unlock additional recruitments.
      </div>
    </Card>
  );
}

function RecentChangesCard() {
  return (
    <Card>
      <SectionHeaderLite eyebrow="Recent changes · 7d" title="Why your matches moved." right={<StatusDot state="live" label="" />} />
      <ul className="space-y-3">
        {ELIG_DATA.recent.map((r, i) => (
          <li key={i} className="border-l-2 border-[#E7DECB] pl-3 relative">
            <span
              className={`absolute -left-[5px] top-1 w-2 h-2 rounded-full ${
                r.kind === "verify" ? "bg-[#54794E]" : r.kind === "match" ? "bg-[#A68057]" : r.kind === "profile" ? "bg-[#8F86A1]" : "bg-[#BE9C6B]"
              }`}
            />
            <div className="num-mono text-[10.5px] text-clay-700">{r.at}</div>
            <div className="text-[12px] mt-0.5 text-clay-900">{r.text}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function EligibilityRulesCard() {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <Eyebrow dark>Rules the engine runs</Eyebrow>
      <h3 className="font-serif text-[18px] text-[#F3EADB] mt-1.5">Six checks per recruitment.</h3>
      <ul className="mt-3 space-y-1.5 text-[12px] text-[#D6BC93]">
        {[
          ["age", "with category / PwBD / ex-serviceman relaxations"],
          ["education", "level rank · percentage · CGPA fallback · discipline list"],
          ["attempts", "category-relaxed attempt limits"],
          ["credentials", "GATE / others when required"],
          ["nationality", "Indian + listed exceptions"],
          ["domicile", "state PSC · home-state benefit applied"],
        ].map(([k, v], i) => (
          <li key={i} className="grid grid-cols-[80px_1fr] gap-2">
            <span className="num-mono uppercase text-[#A68057] tracking-[0.08em] text-[10px] mt-0.5">{k}</span>
            <span>{v}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

// Local SectionHeader that doesn't force the shared 26px size — keeps sidebar cards compact.
function SectionHeaderLite({ eyebrow, title, sub, right }) {
  return (
    <div className="flex items-end justify-between gap-4 mb-3">
      <div>
        <Eyebrow>{eyebrow}</Eyebrow>
        <h2 className="font-serif text-[19px] mt-1 leading-tight">{title}</h2>
        {sub ? <p className="text-[12px] text-clay-700 mt-1">{sub}</p> : null}
      </div>
      {right || null}
    </div>
  );
}

export default function PrototypeEligibility() {
  const [filter, setFilter] = useState("all");
  const [open, setOpen] = useState(null);

  let rows = ELIG_DATA.matches.filter((m) => !m.hidden);
  if (filter === "eligible") rows = rows.filter((m) => m.verdict === "eligible");
  if (filter === "conditional") rows = rows.filter((m) => m.verdict === "conditional");
  if (filter === "not") rows = rows.filter((m) => m.verdict === "not-eligible");
  if (filter === "needs") rows = rows.filter((m) => m.trust === "needs");

  const opts = [
    { value: "all", label: "All", badge: ELIG_DATA.matches.filter((m) => !m.hidden).length },
    { value: "eligible", label: "Eligible", badge: ELIG_DATA.matches.filter((m) => m.verdict === "eligible").length },
    { value: "conditional", label: "Conditional", badge: ELIG_DATA.matches.filter((m) => m.verdict === "conditional").length },
    { value: "not", label: "Not eligible", badge: ELIG_DATA.matches.filter((m) => m.verdict === "not-eligible" && !m.hidden).length },
    { value: "needs", label: "Needs verification", badge: ELIG_DATA.matches.filter((m) => m.trust === "needs").length },
  ];

  return (
    <PrototypePage label="Eligibility · matches">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Eligibility · live matches"
          title="Recruitments matched to you, continuously."
          sub="The engine re-runs every time your profile changes or a recruitment's criteria changes. Each verdict shows the exact rules and which side is verified vs awaiting verification."
          right={
            <div className="text-right">
              <div className="num-mono text-[10.5px] text-clay-700">Last re-match {ELIG_DATA.engineMeta.lastRematch}</div>
              <div className="num-mono text-[10.5px] text-clay-700">{ELIG_DATA.engineMeta.version}</div>
              <div className="mt-2"><StatusDot state="live" label="Live · /api/eligibility/results/me" /></div>
            </div>
          }
        />
      </div>
      <div className="px-10 space-y-6">
        <EligKPIs />
        <div className="grid lg:grid-cols-[1fr_380px] gap-6 items-start">
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Tabs value={filter} onChange={setFilter} options={opts} />
              <div className="flex items-center gap-2">
                <div className="num-mono text-[10.5px] text-clay-700">Sort:</div>
                <Pill tone="outline">Deadline soonest</Pill>
                <Pill tone="outline">Match strength</Pill>
              </div>
            </div>
            <div className="space-y-3">
              {rows.map((m) => (
                <MatchCard key={m.id} m={m} expanded={open === m.id} onExpand={() => setOpen((o) => (o === m.id ? null : m.id))} />
              ))}
            </div>
          </div>
          <div className="space-y-6">
            <ProfileFacetsCard />
            <RecentChangesCard />
            <EligibilityRulesCard />
          </div>
        </div>
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
