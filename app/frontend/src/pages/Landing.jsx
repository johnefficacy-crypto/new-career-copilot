import React, { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAuth } from "../lib/authContext";

/* =====================================================================
 *  Career Copilot homepage
 *  Ported from the UI prototype (docs/reference/UI_claude-code/home.jsx —
 *  index.html) into the production app. The prototype is the visual source
 *  of truth; links/CTAs are wired to the real routes and auth state.
 *  Sections: Nav · Hero · Trust ribbon · Pillars · How it works (animated)
 *           Eligibility engine · Explore screens · Trust deep-dive · Exams
 *           Pricing · FAQ · CTA · Footer
 * ===================================================================== */

const PROTOTYPE_HOME = "/app/today";

function layerGlyph(layer) {
  if (layer === "user") return "u·";
  if (layer === "exam") return "e·";
  if (layer === "update") return "n·";
  return "⚙";
}

/* ----------------------------------------------------------------- *
 *  NAV
 * ----------------------------------------------------------------- */
function Nav() {
  const auth = useAuth();
  return (
    <header className="nav-glass sticky top-0 z-30">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 h-[64px] flex items-center justify-between">
        <Link to="/" data-testid="logo-home" className="flex items-center gap-2.5">
          <div className="w-8 h-8 rounded-lg bg-[#2E2218] flex items-center justify-center">
            <span className="font-serif text-[15px] text-[#F3EADB] leading-none">cc</span>
          </div>
          <div className="leading-tight">
            <div className="font-serif text-[16px]">Career Copilot</div>
            <div className="num-mono text-[9.5px] text-[#6C5038] tracking-[0.1em] -mt-0.5">study os</div>
          </div>
        </Link>
        <nav className="hidden md:flex items-center gap-7 text-[13.5px] text-[#3a2e22]">
          <a href="#how" className="link-under">How it works</a>
          <a href="#eligibility" className="link-under">Eligibility</a>
          <a href="#trust" className="link-under">Trust &amp; sources</a>
          <a href="#exams" className="link-under">Exams</a>
          <a href="#pricing" className="link-under">Pricing</a>
          <Link to={PROTOTYPE_HOME} className="link-under text-[#6C5038]">See the prototype →</Link>
        </nav>
        <div className="flex items-center gap-2">
          {auth.isAuthed ? (
            <Link to="/app" data-testid="nav-app-link" className="btn btn-primary">
              Open app
            </Link>
          ) : (
            <>
              <Link to="/login" data-testid="nav-login" className="btn btn-ghost hidden sm:inline-flex">
                Sign in
              </Link>
              <Link to="/app/onboarding/chat?mode=discovery" data-testid="nav-signup" className="btn btn-primary">
                Start free
              </Link>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------------- *
 *  HERO
 * ----------------------------------------------------------------- */
function Hero() {
  return (
    <section id="top" className="relative overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 pt-16 pb-20 grid grid-cols-1 lg:grid-cols-[1.05fr_1fr] gap-12 items-center">
        <div className="relative">
          <div
            data-testid="hero-tag"
            className="inline-flex items-center gap-2 px-3 py-1.5 rounded-full border border-[#E7DECB] bg-white/60 text-[12px] text-[#6C5038]"
          >
            <span className="w-2 h-2 rounded-full bg-[#54794E] inline-block pulse-dot" />
            <span>Built for UPSC · SSC · Banking · State PSC aspirants</span>
          </div>
          <h1 className="font-serif text-[52px] lg:text-[64px] leading-[1.02] mt-5 text-balance">
            An operating system
            <br />
            for exam prep.
          </h1>
          <p className="text-[17px] text-[#3a2e22] mt-5 max-w-[55ch] leading-relaxed">
            Career Copilot converts <strong>verified exam signals</strong> and your{" "}
            <strong>personal progress</strong> into one concrete plan a day. No content firehose. No
            motivational fluff. No "AI says so" without showing the work.
          </p>
          <div className="mt-7 flex gap-3 flex-wrap">
            <Link to="/app/onboarding/chat?mode=discovery" data-testid="hero-cta-signup" className="btn btn-primary">
              Start free · pick your exam
            </Link>
            <Link to={PROTOTYPE_HOME} data-testid="hero-cta-login" className="btn btn-ghost">
              See a real day →
            </Link>
          </div>
          <div className="mt-7 grid grid-cols-3 gap-6 max-w-[480px]">
            <Stat n="184" l="verified topics" />
            <Stat n="14" l="recruitments continuously matched" />
            <Stat n="0" l="aggregator items applied silently" />
          </div>
        </div>

        <div className="relative">
          <HeroPreview />
        </div>
      </div>
    </section>
  );
}

function Stat({ n, l }) {
  return (
    <div className="border-t border-[#E7DECB] pt-3">
      <div className="font-serif text-[28px] leading-none">{n}</div>
      <div className="text-[11.5px] text-[#6C5038] mt-2 leading-snug">{l}</div>
    </div>
  );
}

/* Hero preview — a stylized mini-Today panel */
function HeroPreview() {
  const tasks = [
    {
      time: "06:30",
      title: "Polity · Federalism — concept revision",
      chips: [
        { l: "user", t: "weak" },
        { l: "engine", t: "spaced" },
        { l: "exam", t: "PYQ-heavy" },
      ],
      done: true,
    },
    {
      time: "10:00",
      title: "Modern History · Revolts of 1857 — deep read",
      chips: [
        { l: "exam", t: "prereq" },
        { l: "engine", t: "pre-mock" },
      ],
      one: true,
    },
    {
      time: "19:30",
      title: "Full-length Mock 14 — Prelims P1",
      chips: [
        { l: "user", t: "cadence" },
        { l: "exam", t: "phase" },
      ],
    },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-8 dotted opacity-50 pointer-events-none" />
      <div className="relative soft-card grain p-5 lift">
        <div className="flex items-center justify-between">
          <div>
            <div className="eyebrow">Today · Tue, May 14</div>
            <div className="font-serif text-[20px] mt-1.5">
              Federalism foundations
              <br />+ Mock 14 prep
            </div>
          </div>
          <div className="text-right">
            <div className="num-mono text-[10px] text-[#6C5038]">7 tasks · 6.5h</div>
            <div className="mt-1 inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#54794E] pulse-dot" />
              <span className="num-mono text-[10px] text-[#33482F]">live</span>
            </div>
          </div>
        </div>

        <div className="hairline my-4" />

        {tasks.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[18px_50px_1fr] gap-3 py-2.5 border-t border-[#EFE7D4] first:border-0"
          >
            <span className={`tick mt-1 ${t.done ? "done" : ""}`} />
            <span className="num-mono text-[11px] text-[#6C5038] pt-1">{t.time}</span>
            <div>
              <div className={`text-[13px] ${t.done ? "line-through text-[#A68057]" : "font-medium"}`}>
                {t.title}
              </div>
              <div className="mt-1.5 flex flex-wrap gap-1">
                {t.chips.map((c, j) => (
                  <span key={j} className={`chip chip-${c.l}`}>
                    <span style={{ opacity: 0.6, fontWeight: 700 }}>{layerGlyph(c.l)}</span>
                    {c.t}
                  </span>
                ))}
                {t.one && <span className="pill pill-ink">One thing today</span>}
              </div>
            </div>
          </div>
        ))}

        <div className="hairline my-3" />
        <div className="flex items-center justify-between text-[11px]">
          <div className="text-[#6C5038]">Why this plan? · 41 signals · 7 rules fired</div>
          <Link to={PROTOTYPE_HOME} className="text-[#2E2218] font-semibold link-under">
            Open today →
          </Link>
        </div>
      </div>

      {/* Floating verified seal callout */}
      <div
        className="absolute -left-6 lg:-left-10 top-12 soft-card grain p-3 pr-5 flex items-center gap-3 lift"
        style={{ maxWidth: 260 }}
      >
        <span
          className="seal-verified inline-flex items-center justify-center rounded-full"
          style={{ width: 28, height: 28 }}
        >
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
            <path
              d="M3 8.4 6.4 11.5 13 4.6"
              stroke="#F0F5EF"
              strokeWidth="2.2"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </span>
        <div>
          <div className="num-mono text-[9.5px] text-[#33482F] tracking-[0.16em]">OFFICIALLY VERIFIED</div>
          <div className="text-[12.5px] font-medium leading-snug">CSE 2026 form opens May 22</div>
        </div>
      </div>

      {/* Floating engine status */}
      <div
        className="absolute -right-2 lg:-right-6 bottom-8 soft-card grain px-4 py-3 lift"
        style={{ maxWidth: 240 }}
      >
        <div className="eyebrow">Engine</div>
        <div className="text-[12.5px] mt-1">7 rules fired · 4 layers used</div>
        <div className="mt-2 flex gap-1">
          {["u", "e", "n", "⚙"].map((g, i) => (
            <span
              key={i}
              className={`chip ${
                i === 0 ? "chip-user" : i === 1 ? "chip-exam" : i === 2 ? "chip-update" : "chip-engine"
              }`}
              style={{ padding: "2px 6px" }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  TRUST RIBBON · ticker
 * ----------------------------------------------------------------- */
function TrustRibbon() {
  const items = [
    { kind: "verified", text: "UPSC CSE 2026 notification · verified May 12" },
    { kind: "verified", text: "SSC CGL 2026 cycle dates · verified May 09" },
    { kind: "needs", text: "Admit-card rumor · awaiting official source" },
    { kind: "verified", text: "Public Admin syllabus addendum · 4 µtopics locked" },
    { kind: "needs", text: "Polity weightage shift · research-only, no plan change" },
    { kind: "verified", text: "RBI Grade B 2026 cycle · verified May 11" },
  ];
  return (
    <div className="border-y border-[#E7DECB] bg-[#FBF8F2] overflow-hidden">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-3 flex items-center gap-6">
        <div className="shrink-0 num-mono text-[10.5px] text-[#6C5038] tracking-[0.16em] uppercase whitespace-nowrap">
          Last 7 days · trust feed
        </div>
        <div className="overflow-hidden flex-1">
          <div className="marquee">
            {[...items, ...items].map((it, i) => (
              <span key={i} className="inline-flex items-center gap-2 text-[12.5px]">
                <span className={`stamp ${it.kind === "verified" ? "stamp-verified" : "stamp-needs"}`}>
                  {it.kind === "verified" ? "Official" : "Aggregator"}
                </span>
                <span className="text-[#3a2e22]">{it.text}</span>
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  PILLARS · the 4 intelligence layers
 * ----------------------------------------------------------------- */
function Pillars() {
  const pillars = [
    {
      k: "01",
      glyph: "u·",
      color: "#ECE7F2",
      border: "#8F86A1",
      title: "User intelligence",
      sub: "Your data, only your data.",
      body: "Action profile, study history, mock history, focus consistency, weak topics, available hours. Nothing left for you to manually type each morning.",
      bullets: ["Action profile", "Study + mock history", "Focus consistency", "Available hours"],
    },
    {
      k: "02",
      glyph: "e·",
      color: "#E4EDE0",
      border: "#94B28A",
      title: "Exam intelligence",
      sub: "Verified by humans, not scraped.",
      body: "Syllabus tree, microtopics, locked PYQ tags, prerequisite graph, exam calendar. Topics aren't called high-yield until a curator locks them.",
      bullets: ["Locked PYQ tags", "Syllabus + microtopics", "Prerequisite graph", "Calendar"],
    },
    {
      k: "03",
      glyph: "n·",
      color: "#F1E1CD",
      border: "#D6BC93",
      title: "Update intelligence",
      sub: "Four trust lanes. Strict separation.",
      body: "Official updates are auto-applied after review. Aggregator reports are surfaced separately. Research is hint-only. Opportunity is adjacent — never silent.",
      bullets: [
        "Official · auto-apply",
        "Aggregator · discovery",
        "Research · hint only",
        "Opportunity · adjacent",
      ],
    },
    {
      k: "04",
      glyph: "⚙",
      color: "#2E2218",
      border: "#2E2218",
      dark: true,
      title: "Study OS engine",
      sub: "Compiles a plan. Shows its work.",
      body: "Prioritization, spaced revision, weak-area drills, mock cadence, daily compiler, weekly correction. Every task carries a reasoning trace.",
      bullets: ["Daily compiler", "Spaced revision", "Weak-area drills", "Weekly correction"],
    },
  ];
  return (
    <section className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
      <SectionHeader
        eyebrow="What's under the hood"
        title="Four intelligence layers, one daily plan."
        sub="Every recommendation answers five questions — who, what exam, what update, what's verified, what's still preview. You see all five."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mt-10">
        {pillars.map((p, i) => (
          <PillarCard key={i} p={p} />
        ))}
      </div>
    </section>
  );
}

function PillarCard({ p }) {
  const chipLayer = p.k === "01" ? "user" : p.k === "02" ? "exam" : p.k === "03" ? "update" : "engine";
  return (
    <div
      className={`relative rounded-2xl border p-6 lift ${p.dark ? "text-[#F3EADB]" : "text-[#2E2218]"}`}
      style={{ background: p.color, borderColor: p.border }}
    >
      <div className="flex items-center gap-2">
        <span className={`chip chip-${chipLayer}`} style={{ padding: "4px 8px", fontSize: 11 }}>
          {p.glyph}
        </span>
        <span
          className={`num-mono text-[10px] ${p.dark ? "text-[#D6BC93]" : "text-[#6C5038]"} tracking-[0.16em]`}
        >
          {p.k}
        </span>
      </div>
      <h3 className={`font-serif text-[22px] mt-3 leading-tight ${p.dark ? "text-[#F3EADB]" : ""}`}>
        {p.title}
      </h3>
      <div className={`text-[12.5px] mt-1 ${p.dark ? "text-[#D6BC93]" : "text-[#6C5038]"}`}>{p.sub}</div>
      <p className={`text-[13.5px] mt-4 leading-relaxed ${p.dark ? "text-[#D6BC93]" : "text-[#3a2e22]"}`}>
        {p.body}
      </p>
      <ul className={`mt-5 space-y-1.5 text-[12.5px] ${p.dark ? "text-[#F3EADB]" : "text-[#2E2218]"}`}>
        {p.bullets.map((b, i) => (
          <li key={i} className="flex items-center gap-2">
            <span className={`w-1 h-1 rounded-full ${p.dark ? "bg-[#D6BC93]" : "bg-[#A68057]"}`} />
            <span>{b}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  HOW IT WORKS · auto-cycling animated cards
 * ----------------------------------------------------------------- */
function HowItWorks() {
  const STEPS = [
    { id: "capture", title: "Capture signals", sub: "Four layers feed in.", visual: <StepVisualCapture /> },
    {
      id: "compile",
      title: "Engine compiles",
      sub: "Rules fire. Conflicts resolve.",
      visual: <StepVisualCompile />,
    },
    { id: "plan", title: "Today's plan", sub: "One compiled day, every morning.", visual: <StepVisualPlan /> },
    { id: "adapt", title: "Adapt weekly", sub: "Weekly review closes the loop.", visual: <StepVisualAdapt /> },
  ];
  const [active, setActive] = useState(0);
  const [paused, setPaused] = useState(false);
  const [progress, setProgress] = useState(0);
  const STEP_MS = 5200;

  useEffect(() => {
    if (paused) return undefined;
    const tick = setInterval(() => {
      setProgress((p) => {
        if (p >= 100) {
          setActive((a) => (a + 1) % STEPS.length);
          return 0;
        }
        return p + 100 / (STEP_MS / 60);
      });
    }, 60);
    return () => clearInterval(tick);
  }, [paused, active, STEPS.length]);

  function pick(i) {
    setActive(i);
    setProgress(0);
  }

  return (
    <section id="how" className="bg-[#FBF8F2] border-y border-[#E7DECB]">
      <div
        className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <SectionHeader
          eyebrow="How it works"
          title="From raw signals to a calm next action."
          sub="No black box. Hover to pause. Click any step to inspect."
        />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-8">
          {/* Step tabs */}
          <div className="space-y-3">
            {STEPS.map((s, i) => (
              <button
                key={s.id}
                type="button"
                onClick={() => pick(i)}
                className={`step-tab w-full ${active === i ? "active" : ""}`}
              >
                <span className="step-num">{String(i + 1).padStart(2, "0")}</span>
                <span className="flex-1">
                  <span
                    className={`block font-serif text-[18px] leading-tight ${
                      active === i ? "text-[#F3EADB]" : "text-[#2E2218]"
                    }`}
                  >
                    {s.title}
                  </span>
                  <span className="step-sub block text-[12px] mt-0.5 text-[#6C5038]">{s.sub}</span>
                  {active === i && (
                    <span className="step-progress mt-2 block w-full">
                      <i style={{ width: `${progress}%` }} />
                    </span>
                  )}
                </span>
              </button>
            ))}
            <div className="text-[11.5px] text-[#6C5038] pl-1 pt-2">
              Auto-cycling ·{" "}
              {paused ? (
                <em>paused</em>
              ) : (
                <span>{Math.max(0, Math.round((STEP_MS * (1 - progress / 100)) / 1000))}s to next</span>
              )}
            </div>
          </div>

          {/* Visual canvas */}
          <div className="relative">
            <div className="soft-card grain p-7 min-h-[460px] relative overflow-hidden">
              <div key={active} className="drift-in">
                <div className="flex items-start justify-between">
                  <div>
                    <div className="eyebrow">
                      Step {String(active + 1).padStart(2, "0")} · {STEPS[active].id}
                    </div>
                    <h3 className="font-serif text-[28px] mt-1.5 leading-tight">{STEPS[active].title}</h3>
                    <p className="text-[13.5px] text-[#3a2e22] mt-2 max-w-[48ch]">{STEPS[active].sub}</p>
                  </div>
                  <div className="num-mono text-[10px] text-[#6C5038]">
                    step {active + 1}/{STEPS.length}
                  </div>
                </div>
                <div className="hairline my-5" />
                <div className="mt-2">{STEPS[active].visual}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* --- How-it-works visuals --- */

function StepVisualCapture() {
  const signals = [
    { layer: "user", label: "Morning consistency: 82% (4/5 days)", t: 200 },
    { layer: "user", label: "Weak topics: Polity · Modern · Economy", t: 600 },
    { layer: "exam", label: "UPSC CSE 2026 · Prelims · 108d", t: 1000 },
    { layer: "exam", label: "Verified PYQ: Federalism · Centre-State", t: 1400 },
    { layer: "update", label: "Official: CSE 2026 form opens May 22", t: 1800 },
    { layer: "update", label: "Aggregator: admit-card rumor (held)", t: 2200 },
    { layer: "engine", label: "Engine rule: spaced revision due ×3", t: 2600 },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6 items-start">
      <ul className="space-y-2">
        {signals.map((s, i) => (
          <li
            key={i}
            className="flex items-center gap-3 text-[13px] drift-in"
            style={{ animationDelay: `${s.t}ms` }}
          >
            <span className={`chip chip-${s.layer}`} style={{ minWidth: 46, justifyContent: "center" }}>
              {layerGlyph(s.layer)} {s.layer}
            </span>
            <span className="text-[#3a2e22]">{s.label}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-[#E7DECB] bg-[#FBF6EF] p-4">
        <div className="eyebrow">Sources</div>
        <ul className="mt-2 text-[11.5px] space-y-1 text-[#6C5038]">
          <li>· You · device + study log</li>
          <li>· Admin · /exam-intelligence</li>
          <li>· Official · upsc.gov.in</li>
          <li>· Engine · derived</li>
        </ul>
      </div>
    </div>
  );
}

function StepVisualCompile() {
  const rules = [
    { name: "spaced_revision_due", layer: "engine", note: "Polity Ch.4 · 3rd encounter", fired: true },
    { name: "review_before_mock", layer: "engine", note: "Mock 13 unreviewed · 3d", fired: true },
    { name: "weak_topic_drill", layer: "engine", note: "Federalism · 1 cycle", fired: true },
    { name: "prereq_unblock", layer: "exam", note: "Modern · 1857 → next 3 topics", fired: true },
    { name: "calendar_ack", layer: "update", note: "CSE 2026 form open May 22", fired: true },
    {
      name: "pattern_research",
      layer: "update",
      note: "Polity weightage hint",
      fired: false,
      reason: "research-only · no plan change",
    },
    {
      name: "aggregator_promote",
      layer: "update",
      note: "Admit-card rumor",
      fired: false,
      reason: "awaits official source",
    },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6">
      <ul className="space-y-2">
        {rules.map((r, i) => (
          <li
            key={i}
            className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2] px-3.5 py-2.5 drift-in"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0">
                <span className={`chip chip-${r.layer}`}>
                  {layerGlyph(r.layer)} {r.layer}
                </span>
                <span className="font-mono text-[12px] truncate">{r.name}</span>
              </div>
              {r.fired ? (
                <span className="stamp stamp-verified">fired</span>
              ) : (
                <span className="stamp stamp-needs">held</span>
              )}
            </div>
            <div className="text-[11.5px] text-[#6C5038] mt-1.5 pl-1">
              {r.note}
              {r.reason ? ` · ${r.reason}` : ""}
            </div>
          </li>
        ))}
      </ul>
      <div className="rounded-xl border border-[#2E2218] bg-[#2E2218] text-[#F3EADB] p-4">
        <div className="num-mono text-[9.5px] text-[#D6BC93] tracking-[0.18em] uppercase">Engine v0.6</div>
        <div className="font-serif text-[20px] mt-1">
          7 rules
          <br />
          fired
        </div>
        <div className="text-[11px] text-[#D6BC93] mt-2">2 held back · trust policy</div>
        <div
          className="hairline my-3"
          style={{ background: "linear-gradient(90deg,transparent,#4E3A29,transparent)" }}
        />
        <div className="text-[11px] text-[#D6BC93]">41 signals → 7 tasks · 6.5h</div>
      </div>
    </div>
  );
}

function StepVisualPlan() {
  const tasks = [
    { time: "06:30", title: "Polity · Federalism revision", tag: "spaced", done: true },
    { time: "07:30", title: "CA · Monetary policy digest", tag: "update", done: true },
    { time: "10:00", title: "Modern History · Revolts of 1857", tag: "prereq", one: true },
    { time: "11:30", title: "Mains drill · GS-2 federalism", tag: "weak" },
    { time: "19:30", title: "Full-length Mock 14", tag: "cadence" },
    { time: "21:00", title: "Spaced revision · Polity Ch.4", tag: "carried" },
  ];
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-6">
      <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-3">
        {tasks.map((t, i) => (
          <div
            key={i}
            className="grid grid-cols-[18px_50px_1fr_auto] gap-3 py-2 items-center border-t border-[#EFE7D4] first:border-0 drift-in"
            style={{ animationDelay: `${i * 120}ms` }}
          >
            <span className={`tick ${t.done ? "done" : ""}`} />
            <span className="num-mono text-[11px] text-[#6C5038]">{t.time}</span>
            <span className={`text-[13px] ${t.done ? "line-through text-[#A68057]" : ""}`}>{t.title}</span>
            <span className="flex gap-1.5">
              {t.one && <span className="pill pill-ink">One thing</span>}
              <span className="pill pill-outline">{t.tag}</span>
            </span>
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-[#E7DECB] bg-[#FBF6EF] p-4">
        <div className="eyebrow">Today</div>
        <div className="font-serif text-[24px] mt-1">7 tasks</div>
        <div className="num-mono text-[11px] text-[#6C5038] mt-1">6.5h focus · 4 chips per task</div>
        <div className="hairline my-3" />
        <div className="text-[11px] text-[#6C5038]">Tap any task → see exact reasoning</div>
      </div>
    </div>
  );
}

function StepVisualAdapt() {
  return (
    <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr_180px] gap-4">
      <div className="rounded-xl border border-[#B9CFAF] bg-[#F0F5EF] p-4">
        <div className="eyebrow !text-[10px] !text-[#33482F]">Improved</div>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-[#33482F]">
          <li>· Morning consistency · 4/5 days</li>
          <li>· Polity mastery 48% → 56%</li>
          <li>· Daily adherence +4pp</li>
        </ul>
      </div>
      <div className="rounded-xl border border-[#D9B4A6] bg-[#F2DDD6] p-4">
        <div className="eyebrow !text-[10px] !text-[#7A3925]">Declined</div>
        <ul className="mt-2 space-y-1.5 text-[12.5px] text-[#7A3925]">
          <li>· Mains practice 3 → 1/wk</li>
          <li>· Mock review latency 2.4 → 3.1d</li>
        </ul>
      </div>
      <div className="rounded-xl border border-[#2E2218] bg-[#2E2218] text-[#F3EADB] p-4">
        <div className="num-mono text-[9.5px] text-[#D6BC93] tracking-[0.18em] uppercase">Next week</div>
        <div className="font-serif text-[16px] mt-1.5 leading-snug">Lock GS-2 drill · pause new Polity</div>
        <div className="text-[10.5px] text-[#D6BC93] mt-2">Preview · you approve</div>
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  ELIGIBILITY ENGINE
 * ----------------------------------------------------------------- */
function EligibilityEngine() {
  const SCENARIOS = [
    {
      title: "You complete your profile.",
      sub: "Age, category, education, domicile, GATE — once. We re-match every time it changes.",
      delta: "11 eligible · 2 conditional",
      facets: ["age 24", "OBC-NCL", "B.Tech CSE 78%", "UP", "Indian", "GATE CS 720"],
      flips: [
        { name: "UPSC CSE 2026", to: "eligible", note: "all 5 rules pass" },
        { name: "SBI PO 2026", to: "eligible", note: "graduate · age 24" },
        { name: "UPPSC 2026", to: "eligible", note: "+ UP-domicile benefit" },
      ],
    },
    {
      title: "You add a credential.",
      sub: "GATE 2024 scorecard uploaded → engine re-runs the credentials rule across all open recruitments.",
      delta: "+ 2 newly eligible",
      facets: ["…", "GATE CS 720", "credentials rule re-ran"],
      flips: [
        { name: "ISRO Scientist (CS)", to: "eligible", note: "GATE 720 qualifies for shortlist" },
        { name: "BARC OCES 2026", to: "conditional", note: "GATE-pathway awaits admin verification" },
      ],
    },
    {
      title: "Admin verifies a criterion.",
      sub: "A scraped criterion gets reviewer-locked in /admin/eligibility → conditional verdicts firm up.",
      delta: "1,722 verdicts firm",
      facets: ["BARC GATE-pathway", "admin: ✓ verify", "engine re-runs"],
      flips: [
        { name: "BARC OCES 2026", to: "eligible", note: "criterion verified · 0x4f·b2 sig" },
        { name: "+ 1,721 other aspirants", to: "eligible", note: "batched recompute · 04:48 IST" },
      ],
    },
    {
      title: "A new recruitment opens.",
      sub: "Scraper picks it up → engine matches it against you before you read the notification.",
      delta: "1 new opportunity",
      facets: ["RBI Grade B 2026", "scraped · awaiting review", "conditional verdict"],
      flips: [
        { name: "RBI Grade B 2026", to: "conditional", note: "all rules pass · awaits admin verification" },
        { name: "…within 24h", to: "eligible", note: "admin verifies → notification dispatched" },
      ],
    },
  ];
  const [scenario, setScenario] = useState(0);
  const [paused, setPaused] = useState(false);
  const S = SCENARIOS[scenario];

  useEffect(() => {
    if (paused) return undefined;
    const id = setInterval(() => setScenario((s) => (s + 1) % SCENARIOS.length), 5800);
    return () => clearInterval(id);
  }, [paused, SCENARIOS.length]);

  return (
    <section id="eligibility" className="bg-[#FBF8F2] border-y border-[#E7DECB]">
      <div
        className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20"
        onMouseEnter={() => setPaused(true)}
        onMouseLeave={() => setPaused(false)}
      >
        <SectionHeader
          eyebrow="Eligibility engine"
          title={
            <>
              Matched the moment <em>anything</em> changes.
            </>
          }
          sub="Tell us your profile once. We scrape open recruitments, an admin verifies the criteria, and the engine continuously checks all six rules — age, education, attempts, credentials, nationality, domicile — against you. You see a verdict, and exactly which rule produced it."
        />

        <div className="mt-10 grid grid-cols-1 lg:grid-cols-[1fr_460px] gap-8 items-start">
          {/* Left: animated scenario theatre */}
          <div className="soft-card grain p-7 min-h-[420px] relative overflow-hidden">
            <div className="flex items-center justify-between gap-4">
              <div className="num-mono text-[10.5px] text-[#6C5038] tracking-[0.18em] uppercase">
                Live scenario · auto-cycling
              </div>
              <div className="flex items-center gap-1.5">
                {SCENARIOS.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setScenario(i)}
                    aria-label={`Scenario ${i + 1}`}
                    className={`h-2 rounded-full transition-all ${
                      i === scenario ? "w-8 bg-[#2E2218]" : "w-2 bg-[#D6C9AC]"
                    }`}
                  />
                ))}
              </div>
            </div>

            <div key={scenario} className="drift-in mt-4">
              <h3 className="font-serif text-[28px] leading-tight">{S.title}</h3>
              <p className="text-[13.5px] text-[#3a2e22] mt-2 max-w-[56ch]">{S.sub}</p>

              {/* Mini engine diagram */}
              <div className="mt-6 grid grid-cols-[1fr_60px_1fr] gap-3 items-stretch">
                {/* Profile facets */}
                <div className="rounded-xl border border-[#8F86A1] bg-[#ECE7F2] p-4">
                  <div className="num-mono text-[9.5px] text-[#31293B] tracking-[0.16em] uppercase">
                    Your profile
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {S.facets.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-[12.5px] text-[#31293B] drift-in"
                        style={{ animationDelay: `${100 + i * 120}ms` }}
                      >
                        <span className="w-1.5 h-1.5 rounded-full bg-[#8F86A1]" />
                        <span>{f}</span>
                      </li>
                    ))}
                  </ul>
                </div>
                {/* Engine pulse */}
                <div className="flex flex-col items-center justify-center">
                  <div className="relative">
                    <div className="w-12 h-12 rounded-full bg-[#2E2218] flex items-center justify-center text-[#D6BC93] font-mono text-[20px] breathe">
                      ⚙
                    </div>
                    <div
                      className="absolute inset-0 rounded-full border-2 border-[#2E2218] opacity-40 breathe"
                      style={{ animationDelay: "0.5s" }}
                    />
                  </div>
                  <div className="num-mono text-[9px] text-[#6C5038] tracking-[0.16em] uppercase mt-2">
                    6 rules
                  </div>
                </div>
                {/* Verdicts */}
                <div className="rounded-xl border border-[#D6BC93] bg-[#F1E1CD] p-4">
                  <div className="num-mono text-[9.5px] text-[#6C5038] tracking-[0.16em] uppercase">
                    Verdicts
                  </div>
                  <ul className="mt-2.5 space-y-1.5">
                    {S.flips.map((f, i) => (
                      <li
                        key={i}
                        className="flex items-start gap-2 text-[12px] drift-in"
                        style={{ animationDelay: `${600 + i * 180}ms` }}
                      >
                        <VerdictDot v={f.to} />
                        <span className="flex-1">
                          <span className="text-[#2E2218] font-medium">{f.name}</span>
                          <span className="block text-[10.5px] text-[#6C5038] mt-0.5">{f.note}</span>
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              </div>

              <div className="hairline my-5" />
              <div className="flex items-center justify-between">
                <div className="num-mono text-[11px] text-[#6C5038]">
                  delta: <span className="text-[#33482F]">{S.delta}</span>
                </div>
                <Link to="/app/exams" className="text-[12px] font-semibold text-[#2E2218] link-under">
                  Open eligibility matches →
                </Link>
              </div>
            </div>
          </div>

          {/* Right: fact tiles + trust pillar */}
          <div className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <FactTile k="profile facets" v="9" sub="age · category · education · domicile · GATE · …" />
              <FactTile k="rules per match" v="6" sub="every recruitment, every change" />
              <FactTile k="verified criteria" v="86%" sub="of all open recruitments" tone="sage" />
              <FactTile k="silent auto-eligible" v="0" sub="we never bypass admin review" tone="ink" />
            </div>
            <div className="rounded-2xl border border-[#94B28A] bg-[#F0F5EF] p-5">
              <div className="flex items-start gap-3">
                <span
                  className="seal-verified inline-flex items-center justify-center rounded-full shrink-0"
                  style={{ width: 28, height: 28 }}
                >
                  <svg width="14" height="14" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                    <path
                      d="M3 8.4 6.4 11.5 13 4.6"
                      stroke="#F0F5EF"
                      strokeWidth="2.4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </span>
                <div>
                  <div className="num-mono text-[9.5px] text-[#33482F] tracking-[0.18em]">TRUST POLICY</div>
                  <div className="font-serif text-[16px] mt-1 leading-snug text-[#33482F]">
                    A criterion is scraped first, then reviewer-locked before it can flip a verdict.
                  </div>
                  <p className="text-[11.5px] text-[#33482F] mt-2">
                    Until verified, we mark your verdict <em>conditional</em>. We never silently say
                    "eligible" based on aggregator data.
                  </p>
                </div>
              </div>
            </div>
            <div className="rounded-2xl border border-[#2E2218] bg-[#2E2218] text-[#F3EADB] p-5">
              <div className="num-mono text-[9.5px] text-[#D6BC93] tracking-[0.18em]">CONTINUOUS</div>
              <div className="font-serif text-[16px] mt-1 leading-snug">
                Re-matches happen every 15m for scraped sources, instantly when you edit your profile.
              </div>
              <ul className="mt-3 space-y-1 text-[11.5px] text-[#D6BC93]">
                <li>· no manual "re-check eligibility" button</li>
                <li>· change log every aspirant can read</li>
                <li>· batched notifications · max 1/day per user</li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function VerdictDot({ v }) {
  const m =
    {
      eligible: { c: "#54794E", text: "✓" },
      conditional: { c: "#A68057", text: "~" },
      "not-eligible": { c: "#7A3925", text: "×" },
    }[v] || { c: "#A68057", text: "·" };
  return (
    <span
      className="mt-1 w-3.5 h-3.5 rounded-full flex items-center justify-center shrink-0 text-[#F0F5EF] text-[9px] font-bold"
      style={{ background: m.c }}
    >
      {m.text}
    </span>
  );
}

function FactTile({ k, v, sub, tone }) {
  const dark = tone === "ink";
  return (
    <div
      className={`rounded-xl border p-4 ${
        dark
          ? "bg-[#2E2218] border-[#2E2218]"
          : tone === "sage"
            ? "bg-[#F0F5EF] border-[#B9CFAF]"
            : "bg-white/70 border-[#E7DECB]"
      }`}
    >
      <div
        className={`num-mono text-[9.5px] tracking-[0.16em] uppercase ${
          dark ? "text-[#D6BC93]" : "text-[#6C5038]"
        }`}
      >
        {k}
      </div>
      <div
        className={`font-serif text-[28px] leading-none mt-1.5 ${
          dark ? "text-[#F3EADB]" : tone === "sage" ? "text-[#33482F]" : "text-[#2E2218]"
        }`}
      >
        {v}
      </div>
      <div className={`text-[10.5px] mt-2 leading-snug ${dark ? "text-[#D6BC93]" : "text-[#6C5038]"}`}>
        {sub}
      </div>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  EXPLORE THE PROTOTYPE
 * ----------------------------------------------------------------- */
function ExploreScreens() {
  const screens = [
    { tag: "Aspirant", title: "Today · Mission Control", sub: "Plan + reasoning trace per task", to: "/app/today", glyph: "◐" },
    { tag: "Aspirant", title: "Study Plan", sub: "Timeline + before/after adaptation", to: "/app/study-plan", glyph: "▤" },
    { tag: "Aspirant", title: "Subjects", sub: "Topic tree · locked priority · mastery", to: "/app/study/subjects", glyph: "❖" },
    { tag: "Aspirant", title: "Focus", sub: "25/50/90m timer · reflection drawer", to: "/app/study/focus", glyph: "◍" },
    { tag: "Aspirant", title: "Mocks", sub: "Error patterns → correction tasks", to: "/app/study/mocks", glyph: "△" },
    { tag: "Aspirant", title: "Weekly review", sub: "Honest read · next-week preview", to: "/app/study/review", glyph: "↻" },
    { tag: "Aspirant", title: "Eligibility matches", sub: "Recruitments matched to your profile", to: "/app/exams", glyph: "⌖" },
    { tag: "Admin", title: "Exam Intelligence", sub: "7 tabs · verify + lock + plan-impact", to: "/admin/exam-intelligence", glyph: "⊞", dark: true },
    { tag: "Admin", title: "Eligibility verification", sub: "Criteria queue · match impact preview", to: "/admin/eligibility-queue", glyph: "⌗", dark: true },
    { tag: "Admin", title: "Persona Inspector", sub: "Internal dims → study policy", to: "/admin/persona", glyph: "◊", dark: true },
  ];
  return (
    <section className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
      <SectionHeader
        eyebrow="See it for real"
        title="Walk through the app."
        sub="Ten screens — seven for aspirants, three for admins. Every panel is labelled live / preview / not connected."
      />
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 mt-10">
        {screens.map((s, i) => (
          <ScreenLinkCard key={i} s={s} />
        ))}
      </div>
      <div className="mt-6 text-center">
        <Link to="/app" className="btn btn-ghost">
          Or jump straight into your dashboard →
        </Link>
      </div>
    </section>
  );
}

function ScreenLinkCard({ s }) {
  return (
    <Link
      to={s.to}
      className={`group relative rounded-2xl border p-5 lift ${
        s.dark ? "bg-[#2E2218] border-[#2E2218]" : "bg-white/70 border-[#E7DECB]"
      }`}
    >
      <div className="flex items-center justify-between">
        <span
          className={`text-[10.5px] font-semibold tracking-[0.18em] uppercase ${
            s.dark ? "text-[#D6BC93]" : "text-[#6C5038]"
          }`}
        >
          {s.tag}
        </span>
        <span className={`text-[20px] ${s.dark ? "text-[#D6BC93]" : "text-[#A68057]"}`}>{s.glyph}</span>
      </div>
      <div className={`font-serif text-[18px] mt-3 leading-tight ${s.dark ? "text-[#F3EADB]" : "text-[#2E2218]"}`}>
        {s.title}
      </div>
      <div className={`text-[12.5px] mt-1.5 ${s.dark ? "text-[#D6BC93]" : "text-[#6C5038]"}`}>{s.sub}</div>
      <div
        className={`mt-5 text-[12px] font-semibold flex items-center gap-1.5 ${
          s.dark ? "text-[#F3EADB]" : "text-[#2E2218]"
        }`}
      >
        <span>Open</span>
        <span className="transition-transform group-hover:translate-x-1">→</span>
      </div>
    </Link>
  );
}

/* ----------------------------------------------------------------- *
 *  TRUST DEEP DIVE — verified vs aggregator side-by-side
 * ----------------------------------------------------------------- */
function TrustDeepDive() {
  return (
    <section id="trust" className="bg-[#FBF8F2] border-y border-[#E7DECB]">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
        <SectionHeader
          eyebrow="Source policy"
          title={
            <>
              We never silently treat <em>rumour</em> as <em>news</em>.
            </>
          }
          sub="Two updates can look the same. We hold them very, very far apart in how they affect your plan."
        />

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 mt-10">
          {/* Verified card */}
          <div
            className="relative rounded-2xl border border-[#94B28A] p-6"
            style={{ background: "linear-gradient(180deg, rgba(218,231,214,0.4), #F8FAF6)" }}
          >
            <div className="flex items-start gap-3">
              <span
                className="seal-verified inline-flex items-center justify-center rounded-full"
                style={{ width: 36, height: 36 }}
              >
                <svg width="18" height="18" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <path
                    d="M3 8.4 6.4 11.5 13 4.6"
                    stroke="#F0F5EF"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              </span>
              <div>
                <span className="stamp stamp-verified">Officially verified</span>
                <h3 className="font-serif text-[22px] mt-2 leading-tight">
                  UPSC CSE 2026 — application opens May 22
                </h3>
                <p className="text-[13px] text-[#33482F] mt-2 max-w-[52ch]">
                  Sourced from upsc.gov.in · cross-checked by admin curator · cryptographically signed
                  before reaching aspirants.
                </p>
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-[11.5px]">
              <Fact k="What it does" v="Adds 3 deadlines to your tracker · marks the day in your calendar" />
              <Fact k="What it doesn't do" v="It doesn't promote unverified rumours alongside it" />
            </div>
            <div className="mt-4 num-mono text-[10px] text-[#33482F]">
              sig 0x4f·a7c2 · received May 12 · 09:14 IST
            </div>
          </div>

          {/* Aggregator card */}
          <div
            className="rounded-2xl p-6"
            style={{
              border: "1px dashed #8F86A1",
              background:
                "repeating-linear-gradient(135deg, rgba(143,134,161,0.045) 0 8px, transparent 8px 16px), #FBF8F2",
            }}
          >
            <div className="flex items-start gap-3">
              <span
                className="inline-flex items-center justify-center rounded-full"
                style={{ width: 36, height: 36, background: "#FBF8F2", border: "1px dashed #8F86A1", color: "#524864" }}
              >
                <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                  <circle cx="8" cy="8" r="6.5" stroke="#524864" strokeWidth="1.2" strokeDasharray="2 2" />
                  <path d="M8 4.5v4.2M8 11.2v.6" stroke="#524864" strokeWidth="1.6" strokeLinecap="round" />
                </svg>
              </span>
              <div>
                <span className="stamp stamp-needs">Aggregator · needs verification</span>
                <h3 className="font-serif text-[22px] mt-2 leading-tight text-[#31293B]">
                  Admit card likely by Jul 28 (rumoured)
                </h3>
                <p className="text-[13px] text-[#31293B] mt-2 max-w-[52ch]">
                  Reported by exam-news aggregators based on staffing notices. No official communication
                  yet. We hold it.
                </p>
              </div>
            </div>
            <div className="mt-4">
              <div className="flex items-center justify-between text-[10.5px] text-[#524864]">
                <span className="eyebrow !text-[9.5px]">Source trust</span>
                <span className="num-mono">42%</span>
              </div>
              <div className="mt-1 h-[5px] bg-[#E3DFEA] rounded-full overflow-hidden">
                <div className="h-full bg-[#B7B0C4]" style={{ width: "42%" }} />
              </div>
            </div>
            <div className="mt-5 grid grid-cols-2 gap-3 text-[11.5px]">
              <Fact
                k="What it does"
                v="Sits in your update feed · admin can promote on confirmation"
                muted
              />
              <Fact k="What it doesn't do" v="It doesn't move your dates · it doesn't add tasks" muted />
            </div>
            <div className="mt-4 num-mono text-[10px] text-[#524864]">
              received May 13 · 18:02 · awaits upsc.gov.in
            </div>
          </div>
        </div>

        {/* policy strip */}
        <div className="mt-8 rounded-2xl border border-[#E7DECB] bg-white/70 p-5">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-5">
            <PolicyTile
              stamp="Official"
              tone="verified"
              body="Auto-apply after admin review. May change plan, dates, syllabus."
            />
            <PolicyTile
              stamp="Aggregator"
              tone="needs"
              body="Surface only. Cannot affect your plan until paired with an official source."
            />
            <PolicyTile
              stamp="Research"
              tone="needs"
              body="Strategy hint only. Never auto-edits the plan; only seen in 'why this plan'."
            />
            <PolicyTile
              stamp="Opportunity"
              tone="verified"
              body="Adjacent exams matched to you. Separate from your active prep — never silent."
            />
          </div>
        </div>
      </div>
    </section>
  );
}

function Fact({ k, v, muted }) {
  return (
    <div
      className={`rounded-lg border ${muted ? "border-[#DDDAE3] bg-white/40" : "border-[#B9CFAF] bg-white/60"} p-3`}
    >
      <div className="eyebrow !text-[9.5px]" style={muted ? { color: "#524864" } : { color: "#33482F" }}>
        {k}
      </div>
      <div className={`text-[12px] mt-1 ${muted ? "text-[#31293B]" : "text-[#33482F]"}`}>{v}</div>
    </div>
  );
}

function PolicyTile({ stamp, tone, body }) {
  return (
    <div className="border-l border-[#E7DECB] pl-4 first:border-0 first:pl-0">
      <span className={`stamp ${tone === "verified" ? "stamp-verified" : "stamp-needs"}`}>{stamp}</span>
      <p className="text-[12.5px] text-[#3a2e22] mt-3 leading-relaxed">{body}</p>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  EXAMS WE SUPPORT
 * ----------------------------------------------------------------- */
function ExamsRow() {
  const families = [
    {
      fam: "Civil Services",
      e: [
        { m: "CS", n: "UPSC CSE", cycle: "2026", state: "connected" },
        { m: "PS", n: "UPSC CDS", cycle: "2026·1", state: "connected" },
        { m: "FS", n: "IFoS", cycle: "2026", state: "partial" },
      ],
    },
    {
      fam: "Banking",
      e: [
        { m: "RB", n: "RBI Grade B", cycle: "2026", state: "connected" },
        { m: "IB", n: "IBPS PO", cycle: "2026", state: "connected" },
        { m: "SB", n: "SBI PO", cycle: "2026", state: "partial" },
      ],
    },
    {
      fam: "SSC",
      e: [
        { m: "CG", n: "SSC CGL", cycle: "2026", state: "connected" },
        { m: "CH", n: "SSC CHSL", cycle: "2026", state: "connected" },
        { m: "MT", n: "SSC MTS", cycle: "2026", state: "partial" },
      ],
    },
    {
      fam: "State PSC",
      e: [
        { m: "UP", n: "UPPSC", cycle: "2026", state: "partial" },
        { m: "BR", n: "BPSC", cycle: "2026", state: "partial" },
        { m: "MH", n: "MPSC", cycle: "2026", state: "partial" },
      ],
    },
    {
      fam: "Defense · others",
      e: [
        { m: "NA", n: "NDA", cycle: "2026·1", state: "connected" },
        { m: "AF", n: "AFCAT", cycle: "2026", state: "partial" },
        { m: "RR", n: "RRB NTPC", cycle: "2026", state: "partial" },
      ],
    },
  ];
  return (
    <section id="exams" className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
      <SectionHeader
        eyebrow="Coverage"
        title="Exams we already support."
        sub="If your exam is partial, you'll still get the Study OS — just with fewer locked PYQ tags. We label exactly what's connected."
      />
      <div className="space-y-3 mt-10">
        {families.map((f, i) => (
          <div
            key={i}
            className="grid grid-cols-1 md:grid-cols-[180px_1fr] gap-4 items-start border-t border-[#E7DECB] pt-5"
          >
            <div>
              <div className="font-serif text-[18px]">{f.fam}</div>
              <div className="num-mono text-[10.5px] text-[#6C5038] mt-1 tracking-[0.1em]">
                {f.e.length} exams
              </div>
            </div>
            <div className="flex flex-wrap gap-2.5">
              {f.e.map((x, j) => (
                <div key={j} className="exam-chip text-[13px]">
                  <span className="exam-mark">{x.m}</span>
                  <span className="font-medium">{x.n}</span>
                  <span className="num-mono text-[10.5px] text-[#6C5038]">{x.cycle}</span>
                  <span
                    className={`stamp ${x.state === "connected" ? "stamp-verified" : "stamp-needs"}`}
                    style={{ padding: "1px 5px" }}
                  >
                    {x.state === "connected" ? "connected" : "partial"}
                  </span>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- *
 *  PRICING
 * ----------------------------------------------------------------- */
function Pricing() {
  return (
    <section id="pricing" className="bg-[#FBF8F2] border-y border-[#E7DECB]">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
        <SectionHeader
          eyebrow="Pricing"
          title="Free is real free. Paid pays for the engine."
          sub="No content paywalls. You always see the full plan — paid unlocks the engine that adapts it daily."
        />
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-10">
          <PricingCard
            tier="Starter"
            price="Free"
            note="forever"
            bullets={[
              "Today · Mission Control",
              "Subjects + topic tree",
              "Weekly review (manual)",
              "Update feed (read-only)",
            ]}
            cta="Start free"
          />
          <PricingCard
            tier="Study OS"
            price="₹399"
            note="/ month · billed monthly"
            highlight
            bullets={[
              "Engine compiles your day",
              "Plan adaptation + change log",
              "Mock correction tasks",
              "Spaced revision",
              "Trust-graded updates · auto-applied",
            ]}
            cta="Start 7-day trial"
          />
          <PricingCard
            tier="Mentor"
            price="₹1,499"
            note="/ month · w/ mentor sessions"
            bullets={[
              "Everything in Study OS",
              "2× mentor review sessions / mo",
              "Personalized policy tuning",
              "Priority verified-update channel",
            ]}
            cta="Talk to mentor"
          />
        </div>
        <div className="text-center mt-5 text-[12.5px] text-[#6C5038]">
          Govt-employee parents · serving students · NCC: 30% off, pay what helps · no questions asked.
        </div>
      </div>
    </section>
  );
}

function PricingCard({ tier, price, note, bullets, cta, highlight }) {
  return (
    <div
      className={`rounded-2xl border p-6 ${
        highlight ? "bg-[#2E2218] border-[#2E2218] text-[#F3EADB] lift" : "bg-white/70 border-[#E7DECB]"
      }`}
    >
      <div className={`eyebrow ${highlight ? "!text-[#D6BC93]" : ""}`}>{tier}</div>
      <div className="mt-3 flex items-baseline gap-2">
        <span className={`font-serif text-[40px] leading-none ${highlight ? "text-[#F3EADB]" : ""}`}>
          {price}
        </span>
        <span className={`text-[12px] ${highlight ? "text-[#D6BC93]" : "text-[#6C5038]"}`}>{note}</span>
      </div>
      <ul className={`mt-5 space-y-2 text-[13px] ${highlight ? "text-[#D6BC93]" : "text-[#3a2e22]"}`}>
        {bullets.map((b, i) => (
          <li key={i} className="flex items-start gap-2.5">
            <span
              className={`mt-0.5 w-4 h-4 rounded-full flex items-center justify-center shrink-0 ${
                highlight ? "bg-[#D6BC93]" : "bg-[#54794E]"
              }`}
            >
              <svg width="9" height="9" viewBox="0 0 16 16" fill="none" aria-hidden="true">
                <path
                  d="M3 8.4 6.4 11.5 13 4.6"
                  stroke={highlight ? "#2E2218" : "#F0F5EF"}
                  strokeWidth="2.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </span>
            <span>{b}</span>
          </li>
        ))}
      </ul>
      <Link
        to="/signup"
        className={`mt-6 btn w-full justify-center ${
          highlight ? "bg-[#F3EADB] text-[#2E2218]" : "btn-primary"
        }`}
      >
        {cta}
      </Link>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  FAQ
 * ----------------------------------------------------------------- */
function FAQ() {
  const items = [
    {
      q: "Is this an AI study app?",
      a: 'Career Copilot uses rules and engineered intelligence — not a chatbot — to compile your daily plan. Every recommendation answers "why" by pointing at four sources: your data, exam data, official updates, and engine rules. Nothing is invented.',
    },
    {
      q: "How do you decide what's 'high-yield'?",
      a: "A topic is only called high-yield once a curator reviews the evidence (PYQ tags, syllabus mentions, coverage model) and locks it in /admin/exam-intelligence. Until then it's labelled draft or pending review. No statistical guesswork shown as fact.",
    },
    {
      q: "What happens if I miss tasks?",
      a: "The plan adapts — calmly. Reduced load, shifted priorities, an honest weekly read of what improved and declined. We don't shame, streak, or gamify.",
    },
    {
      q: "Where do current-affairs updates come from?",
      a: "Four lanes — official, aggregator, research, opportunity — strictly separated. Official sources auto-apply after admin review. Aggregator reports never silently change your plan.",
    },
    {
      q: "Can I see exactly why a task was chosen?",
      a: "Yes — every task carries provenance chips and a reasoning drawer showing which user signal, exam signal, update, and engine rule produced it.",
    },
    {
      q: "What if my exam isn't fully connected?",
      a: "You can still use the engine. The UI clearly marks panels as live · partial · preview · not connected. As the admin team locks more topics for your exam, more panels go live automatically.",
    },
  ];
  return (
    <section className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
      <SectionHeader
        eyebrow="FAQ"
        title="Honest answers."
        sub="No marketing dance. If something is preview-only, we say so."
      />
      <div className="max-w-[820px] mx-auto mt-10">
        {items.map((it, i) => (
          <details key={i} className="faq">
            <summary>
              <span className="font-serif text-[18px] text-[#2E2218]">{it.q}</span>
              <span className="faq-icon text-[24px] leading-none">+</span>
            </summary>
            <div className="faq-body max-w-[68ch]">{it.a}</div>
          </details>
        ))}
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- *
 *  FINAL CTA
 * ----------------------------------------------------------------- */
function CTA() {
  return (
    <section id="start" className="max-w-[1280px] mx-auto px-6 lg:px-10 py-20">
      <div className="relative soft-card grain p-12 lg:p-16 overflow-hidden text-center">
        <div className="eyebrow">Begin</div>
        <h2 className="font-serif text-[44px] lg:text-[56px] leading-[1.05] mt-3 max-w-[18ch] mx-auto">
          One compiled day.
          <br />
          Every morning.
        </h2>
        <p className="text-[15px] text-[#3a2e22] mt-5 max-w-[55ch] mx-auto">
          Pick your exam. Tell us your hours. We'll give you a calm, traceable plan tomorrow at 06:00.
        </p>
        <div className="mt-8 flex justify-center gap-3 flex-wrap">
          <Link to="/app/onboarding/chat?mode=discovery" className="btn btn-primary">
            Start free · pick your exam
          </Link>
          <Link to={PROTOTYPE_HOME} className="btn btn-ghost">
            Walk through the app
          </Link>
        </div>
        <div className="mt-6 text-[11.5px] text-[#6C5038]">
          No credit card. 7-day Study OS trial included.
        </div>
      </div>
    </section>
  );
}

/* ----------------------------------------------------------------- *
 *  FOOTER
 * ----------------------------------------------------------------- */
function Footer() {
  return (
    <footer className="border-t border-[#E7DECB] bg-[#FBF8F2]">
      <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-12 grid grid-cols-2 md:grid-cols-5 gap-8">
        <div className="col-span-2">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#2E2218] flex items-center justify-center">
              <span className="font-serif text-[15px] text-[#F3EADB] leading-none">cc</span>
            </div>
            <div className="font-serif text-[16px]">Career Copilot</div>
          </div>
          <p className="text-[12.5px] text-[#3a2e22] mt-3 max-w-[36ch] leading-relaxed">
            An operating system for exam preparation — built for India's government-job aspirants.
          </p>
          <div className="mt-4 flex gap-2">
            <span className="pill pill-outline">Made calmly · in IN</span>
          </div>
        </div>
        <FooterCol
          h="Product"
          links={[
            { l: "How it works", h: "#how" },
            { l: "Eligibility engine", h: "#eligibility" },
            { l: "Trust & sources", h: "#trust" },
            { l: "Exams", h: "#exams" },
            { l: "Pricing", h: "#pricing" },
          ]}
        />
        <FooterCol
          h="The app"
          links={[
            { l: "Today · Mission Control", to: "/app/today" },
            { l: "Study Plan", to: "/app/study-plan" },
            { l: "Subjects", to: "/app/study/subjects" },
            { l: "Eligibility matches", to: "/app/exams" },
            { l: "Weekly review", to: "/app/study/review" },
            { l: "Admin · Exam Intelligence", to: "/admin/exam-intelligence" },
            { l: "Admin · Eligibility", to: "/admin/eligibility-queue" },
            { l: "Open the app", to: "/app" },
          ]}
        />
        <FooterCol
          h="Company"
          links={[
            { l: "Trust policy", h: "#trust" },
            { l: "Mentors", to: "/app/mentors" },
            { l: "Pricing", h: "#pricing" },
            { l: "Sign in", to: "/login" },
            { l: "Get started", to: "/app/onboarding/chat?mode=discovery" },
          ]}
        />
      </div>
      <div className="border-t border-[#E7DECB]">
        <div className="max-w-[1280px] mx-auto px-6 lg:px-10 py-5 flex flex-wrap items-center justify-between gap-3">
          <div className="num-mono text-[10.5px] text-[#6C5038]">
            © 2026 Career Copilot · ccp-mainbuild-v1 · study-os v0.6
          </div>
          <div className="flex items-center gap-3 num-mono text-[10.5px] text-[#6C5038]">
            <span className="inline-flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#54794E]" />
              all systems live
            </span>
            <span>·</span>
            <a href="#top" className="link-under">
              Privacy
            </a>
            <a href="#top" className="link-under">
              Terms
            </a>
            <a href="#top" className="link-under">
              Status
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}

function FooterCol({ h, links }) {
  return (
    <div>
      <div className="eyebrow">{h}</div>
      <ul className="mt-3 space-y-2">
        {links.map((l, i) => (
          <li key={i}>
            {l.to ? (
              <Link to={l.to} className="text-[13px] text-[#3a2e22] link-under">
                {l.l}
              </Link>
            ) : (
              <a href={l.h} className="text-[13px] text-[#3a2e22] link-under">
                {l.l}
              </a>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  Shared section header
 * ----------------------------------------------------------------- */
function SectionHeader({ eyebrow, title, sub }) {
  return (
    <div className="max-w-[760px]">
      <div className="eyebrow">{eyebrow}</div>
      <h2 className="font-serif text-[36px] lg:text-[44px] leading-[1.05] mt-3">{title}</h2>
      {sub && <p className="text-[15px] text-[#3a2e22] mt-4 leading-relaxed">{sub}</p>}
    </div>
  );
}

/* ----------------------------------------------------------------- *
 *  PAGE
 * ----------------------------------------------------------------- */
export default function Landing() {
  return (
    <main data-testid="landing-page" className="linen-bg">
      <Nav />
      <Hero />
      <TrustRibbon />
      <Pillars />
      <HowItWorks />
      <EligibilityEngine />
      <ExploreScreens />
      <TrustDeepDive />
      <ExamsRow />
      <Pricing />
      <FAQ />
      <CTA />
      <Footer />
    </main>
  );
}
