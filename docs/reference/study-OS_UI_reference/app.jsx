/* global React, ReactDOM, TweaksPanel, TweakSection, TweakRadio, TweakToggle, useTweaks */
const { useState, useMemo } = React;

/* ---------------------------------------------------------------------- *
 *  DATA — would come from /api/study/plan + /api/notifications etc.
 * ---------------------------------------------------------------------- */

const PERSONA = {
  name: "Aarav",
  exam: "UPSC CSE",
  family: "Civil Services",
  cycle: "CSE 2026",
  phase: "Prelims",
  hoursToday: 6.5,
  weekConsistency: 0.82,
  weakTopics: ["Modern History · Revolts", "Polity · Federalism", "Economy · Monetary policy"],
  hoursAvailable: ["06:30–08:30", "10:00–13:00", "19:30–22:00"],
};

const ENGINE_META = {
  generatedAt: "Today · 03:12 IST",
  inputs: 41,
  rulesFired: 7,
  version: "Engine v0.6 · spaced+weakdrill",
};

/* Each task carries a provenance trail back to the four layers */
const TASKS = [
  {
    id: "t1",
    time: "06:30",
    duration: "60m",
    title: "Polity · Federalism — concept revision (weak topic)",
    sub: "Spaced revision due · 3rd encounter · last 84% accuracy",
    track: "Subject drill",
    sources: [
      { layer: "user", key: "weak-topic", label: "Weak topic" },
      { layer: "engine", key: "spaced", label: "Spaced revision due" },
      { layer: "exam", key: "pyq", label: "PYQ-heavy 2018·2021" },
    ],
    done: true,
  },
  {
    id: "t2",
    time: "07:30",
    duration: "30m",
    title: "Current affairs · Monetary policy — Apr digest",
    sub: "Linked to your weak topic in Economy",
    track: "Current affairs",
    sources: [
      { layer: "update", key: "rbi-policy", label: "RBI Apr policy" },
      { layer: "user", key: "weak-topic", label: "Weak: Monetary" },
      { layer: "engine", key: "compiler", label: "Daily compiler" },
    ],
    done: true,
  },
  {
    id: "t3",
    time: "10:00",
    duration: "90m",
    title: "Modern History · Revolts of 1857 — deep read",
    sub: "Prerequisite for Governor-General sequence · scheduled before Mock 14",
    track: "New learning",
    sources: [
      { layer: "exam", key: "prereq", label: "Prerequisite graph" },
      { layer: "user", key: "history", label: "Weak: Modern" },
      { layer: "engine", key: "prio", label: "Pre-mock priority" },
    ],
    done: false,
    isOneThing: true,
  },
  {
    id: "t4",
    time: "11:30",
    duration: "45m",
    title: "Mains answer drill · GS-2 (federalism short note)",
    sub: "From your Mock 13 weak-area report",
    track: "Mains write-up",
    sources: [
      { layer: "user", key: "mock", label: "Mock 13 weak area" },
      { layer: "engine", key: "drill", label: "Weak-area drill" },
    ],
    done: false,
  },
  {
    id: "t5",
    time: "12:15",
    duration: "20m",
    title: "Review · CSE 2026 Notification — cycle changes",
    sub: "Officially verified update on May 12 · syllabus addendum noted",
    track: "Exam update",
    sources: [
      { layer: "update", key: "notif", label: "CSE 2026 notification" },
      { layer: "exam", key: "cycle", label: "Cycle 2026" },
    ],
    done: false,
    needsAck: true,
  },
  {
    id: "t6",
    time: "19:30",
    duration: "75m",
    title: "Full-length Mock 14 — Prelims · Paper I",
    sub: "Engine-scheduled · last mock 7d ago · syllabus coverage 68%",
    track: "Mock",
    sources: [
      { layer: "user", key: "history", label: "Mock cadence" },
      { layer: "exam", key: "phase", label: "Prelims phase" },
      { layer: "engine", key: "cadence", label: "Mock cadence" },
    ],
    done: false,
  },
  {
    id: "t7",
    time: "21:00",
    duration: "30m",
    title: "Spaced revision · Polity Ch.4 (carried 2×)",
    sub: "Forgetting curve · interval +2d, mastery 56%",
    track: "Spaced rev",
    sources: [
      { layer: "engine", key: "spaced", label: "Spaced revision" },
      { layer: "user", key: "carried", label: "Carried forward 2×" },
    ],
    done: false,
  },
];

/* Update Intelligence — separated by trust tier */
const UPDATES = {
  verified: [
    {
      id: "u1",
      title: "UPSC CSE 2026 — Notification released",
      summary: "Application window opens May 22 · Prelims on Aug 30, 2026.",
      source: "upsc.gov.in",
      sourceType: "official",
      receivedAt: "May 12 · 09:14 IST",
      tag: "Cycle update",
      effect: "Calendar updated · 3 deadlines added to tracker.",
      hash: "0x4f·a7c2",
    },
    {
      id: "u2",
      title: "Syllabus addendum — Optional: Public Admin",
      summary: "Section II Topic 3 expanded to include digital governance.",
      source: "upsc.gov.in/notifications/cse-2026",
      sourceType: "official",
      receivedAt: "May 12 · 09:14 IST",
      tag: "Syllabus change",
      effect: "Subject tree v2026.1 · 4 new microtopics queued.",
      hash: "0x4f·a7d1",
    },
  ],
  unverified: [
    {
      id: "u3",
      title: "Admit card likely by Jul 28 (rumoured)",
      summary: "Aggregator reports earlier-than-usual release based on staffing notice.",
      source: "examstudy.in · careerwala",
      sourceType: "aggregator",
      sourceTrust: 0.42,
      receivedAt: "May 13 · 18:02 IST",
      tag: "Date rumor",
      effect: "No calendar change · flagged for follow-up.",
    },
    {
      id: "u4",
      title: "Pattern shift — fewer Polity questions predicted",
      summary: "Trend analysis from PYQs 2021–25; not an official communication.",
      source: "Internal research · coverage model 0.8",
      sourceType: "research",
      sourceTrust: 0.71,
      receivedAt: "May 11 · 22:40 IST",
      tag: "Trend",
      effect: "Hint only · plan not auto-adjusted.",
    },
    {
      id: "u5",
      title: "RBI Grade B — eligibility looks open for you",
      summary: "Adjacent recruitment surfaced by the eligibility engine; no action yet.",
      source: "rbi.org.in (matched) · enrichment",
      sourceType: "opportunity",
      sourceTrust: 0.88,
      receivedAt: "May 10 · 11:05 IST",
      tag: "Opportunity",
      effect: "Listed under Adjacent exams · saved to Tracker draft.",
    },
  ],
};

/* ---------------------------------------------------------------------- *
 *  PRIMITIVES
 * ---------------------------------------------------------------------- */

function ChipForSource({ s }) {
  return <span className={`chip chip-${s.layer}`} title={`${s.layer} intelligence`}>{LayerGlyph(s.layer)} {s.label}</span>;
}

function LayerGlyph(layer) {
  if (layer === "user")   return <span style={{fontWeight:700, opacity:0.7}}>u·</span>;
  if (layer === "exam")   return <span style={{fontWeight:700, opacity:0.7}}>e·</span>;
  if (layer === "update") return <span style={{fontWeight:700, opacity:0.7}}>n·</span>;
  if (layer === "engine") return <span style={{fontWeight:700, opacity:0.7}}>⚙</span>;
  return null;
}

function TrustStamp({ kind }) {
  if (kind === "official")   return <span className="stamp stamp-official">Officially verified</span>;
  if (kind === "aggregator") return <span className="stamp stamp-aggregator">Aggregator · needs verification</span>;
  if (kind === "research")   return <span className="stamp stamp-research">Research · not official</span>;
  if (kind === "opportunity")return <span className="stamp stamp-opportunity">Opportunity · matched</span>;
  return null;
}

function VerifiedSeal({ size = 22 }) {
  return (
    <span
      aria-label="Officially verified"
      className="seal-verified inline-flex items-center justify-center rounded-full text-[#F0F5EF]"
      style={{ width: size, height: size, flex: '0 0 auto' }}
    >
      <svg width={size*0.55} height={size*0.55} viewBox="0 0 16 16" fill="none">
        <path d="M3 8.4 6.4 11.5 13 4.6" stroke="#F0F5EF" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    </span>
  );
}

/* ---------------------------------------------------------------------- *
 *  HEADER
 * ---------------------------------------------------------------------- */

function Header() {
  return (
    <header className="px-10 pt-9 pb-7 relative">
      <div className="flex items-end justify-between">
        <div>
          <div className="eyebrow">Today · Tue, May 14 · {ENGINE_META.generatedAt}</div>
          <h1 className="text-[40px] mt-2 leading-[1.05]">Good morning, {PERSONA.name}.</h1>
          <p className="text-[15px] text-[#6C5038] mt-2 max-w-[58ch]">
            Seven tasks · {PERSONA.hoursToday} hours · generated by your Study OS engine from <em>four</em> intelligence layers. Nothing here was guessed by hand.
          </p>
        </div>
        <div className="text-right">
          <div className="eyebrow">Cycle</div>
          <div className="font-serif text-[20px] mt-1">{PERSONA.exam} · {PERSONA.cycle}</div>
          <div className="text-[12px] text-[#6C5038] mt-1">Phase: <strong className="text-[#2E2218]">{PERSONA.phase}</strong> · {Math.round(PERSONA.weekConsistency*100)}% week consistency</div>
        </div>
      </div>
    </header>
  );
}

/* ---------------------------------------------------------------------- *
 *  ENGINE TRACE — strip directly under header
 * ---------------------------------------------------------------------- */

function EngineTrace() {
  return (
    <section className="px-10">
      <div className="soft-card relative grain overflow-hidden">
        <div className="grid grid-cols-[180px_1fr_220px]">
          {/* left meta */}
          <div className="p-5 border-r border-[#EFE2C9]">
            <div className="eyebrow">Engine trace</div>
            <div className="font-serif text-[22px] mt-1.5 leading-[1.1]">Why today<br/>looks like this.</div>
            <div className="num-mono text-[10.5px] text-[#6C5038] mt-3 leading-relaxed">
              {ENGINE_META.version}<br/>
              {ENGINE_META.inputs} signals · {ENGINE_META.rulesFired} rules fired
            </div>
          </div>

          {/* diagram */}
          <div className="relative">
            <svg viewBox="0 0 720 200" className="w-full h-[200px] block">
              <defs>
                <marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                  <path d="M0,0 L10,5 L0,10 z" fill="#8A6846" />
                </marker>
              </defs>

              {/* Four origin nodes left */}
              {[
                { y: 24,  fill:"#ECE7F2", stroke:"#8F86A1", text:"USER INTELLIGENCE", sub:"persona · weak topics · hours" },
                { y: 70,  fill:"#E4EDE0", stroke:"#94B28A", text:"EXAM INTELLIGENCE", sub:"syllabus · PYQ · prereq graph" },
                { y: 116, fill:"#F1E1CD", stroke:"#D6BC93", text:"UPDATE INTELLIGENCE", sub:"official + aggregator + research" },
                { y: 162, fill:"#2E2218", stroke:"#2E2218", text:"STUDY OS ENGINE", sub:"plan · prio · spaced · adapt", textFill:"#F3EADB", subFill:"#D6BC93" },
              ].map((n,i) => (
                <g key={i}>
                  <rect x="14" y={n.y} width="220" height="34" rx="8" fill={n.fill} stroke={n.stroke} />
                  <text x="26" y={n.y + 15} fontFamily="JetBrains Mono" fontSize="10" fontWeight="600" fill={n.textFill || "#2E2218"} letterSpacing="1.6">{n.text}</text>
                  <text x="26" y={n.y + 28} fontFamily="Inter" fontSize="10.5" fill={n.subFill || "#6C5038"}>{n.sub}</text>
                </g>
              ))}

              {/* flow lines into engine, then to plan */}
              <path d="M234,41  C 280,41 300,179 350,179" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
              <path d="M234,87  C 290,87 310,179 350,179" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
              <path d="M234,133 C 300,133 320,179 350,179" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />

              {/* Engine → Plan */}
              <path d="M468,179 L580,179" fill="none" stroke="#2E2218" strokeWidth="1.8" markerEnd="url(#arrow)" />

              {/* Plan node */}
              <rect x="580" y="160" width="130" height="38" rx="10" fill="#FBF6EF" stroke="#2E2218" strokeWidth="1.4" />
              <text x="595" y="178" fontFamily="Fraunces" fontSize="14" fontWeight="600" fill="#2E2218">Today's plan</text>
              <text x="595" y="190" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">7 tasks · 6.5h</text>
            </svg>
          </div>

          {/* right key */}
          <div className="p-5 border-l border-[#EFE2C9]">
            <div className="eyebrow">Provenance key</div>
            <div className="mt-3 space-y-2">
              <div className="key-line"><span className="key-dot" style={{background:'#ECE7F2', border:'1px solid #8F86A1'}}></span><span><strong>User</strong> · your data</span></div>
              <div className="key-line"><span className="key-dot" style={{background:'#E4EDE0', border:'1px solid #94B28A'}}></span><span><strong>Exam</strong> · syllabus + PYQ</span></div>
              <div className="key-line"><span className="key-dot" style={{background:'#F1E1CD', border:'1px solid #D6BC93'}}></span><span><strong>Update</strong> · official + trust-graded</span></div>
              <div className="key-line"><span className="key-dot" style={{background:'#2E2218'}}></span><span><strong>Engine</strong> · rules &amp; cadence</span></div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 *  PLAN
 * ---------------------------------------------------------------------- */

function TaskRow({ t, onToggle, onOpen, expanded }) {
  return (
    <div className="task-row" data-screen-label={`Task ${t.time}`}>
      <button onClick={() => onToggle(t.id)} aria-label={t.done ? "Mark undone" : "Mark done"} className="mt-1.5 outline-none">
        <span className={`tick ${t.done ? "done" : ""}`}></span>
      </button>

      <div className="text-[#6C5038] num-mono text-[12px] pt-1">
        <div>{t.time}</div>
        <div className="text-[10.5px] opacity-70">{t.duration}</div>
      </div>

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`text-[15px] leading-snug ${t.done ? "line-through text-[#A68057]" : "text-[#2E2218] font-medium"}`}>
            {t.title}
          </div>
          {t.isOneThing && <span className="pill pill-ink">One thing today</span>}
          {t.needsAck && <span className="pill pill-amber">Acknowledge change</span>}
        </div>
        <div className="text-[12.5px] text-[#6C5038] mt-1">{t.sub}</div>
        <div className="mt-2 flex flex-wrap gap-1.5 items-center">
          <span className="eyebrow !text-[9px] !tracking-[0.18em] mr-1">Generated from</span>
          {t.sources.map(s => <ChipForSource key={s.key} s={s} />)}
          <button onClick={() => onOpen(t.id)} className="text-[11px] text-[#6C5038] hover:text-[#2E2218] underline underline-offset-2 decoration-dotted ml-1">
            {expanded ? "Hide reasoning" : "Why this task →"}
          </button>
        </div>

        {expanded && <TaskReasoning t={t} />}
      </div>

      <div className="pt-1.5">
        <span className="pill pill-outline">{t.track}</span>
      </div>
    </div>
  );
}

function TaskReasoning({ t }) {
  /* Synthetic but realistic reasoning trace per task */
  const reasoning = [
    { layer: "user",   text: `From your action profile: ${t.sources.find(s=>s.layer==='user')?.label || "study history"}.` },
    { layer: "exam",   text: `Exam meta: ${t.sources.find(s=>s.layer==='exam')?.label || "phase priority"} — weights this slot up.` },
    t.sources.find(s=>s.layer==='update') && { layer:"update", text:`Update intelligence: ${t.sources.find(s=>s.layer==='update').label}. Source verified.` },
    { layer: "engine", text: `Engine rule fired: ${t.sources.find(s=>s.layer==='engine')?.label || "compile_daily"}. Confidence 0.86.` },
  ].filter(Boolean);

  return (
    <div className="mt-3 rounded-lg border border-[#EFE2C9] bg-[#FBF6EF]/70 px-3 py-2.5">
      <div className="eyebrow !text-[9.5px]">Reasoning trace</div>
      <ol className="mt-1.5 space-y-1">
        {reasoning.map((r,i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-snug">
            <span className={`chip chip-${r.layer}`} style={{minWidth: 64, justifyContent:'center'}}>{r.layer}</span>
            <span className="text-[#3a2e22]">{r.text}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlanPanel() {
  const [tasks, setTasks] = useState(TASKS);
  const [open, setOpen] = useState("t3");

  const done = tasks.filter(t=>t.done).length;
  const pct = Math.round((done / tasks.length) * 100);

  function toggle(id) { setTasks(ts => ts.map(t => t.id === id ? {...t, done: !t.done} : t)); }
  function openTask(id) { setOpen(o => o === id ? null : id); }

  return (
    <section className="soft-card relative grain overflow-hidden">
      <div className="px-7 pt-6 pb-4 flex items-end justify-between">
        <div>
          <div className="eyebrow">Today's plan</div>
          <h2 className="font-serif text-[26px] mt-1 leading-tight">Plan compiled at {ENGINE_META.generatedAt}</h2>
          <p className="text-[12.5px] text-[#6C5038] mt-1">Every task is traced to one or more layers. Tap "Why this task" for full reasoning.</p>
        </div>
        <div className="text-right">
          <div className="num-mono text-[11.5px] text-[#6C5038]">{done}/{tasks.length} done · {pct}%</div>
          <div className="mt-1.5 w-[180px] h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full bg-[#54794E]" style={{width: pct + "%"}}></div>
          </div>
        </div>
      </div>
      <div className="hairline mx-7"></div>
      <div className="px-7 pb-6 pt-2">
        {tasks.map(t => <TaskRow key={t.id} t={t} onToggle={toggle} onOpen={openTask} expanded={open === t.id} />)}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 *  UPDATE INTELLIGENCE — trust-tiered
 * ---------------------------------------------------------------------- */

function VerifiedCard({ u }) {
  return (
    <article className="verified-card rounded-2xl p-5 relative">
      <div className="flex items-start gap-3">
        <VerifiedSeal size={28} />
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TrustStamp kind="official" />
            <span className="pill pill-sage">{u.tag}</span>
          </div>
          <h3 className="font-serif text-[19px] leading-[1.2] mt-2">{u.title}</h3>
          <p className="text-[13px] text-[#3a2e22] mt-1.5">{u.summary}</p>
        </div>
      </div>
      <div className="rule mt-4 pt-3 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="eyebrow !text-[9.5px]">Source</div>
          <div className="num-mono text-[11.5px] mt-1 text-[#2E2218]">{u.source}</div>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px]">Effect on plan</div>
          <div className="text-[11.5px] mt-1 text-[#33482F]">{u.effect}</div>
        </div>
      </div>
      <div className="mt-3 flex items-center justify-between">
        <div className="num-mono text-[10px] text-[#6C5038]">Received {u.receivedAt} · sig {u.hash}</div>
        <a href="#" className="text-[11px] text-[#33482F] font-semibold hover:underline">Open original →</a>
      </div>
    </article>
  );
}

function UnverifiedCard({ u }) {
  const trustPct = Math.round((u.sourceTrust || 0) * 100);
  return (
    <article className="needs-verify-card rounded-2xl p-5 relative">
      <div className="flex items-start gap-3">
        <span className="inline-flex items-center justify-center rounded-full" style={{width:28, height:28, background:'#FBF8F2', border:'1px dashed #8F86A1', color:'#524864', flex:'0 0 auto'}}>
          <svg width="14" height="14" viewBox="0 0 16 16" fill="none"><circle cx="8" cy="8" r="6.5" stroke="#524864" strokeWidth="1.2" strokeDasharray="2 2"/><path d="M8 4.5v4.2M8 11.2v.6" stroke="#524864" strokeWidth="1.6" strokeLinecap="round"/></svg>
        </span>
        <div className="flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <TrustStamp kind={u.sourceType} />
            <span className="pill pill-dusk">{u.tag}</span>
          </div>
          <h3 className="font-serif text-[19px] leading-[1.2] mt-2 text-[#31293B]">{u.title}</h3>
          <p className="text-[13px] text-[#3a2e22] mt-1.5">{u.summary}</p>
        </div>
      </div>

      <div className="mt-3.5">
        <div className="flex items-center justify-between text-[10.5px] text-[#524864]">
          <span className="eyebrow !text-[9.5px]">Source trust</span>
          <span className="num-mono">{trustPct}%</span>
        </div>
        <div className="mt-1 h-[5px] bg-[#E3DFEA] rounded-full overflow-hidden">
          <div className="h-full" style={{ width: trustPct + "%", background: trustPct >= 70 ? '#8F86A1' : '#B7B0C4' }}></div>
        </div>
      </div>

      <div className="rule mt-4 pt-3 grid grid-cols-2 gap-3 text-[11px]">
        <div>
          <div className="eyebrow !text-[9.5px]">Source</div>
          <div className="num-mono text-[11.5px] mt-1 text-[#31293B]">{u.source}</div>
        </div>
        <div>
          <div className="eyebrow !text-[9.5px]">Effect on plan</div>
          <div className="text-[11.5px] mt-1 text-[#524864]">{u.effect}</div>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <div className="num-mono text-[10px] text-[#524864]">Received {u.receivedAt}</div>
        <div className="flex gap-2">
          <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Mark verified</button>
          <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#8F86A1] text-[#31293B] font-semibold">Dismiss</button>
        </div>
      </div>
    </article>
  );
}

function UpdatePanel({ trustEmphasis }) {
  return (
    <section className="soft-card relative grain overflow-hidden">
      <div className="px-7 pt-6 pb-4">
        <div className="flex items-end justify-between">
          <div>
            <div className="eyebrow">Update intelligence</div>
            <h2 className="font-serif text-[26px] mt-1 leading-tight">Exam updates, separated by trust.</h2>
            <p className="text-[12.5px] text-[#6C5038] mt-1 max-w-[68ch]">
              Official updates have a verified seal and change your plan automatically. Aggregator, research and opportunity-only updates are surfaced separately and never silently rewrite your plan.
            </p>
          </div>
          <div className="num-mono text-[10.5px] text-[#6C5038] text-right">
            Last sync 2m ago<br/>
            <span className="text-[#33482F]">{UPDATES.verified.length} official</span>
            {" · "}
            <span className="text-[#524864]">{UPDATES.unverified.length} unverified</span>
          </div>
        </div>
      </div>

      <div className="hairline mx-7"></div>

      <div className="grid grid-cols-2 gap-5 px-7 py-6">
        {/* Verified column */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span className="seal-verified inline-flex" style={{width:18, height:18}}></span>
            <div className="eyebrow !text-[10px] !text-[#33482F]">Officially verified · auto-applied</div>
          </div>
          <div className="space-y-4">
            {UPDATES.verified.map(u => <VerifiedCard key={u.id} u={u} />)}
          </div>
        </div>

        {/* Unverified column */}
        <div>
          <div className="flex items-center gap-2 mb-3">
            <span style={{width:18,height:18,borderRadius:999,border:'1px dashed #8F86A1', display:'inline-block'}}></span>
            <div className="eyebrow !text-[10px] !text-[#524864]">Needs verification · informational</div>
          </div>
          <div className="space-y-4">
            {UPDATES.unverified.map(u => <UnverifiedCard key={u.id} u={u} />)}
          </div>
        </div>
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 *  FOUR LAYERS PANEL — under the plan / above updates
 * ---------------------------------------------------------------------- */

function LayersPanel() {
  const layers = [
    {
      key: "user", title: "User intelligence", count: 14,
      caption: "What we know about you",
      items: [
        { k: "Persona",       v: `Aspirant · ${PERSONA.exam}` },
        { k: "Action profile",v: "Morning-heavy · Mock-cautious" },
        { k: "Study history", v: "168h last 30d · 82% consistency" },
        { k: "Mock history",  v: "13 mocks · best 134/200 · drift +8" },
        { k: "Weak topics",   v: PERSONA.weakTopics.length + " active" },
        { k: "Hours today",   v: PERSONA.hoursToday + "h available" },
      ],
    },
    {
      key: "exam", title: "Exam intelligence", count: 9,
      caption: "What the exam looks like",
      items: [
        { k: "Family",        v: PERSONA.family },
        { k: "Exam · cycle",  v: `${PERSONA.exam} · ${PERSONA.cycle}` },
        { k: "Phase",         v: PERSONA.phase + " · 108d to D-day" },
        { k: "Syllabus tree", v: "12 subjects · 184 topics · 1.1k µ-topics" },
        { k: "PYQ trend",     v: "Polity ↓ · Economy ↑ (last 3yr)" },
        { k: "Prereq graph",  v: "94 edges · 7 unblock today" },
        { k: "Calendar",      v: "Prelims Aug 30, Mains Sep 19" },
      ],
    },
    {
      key: "update", title: "Update intelligence", count: 11,
      caption: "What the world is saying",
      items: [
        { k: "Official",      v: "2 verified · CSE 2026 notification" },
        { k: "Deadline",      v: "Application opens May 22" },
        { k: "Syllabus chg.", v: "+4 µ-topics (Public Admin)" },
        { k: "Pattern chg.",  v: "None official · 1 research hint" },
        { k: "Aggregator",    v: "3 items · all flagged" },
        { k: "Current affairs",v: "Daily digest · 9 items" },
      ],
    },
    {
      key: "engine", title: "Study OS engine", count: 7,
      caption: "How it composes the plan",
      items: [
        { k: "Plan gen",      v: "compile_daily · v0.6" },
        { k: "Prioritization",v: "weak·prereq·cadence" },
        { k: "Spaced rev",    v: "3 due · interval ±2d" },
        { k: "Weak drill",    v: "Federalism · 1 cycle" },
        { k: "Mock cadence",  v: "Next: Mock 14 tonight" },
        { k: "Daily compiler",v: "7 tasks · 6.5h" },
        { k: "Adapt",         v: "Paused (no negative drift)" },
      ],
    },
  ];

  return (
    <section className="soft-card relative grain overflow-hidden">
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <div className="eyebrow">The four layers</div>
          <h2 className="font-serif text-[26px] mt-1 leading-tight">What feeds your plan.</h2>
          <p className="text-[12.5px] text-[#6C5038] mt-1">Each layer is auditable. Hover any task to see which signals it pulled from.</p>
        </div>
        <a href="#" className="text-[12px] text-[#6C5038] underline underline-offset-2 decoration-dotted">Open full data inspector →</a>
      </div>
      <div className="hairline mx-7"></div>

      <div className="grid grid-cols-4 gap-4 px-7 py-6">
        {layers.map(L => (
          <div key={L.key} className={`layer-card ${L.key}`}>
            <div className="flex items-center justify-between">
              <div className="eyebrow !text-[9.5px]">{L.title}</div>
              <span className="num-mono text-[10px] opacity-70">{L.count} signals</span>
            </div>
            <div className={`font-serif text-[16.5px] mt-1.5 ${L.key === 'engine' ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{L.caption}</div>
            <ul className="mt-3 space-y-1.5">
              {L.items.map((it,i) => (
                <li key={i} className="text-[12px] leading-snug flex justify-between gap-3">
                  <span className={`${L.key === 'engine' ? 'text-[#D6BC93]' : 'text-[#6C5038]'} num-mono uppercase`} style={{fontSize:10, letterSpacing:'0.05em', flex:'0 0 auto', width:88}}>{it.k}</span>
                  <span className={`text-right ${L.key === 'engine' ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{it.v}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>
    </section>
  );
}

/* ---------------------------------------------------------------------- *
 *  FOOTER STRIP
 * ---------------------------------------------------------------------- */

function FooterStrip() {
  return (
    <footer className="px-10 pt-3 pb-10 flex items-center justify-between">
      <div className="num-mono text-[10.5px] text-[#6C5038]">
        ccp · study-os build {ENGINE_META.version} · {ENGINE_META.generatedAt}
      </div>
      <div className="flex items-center gap-3">
        <span className="num-mono text-[10.5px] text-[#6C5038]">Trust policy:</span>
        <span className="stamp stamp-official">Auto-applied</span>
        <span className="stamp stamp-aggregator">Surfaced only</span>
        <span className="stamp stamp-research">Hint only</span>
        <span className="stamp stamp-opportunity">Adjacent</span>
      </div>
    </footer>
  );
}

/* ---------------------------------------------------------------------- *
 *  TWEAKS
 * ---------------------------------------------------------------------- */

const TWEAK_DEFAULTS = /*EDITMODE-BEGIN*/{
  "density": "comfortable",
  "trustEmphasis": "loud",
  "engineTrace": true,
  "verifiedAccent": "sage"
}/*EDITMODE-END*/;

/* ---------------------------------------------------------------------- *
 *  APP
 * ---------------------------------------------------------------------- */

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  return (
    <div className="min-h-screen" data-density={t.density}>
      <div className="max-w-[1440px] mx-auto pb-6" data-screen-label="01 Today — Mission Control">
        <Header />
        {t.engineTrace && <EngineTrace />}
        <div className="px-10 mt-6 space-y-6">
          <PlanPanel />
          <LayersPanel />
          <UpdatePanel trustEmphasis={t.trustEmphasis} />
        </div>
        <FooterStrip />
      </div>

      <TweaksPanel title="Tweaks">
        <TweakSection title="Layout">
          <TweakRadio label="Density" value={t.density} onChange={(v)=>setTweak('density', v)} options={[
            {value:'comfortable', label:'Comfy'},
            {value:'compact', label:'Compact'},
          ]} />
          <TweakToggle label="Show engine trace" value={t.engineTrace} onChange={(v)=>setTweak('engineTrace', v)} />
        </TweakSection>
        <TweakSection title="Trust visual">
          <TweakRadio label="Verified emphasis" value={t.trustEmphasis} onChange={(v)=>setTweak('trustEmphasis', v)} options={[
            {value:'subtle', label:'Subtle'},
            {value:'loud', label:'Loud'},
          ]} />
        </TweakSection>
      </TweaksPanel>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
