import React from "react";
import { DATA } from "../data/core";
import { Card, Chip, Eyebrow, FooterStrip, PageHeader, Pill, PrototypePage, SectionHeader, StatusDot } from "../ui";

const COMPONENTS = [
  ["MissionControlHeader", "Today header + sync state", "screen-today"],
  ["ActivePlanCard", "Plan theme · target · phase pills", "screen-today"],
  ["SafeExplanationCard", "Plain-language signal chips", "screen-today"],
  ["StudyMetricCard", "Single KPI tile (used in MetricsRow)", "screen-today / review"],
  ["NextBestActionCard", "Dark CTA with reason chips", "screen-today"],
  ["StudyTaskCard / TaskReasoningDrawer", "Task row + expandable reasoning", "screen-today"],
  ["PlanReasoningCard", "Bulleted change list w/ live/preview dots", "screen-today"],
  ["StudyPolicyPreview", "Daily target · task mix · constraints", "screen-today"],
  ["TruthPanelCard", "Improved · declined · correction", "screen-today / review"],
  ["ExamContextCard", "Exam meta · verified counts", "screen-today"],
  ["CompetitionContextCard", "Preview-by-default competition data", "screen-today"],
  ["EngineTrace", "Animated 4-layer → plan diagram", "screen-today"],
  ["IntelligenceLayersPanel / LayerCard", "Four-up layer ledger", "screen-today"],
  ["UpdateIntelligencePanel / UpdateLane", "Trust-lane updates", "screen-today"],
  ["WeekTimeline / DayCell", "Mon→Sun plan strip", "screen-plan"],
  ["PlanAdaptationPreview / DiffSide", "Before/after preview", "screen-plan"],
  ["PlanChangeLogCard", "Plan mutation history", "screen-plan"],
  ["BacklogCard", "Carried-forward task list", "screen-plan"],
  ["SubjectCards", "Subject selector w/ mastery bar", "screen-subjects"],
  ["TopicTree / TopicRow", "Expandable topic + microtopic", "screen-subjects"],
  ["MasteryDistribution", "Subject mastery with target line", "screen-subjects"],
  ["NextRecommendedActions", "Per-subject action recommendation", "screen-subjects"],
  ["Timer ring + presets", "Focus timer 25/50/90", "screen-focus"],
  ["ReflectionDrawer", "Post-session reflection", "screen-focus"],
  ["MockList / MockAnalysis", "Mock log + subject breakdown", "screen-mocks"],
  ["ErrorPatternPanel", "Concept/calc/time/misread/guess", "screen-mocks"],
  ["ReviewNudge", "Direct, non-shaming review reminder", "screen-mocks"],
  ["CorrectionTasks", "Proposed tasks → add to today", "screen-mocks"],
  ["MockScoreTrend", "Inline SVG line chart", "screen-mocks"],
  ["WeekHeadlineRow", "6-up weekly KPIs", "screen-review"],
  ["ImprovedDeclined", "Side-by-side sage/rose cards", "screen-review"],
  ["NextWeekChangesCard", "Engine adaptation preview", "screen-review"],
  ["SourceTrustBadge", "Official/Aggregator/Research/Opportunity stamps", "primitives"],
  ["EvidenceDrawer", "Universal evidence list w/ source + trust", "primitives"],
  ["ConfidencePill", "Confidence + evidence count", "primitives"],
  ["StatusDot", "Live · Partial · Preview · Not connected", "primitives"],
  ["TrustStamp", "Locked · Verified · Needs verification · Preview", "primitives"],
  ["Chip (provenance)", "u· e· n· ⚙ · p· chips", "primitives"],
];

const SURFACE_MATRIX = [
  { s: "/app/today", t: "Mission Control overall", a: "live", e: "/api/study/mission-control" },
  { s: "/app/today", t: "Persona question card", a: "live", e: "/api/persona/next-question" },
  { s: "/app/today", t: "Competition context", a: "partial", e: "locked rows only · unlocked = preview" },
  { s: "/app/today", t: "Research signal nudges", a: "preview", e: "informational only" },
  { s: "/app/study-plan", t: "Week timeline", a: "live", e: "/api/study/plan/week" },
  { s: "/app/study-plan", t: "Plan adaptation preview", a: "preview", e: "engine v0.6.5 candidate — not persisted" },
  { s: "/app/study/subjects", t: "Subject cards / mastery", a: "live", e: "/api/study/subjects" },
  { s: "/app/study/subjects", t: "Topic tree (microtopic level)", a: "preview", e: "needs locked topics from /admin/exam-intelligence" },
  { s: "/app/study/focus", t: "Timer + presets", a: "live", e: "/api/study/focus/{start,stop}" },
  { s: "/app/study/focus", t: "Reflection drawer", a: "partial", e: "persists; signal-write path stubbed" },
  { s: "/app/study/mocks", t: "Mock log + correction tasks", a: "live", e: "/api/study/mocks" },
  { s: "/app/study/mocks", t: "Error-pattern auto-extraction", a: "preview", e: "requires answer-sheet parsing" },
  { s: "/app/study/review", t: "Weekly review summary", a: "live", e: "/api/study/weekly-review" },
  { s: "/app/study/review", t: "Apply next-week adaptation", a: "preview", e: "writes blocked behind admin/user gate" },
  { s: "/admin/exam-intelligence", t: "All 7 tabs (existing route)", a: "partial", e: "queue + lock writes available · topic coverage needs evidence drawer" },
  { s: "/admin/persona", t: "All sections (existing route)", a: "partial", e: "dimensions live · recompute queue is stub" },
];

const BACKEND_GAPS = [
  { area: "Engine trace", g: "Reasoning-trace per task is rendered from the task source chips. Backend should emit a structured `reasoning_trace` array with {layer, rule, evidence_id, confidence}." },
  { area: "Plan adaptation", g: "v0.6.5 candidate must be persisted as a plan-draft so 'Apply' is idempotent. Add `/api/study/plan/draft` + `/api/study/plan/apply`." },
  { area: "Plan change log", g: "Each mutation already emits an event — extend payload with `trigger.layer` and `evidence_id` so the UI can chip it." },
  { area: "Update intelligence trust gating", g: "Aggregator → official pairing is enforced in admin; aspirant API must filter aggregator updates that lack a paired official source." },
  { area: "Topic coverage", g: "`high_yield` must be a server-side derived flag = (status == 'locked'). Never trust client-side computed HY." },
  { area: "Competition", g: "Add `trust_status` to every metric. UI surfaces only `locked` to planner; rest stay preview." },
  { area: "Mock correction", g: "Error-pattern extraction needs an answer-sheet parser. Until then, errors are user-tagged at review time." },
  { area: "Reflection signal", g: "POST /api/study/focus/reflect — payload writes to persona-signal stream; recompute queues if delta > threshold." },
  { area: "Persona", g: "/api/persona/snapshot/:user returns dimensions + policy + evidence. Lock down with admin-only RBAC." },
  { area: "Plan impact rollouts", g: "Add rollout state machine: draft → staged(10%) → staged(50%) → live. Admin approval required at each step." },
  { area: "Evidence drawer", g: "Universal `/api/evidence/:kind/:id` endpoint so every TrustStamp can deep-link to its source." },
];

function Swatch({ c, l }) {
  return (
    <div className="text-center">
      <div style={{ background: c, width: 26, height: 26, borderRadius: 5, border: "1px solid rgba(46,34,24,0.08)" }} />
      <div className="num-mono text-[8px] text-clay-700 mt-1">{l}</div>
    </div>
  );
}

function PhoneToday() {
  return (
    <div className="phone-frame">
      <div className="eyebrow">Today · 06:30</div>
      <h3 className="font-serif text-[18px] mt-1 leading-tight">Federalism foundations + Mock 14</h3>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill tone="ink">UPSC CSE</Pill>
        <Pill tone="sage">Prelims</Pill>
        <Pill tone="clay">108d</Pill>
      </div>
      <div className="mt-3 rounded-xl bg-[#2E2218] text-[#F3EADB] p-3">
        <div className="num-mono text-[9px] tracking-[0.16em] text-[#D6BC93] uppercase">Next best · now</div>
        <div className="font-serif text-[14px] mt-1">Review M13 before tonight</div>
        <button className="mt-2 text-[10.5px] px-2.5 py-1 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold">Open →</button>
      </div>
      <div className="mt-3">
        <div className="eyebrow">7 tasks · 6.5h</div>
        {DATA.tasks.slice(0, 3).map((t) => (
          <div key={t.id} className="rounded-xl border border-[#E7DECB] bg-white/80 p-2.5 mt-2">
            <div className="flex items-center gap-2">
              <span className={`tick ${t.status === "done" ? "done" : ""}`} />
              <span className="num-mono text-[10px] text-clay-700">{t.time}</span>
              <span className="text-[11.5px] font-medium flex-1">{t.title.slice(0, 28)}…</span>
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {t.sources.slice(0, 2).map((s, i) => <Chip key={i} s={s} />)}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhonePlan() {
  return (
    <div className="phone-frame">
      <div className="eyebrow">Plan · this week</div>
      <h3 className="font-serif text-[18px] mt-1">May 13 → 19</h3>
      <div className="mt-3 space-y-2">
        {DATA.weekPlan.slice(0, 4).map((d, i) => (
          <div key={i} className={`rounded-xl border p-2.5 ${d.isToday ? "border-[#2E2218]" : "border-[#E7DECB]"}`}>
            <div className="flex items-center justify-between">
              <span className="num-mono text-[10.5px] text-clay-700">{d.day}</span>
              {d.isToday ? <Pill tone="ink">today</Pill> : null}
            </div>
            <div className="text-[12.5px] mt-0.5">{d.focus}</div>
            <div className="num-mono text-[10px] text-clay-700 mt-1">{d.tasks} tasks · {d.hours}h</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhoneMocks() {
  return (
    <div className="phone-frame">
      <div className="eyebrow">Mock · M13</div>
      <h3 className="font-serif text-[18px] mt-1">122 / 200 · unreviewed</h3>
      <div className="mt-3 rounded-xl bg-[#2E2218] text-[#F3EADB] p-3">
        <div className="font-serif text-[14px]">Review before next mock</div>
        <div className="text-[10.5px] text-[#D6BC93] mt-1">13 mocks taken · only 9 reviewed</div>
      </div>
      <div className="mt-3">
        <div className="eyebrow">Errors</div>
        <ul className="mt-2 space-y-1 text-[11.5px]">
          <li className="flex justify-between"><span>Concept gap</span><span className="num-mono">6</span></li>
          <li className="flex justify-between"><span>Time pressure</span><span className="num-mono">4</span></li>
          <li className="flex justify-between"><span>Misread</span><span className="num-mono">2</span></li>
        </ul>
      </div>
    </div>
  );
}

export default function PrototypeHandoff() {
  return (
    <PrototypePage label="Handoff & gaps">
      <div className="px-10 pt-9">
        <PageHeader
          eyebrow="Handoff · prototype docs"
          title="Everything you need to ship this."
          sub="Screen map · component inventory · design tokens · empty/error states · mobile views · backend gap list."
        />
      </div>
      <div className="px-10 space-y-6">
        <Card padded={false}>
          <div className="px-7 pt-6 pb-3">
            <Eyebrow>02 · Component inventory</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1">All design components in this prototype.</h2>
            <p className="text-[12px] text-clay-700 mt-1">Map cleanly onto the requested component list. Frontend can lift each as a real React component.</p>
          </div>
          <div className="px-2 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Component</th><th>Purpose</th><th>Lives in</th></tr></thead>
              <tbody>
                {COMPONENTS.map((c, i) => (
                  <tr key={i}>
                    <td><strong>{c[0]}</strong></td>
                    <td className="text-[#3a2e22]">{c[1]}</td>
                    <td><span className="num-mono text-clay-700">{c[2]}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader
            eyebrow="03 · Design tokens & layout notes"
            title="Aligned with current Career Copilot system."
            sub="Inter (body) + Fraunces (headings) + JetBrains Mono (data). HSL tokens for clay/sage/dusk. Cards: 18px radius, hairline borders, paper grain overlay."
          />
          <div className="grid lg:grid-cols-3 gap-5">
            <div>
              <Eyebrow>Color · clay</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["#FBF6EF", "#F3EADB", "#E7D6BA", "#D6BC93", "#BE9C6B", "#A68057", "#8A6846", "#6C5038", "#4E3A29", "#2E2218"].map((c, i) => (
                  <Swatch key={c} c={c} l={(i + 1) * 100 - (i === 0 ? 50 : 0)} />
                ))}
              </div>
              <Eyebrow className="mt-3">Color · sage</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["#F0F5EF", "#DAE7D6", "#B9CFAF", "#94B28A", "#719468", "#54794E", "#41603D", "#33482F", "#263623", "#172017"].map((c, i) => (
                  <Swatch key={c} c={c} l={(i + 1) * 100 - (i === 0 ? 50 : 0)} />
                ))}
              </div>
              <Eyebrow className="mt-3">Color · dusk</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {["#F2F1F4", "#DDDAE3", "#B7B0C4", "#8F86A1", "#6D637F", "#524864", "#40384E", "#31293B", "#221D2A", "#141018"].map((c, i) => (
                  <Swatch key={c} c={c} l={(i + 1) * 100 - (i === 0 ? 50 : 0)} />
                ))}
              </div>
            </div>
            <div>
              <Eyebrow>Type scale</Eyebrow>
              <div className="mt-3 space-y-1.5">
                <div className="font-serif text-[40px] leading-none">H1 · 40 / -2%</div>
                <div className="font-serif text-[26px] leading-none">H2 · 26 / -2%</div>
                <div className="font-serif text-[20px] leading-none">H3 · 20 / -2%</div>
                <div className="text-[15px]">Body · 15 / 1.55</div>
                <div className="text-[13px] text-[#3a2e22]">Caption · 13 / 1.5</div>
                <div className="num-mono text-[11px] text-clay-700">mono · 11 · data</div>
                <div className="eyebrow">eyebrow · 10.5 · 0.22em</div>
              </div>
            </div>
            <div>
              <Eyebrow>Surface tokens</Eyebrow>
              <ul className="mt-3 text-[12.5px] space-y-1.5 text-[#3a2e22]">
                <li>· soft-card · rgba(255,253,248,0.92), border #E7DECB, radius 18, shadow soft</li>
                <li>· hairline · linear-gradient ↔ #D6C9AC center</li>
                <li>· linen-bg · radial clay + sage + clay washes</li>
                <li>· paper-grid · 28px cell @ 2.5% ink</li>
                <li>· grain · 5% turbulence multiply</li>
              </ul>
            </div>
          </div>
        </Card>

        <Card>
          <SectionHeader eyebrow="06 · Mobile responsive" title="Stacked cards. Sticky next-best-action." sub="Designed at 360px." />
          <div className="flex gap-6 flex-wrap items-start">
            <PhoneToday />
            <PhonePlan />
            <PhoneMocks />
          </div>
        </Card>

        <Card padded={false}>
          <div className="px-7 pt-6 pb-3">
            <Eyebrow>07 · Surface matrix · live vs preview vs future</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1">Where each UI panel actually stands.</h2>
          </div>
          <div className="px-2 overflow-x-auto">
            <table className="tbl">
              <thead><tr><th>Screen</th><th>Surface</th><th>State</th><th>Backend / note</th></tr></thead>
              <tbody>
                {SURFACE_MATRIX.map((r, i) => (
                  <tr key={i}>
                    <td><span className="num-mono text-clay-700">{r.s}</span></td>
                    <td>{r.t}</td>
                    <td><StatusDot state={r.a} /></td>
                    <td className="text-clay-700 text-[11.5px]">{r.e}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>

        <Card>
          <SectionHeader
            eyebrow="08 · Backend gaps"
            title="What's needed to make every section live."
            sub="Frontend can ship behind feature flags. Each gap below maps to a clear endpoint or contract."
          />
          <ul className="space-y-3">
            {BACKEND_GAPS.map((g, i) => (
              <li key={i} className="grid grid-cols-[160px_1fr] gap-4 items-start">
                <span className="num-mono text-[11.5px] text-clay-700">{g.area}</span>
                <span className="text-[13px] text-clay-900">{g.g}</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card className="!bg-[#2E2218] !border-[#2E2218]">
          <Eyebrow dark>09 · Handoff note for frontend</Eyebrow>
          <h2 className="font-serif text-[24px] text-[#F3EADB] mt-1.5">Ship calmly. Ship in layers.</h2>
          <ol className="mt-4 grid sm:grid-cols-2 gap-x-6 gap-y-2 text-[13px] text-[#D6BC93] list-decimal pl-5">
            <li>Lift the primitives first (TrustStamp, StatusDot, Chip, ConfidencePill, EvidenceDrawer).</li>
            <li>Standardize "live / partial / preview / not-connected" as a top-level surfaceState returned by every endpoint.</li>
            <li>Render the task reasoning trace from task.reasoning_trace[] — never re-derive on the client.</li>
            <li>Treat high_yield, verified, locked as backend-only labels. UI may not compute them.</li>
            <li>The 4-layer engine trace is a diagram of what the backend already does. Fall back to a static SVG if perf is tight.</li>
            <li>Mobile: stack everything. Engine trace becomes a compact chip strip.</li>
            <li>Admin pages are evidence-heavy by design. Don't shrink table density to look balanced.</li>
            <li>No motivational copy. The truth panel is the model — be calm, accurate, and never gamify.</li>
          </ol>
        </Card>
      </div>
      <FooterStrip />
    </PrototypePage>
  );
}
