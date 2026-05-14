/* global React, DATA */
const { useState } = React;

function TodayHeader() {
  const u = DATA.user;
  const m = DATA.engineMeta;
  return (
    <header className="px-10 pt-9 pb-7">
      <div className="flex items-end justify-between gap-6">
        <div>
          <Eyebrow>Today · Study OS Mission Control · {m.generatedAt}</Eyebrow>
          <h1 className="text-[40px] mt-2 leading-[1.05]">Your plan, adapted from verified signals and recent progress.</h1>
          <p className="text-[15px] text-[#6C5038] mt-2 max-w-[64ch]">
            Seven tasks · {u.hoursToday}h available · compiled from four intelligence layers. Each task is traceable. Nothing here was guessed by hand.
          </p>
        </div>
        <div className="text-right shrink-0">
          <Eyebrow>Cycle</Eyebrow>
          <div className="font-serif text-[20px] mt-1">{u.exam} · {u.cycle}</div>
          <div className="text-[12px] text-[#6C5038] mt-1">Phase: <strong className="text-[#2E2218]">{u.phase}</strong> · {u.daysToD}d to D-day · {Math.round(u.weekConsistency*100)}% consistency</div>
          <div className="mt-2"><StatusDot state="live" label="Live · /api/study/mission-control" /></div>
        </div>
      </div>
    </header>
  );
}

function ActivePlanCard() {
  const m = DATA.engineMeta;
  return (
    <Card>
      <div className="flex items-start justify-between gap-6">
        <div>
          <Eyebrow>Active plan</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{m.planTheme}</h2>
          <p className="text-[13px] text-[#6C5038] mt-1.5 max-w-[60ch]">{m.planTarget}</p>
          <div className="mt-3 flex flex-wrap gap-2 items-center">
            <Pill tone="ink">{DATA.user.exam}</Pill>
            <Pill tone="sage">{DATA.user.phase}</Pill>
            <Pill tone="clay">{DATA.user.daysToD}d to D-day</Pill>
            <Pill tone="outline">Plan source: existing → adapted</Pill>
          </div>
        </div>
        <div className="text-right shrink-0">
          <div className="num-mono text-[10.5px] text-[#6C5038]">{m.version}</div>
          <div className="num-mono text-[10.5px] text-[#6C5038]">{m.inputs} signals · {m.rulesFired} rules fired</div>
          <div className="mt-3 flex justify-end"><StatusDot state="live" /></div>
        </div>
      </div>
    </Card>
  );
}

function SafeExplanationCard() {
  const s = DATA.safeExplanation;
  return (
    <Card>
      <Eyebrow>What changed and why</Eyebrow>
      <h2 className="font-serif text-[22px] mt-1.5 leading-snug max-w-[64ch]">{s.headline}</h2>
      <div className="mt-4 flex flex-wrap gap-2">
        {s.signals.map((sig,i) => <Pill key={i} tone={sig.tone}>{sig.label}</Pill>)}
      </div>
      <div className="rule mt-5 pt-3 text-[11.5px] text-[#6C5038]">
        We show the <em>signals</em> that shaped today's plan — never internal persona labels. Tap any task below to see the exact reasoning.
      </div>
    </Card>
  );
}

function MetricsRow() {
  return (
    <div className="grid grid-cols-6 gap-3">
      {DATA.metrics.map((m,i) => (
        <div key={i} className="soft-card grain relative px-4 py-3.5">
          <Eyebrow>{m.k}</Eyebrow>
          <div className="font-serif text-[22px] mt-1.5 leading-none">{m.v}</div>
          <div className={`text-[11px] mt-2 ${m.tone === 'sage' ? 'text-[#33482F]' : m.tone === 'amber' ? 'text-[#6F5A22]' : 'text-[#6C5038]'}`}>{m.delta}</div>
          <div className="absolute top-3 right-3"><StatusDot state={m.live === true ? "live" : m.live === "partial" ? "partial" : "preview"} label="" /></div>
        </div>
      ))}
    </div>
  );
}

function NextBestActionCard() {
  const n = DATA.nextBest;
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-5">
        <div className="shrink-0 mt-1">
          <div className="w-12 h-12 rounded-2xl bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 12h11l-4-4m4 4-4 4" stroke="#F3EADB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="flex-1">
          <Eyebrow tone="dark">Next best action · one decision now</Eyebrow>
          <h2 className="font-serif text-[26px] text-[#F3EADB] mt-1 leading-tight">{n.title}</h2>
          <p className="text-[13px] text-[#D6BC93] mt-2 max-w-[64ch]">{n.body}</p>
          <div className="mt-3 flex gap-1.5 items-center flex-wrap">
            {n.reasonChips.map((c,i) => <Chip key={i} s={c} />)}
            <span className="num-mono text-[10.5px] text-[#A68057] ml-2">est. {n.estimate}</span>
          </div>
        </div>
        <div className="shrink-0 flex flex-col gap-2">
          <button className="px-4 py-2 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold text-[13px]">{n.cta} →</button>
          <button className="px-4 py-2 rounded-full bg-transparent border border-[#6C5038] text-[#D6BC93] font-semibold text-[12px]">Defer to evening</button>
        </div>
      </div>
    </Card>
  );
}

function PersonaQuestionCard() {
  const q = DATA.personaQuestion;
  const [a, setA] = useState(null);
  return (
    <Card className="!bg-[#F7F5FB] !border-[#DDDAE3]">
      <div className="flex items-start gap-4">
        <div className="shrink-0">
          <span className="chip chip-user" style={{fontSize:11}}>u· signal</span>
        </div>
        <div className="flex-1">
          <Eyebrow>One tiny question</Eyebrow>
          <h2 className="font-serif text-[20px] mt-1.5 text-[#31293B]">{q.prompt}</h2>
          <div className="mt-3 flex flex-wrap gap-2">
            {q.options.map(o => (
              <button key={o} onClick={()=>setA(o)} className={`px-3 py-1.5 rounded-full text-[12.5px] border ${a===o ? 'bg-[#31293B] text-[#F0EFF3] border-[#31293B]' : 'bg-white/80 border-[#DDDAE3] text-[#31293B] hover:border-[#8F86A1]'}`}>{o}</button>
            ))}
          </div>
          <div className="text-[11.5px] text-[#524864] mt-3 max-w-[60ch]">{q.why}</div>
        </div>
      </div>
    </Card>
  );
}

function TaskCard({ t, expanded, onToggle, onExpand, onAction }) {
  const status = t.status;
  return (
    <div className="task-row" data-screen-label={`Task ${t.time}`}>
      <button onClick={()=>onToggle(t.id)} aria-label="toggle" className="mt-1.5 outline-none">
        <span className={`tick ${status === 'done' ? 'done' : ''} ${status === 'skipped' ? 'skip' : ''}`}></span>
      </button>
      <div className="text-[#6C5038] num-mono text-[12px] pt-1">
        <div>{t.time}</div>
        <div className="text-[10.5px] opacity-70">{t.duration}</div>
      </div>
      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className={`text-[15px] leading-snug ${status === 'done' ? 'line-through text-[#A68057]' : 'text-[#2E2218] font-medium'}`}>{t.title}</div>
          {t.oneThing && <Pill tone="ink">One thing today</Pill>}
          {t.needsAck && <Pill tone="amber">Acknowledge change</Pill>}
          {status === 'in-progress' && <Pill tone="sage">In progress</Pill>}
        </div>
        <div className="text-[12px] text-[#6C5038] mt-1">{t.topic} · {t.type}</div>
        <div className="text-[12.5px] text-[#6C5038] mt-1.5">{t.sub}</div>
        <div className="mt-2.5"><ProvenanceChips sources={t.sources} /></div>
        <button onClick={()=>onExpand(t.id)} className="text-[11px] text-[#6C5038] hover:text-[#2E2218] underline underline-offset-2 decoration-dotted mt-2">
          {expanded ? "Hide reasoning" : "Why this task →"}
        </button>
        {expanded && <TaskReasoning t={t} />}
        {expanded && (
          <div className="mt-3 flex flex-wrap gap-2">
            <ActionButton kind="primary" onClick={()=>onAction("start", t.id)}>Start focus</ActionButton>
            <ActionButton onClick={()=>onAction("complete", t.id)}>Mark complete</ActionButton>
            <ActionButton onClick={()=>onAction("reschedule", t.id)}>Reschedule</ActionButton>
            <ActionButton onClick={()=>onAction("difficult", t.id)}>Mark difficult</ActionButton>
            <ActionButton onClick={()=>onAction("skip", t.id)} tone="ghost">Skip</ActionButton>
          </div>
        )}
      </div>
      <div className="pt-1.5 flex flex-col items-end gap-1.5">
        <Pill tone="outline">{t.type}</Pill>
        <span className="num-mono text-[10.5px] text-[#6C5038]">{t.planned}m planned</span>
      </div>
    </div>
  );
}

function ActionButton({ children, kind, tone, onClick }) {
  const cls = kind === "primary"
    ? "bg-[#2E2218] text-[#F3EADB] border-[#2E2218]"
    : tone === "ghost"
      ? "bg-transparent border-[#E7DECB] text-[#6C5038]"
      : "bg-[#F3EADB] border-[#E7DECB] text-[#2E2218]";
  return <button onClick={onClick} className={`text-[11.5px] px-3 py-1.5 rounded-full border font-semibold ${cls}`}>{children}</button>;
}

function TaskReasoning({ t }) {
  const reasoning = [
    { layer:"user",   text:`From your action profile: ${t.sources.find(s=>s.layer==='user')?.label || 'study history'}.`, evid:"6 events" },
    { layer:"exam",   text:`Exam meta: ${t.sources.find(s=>s.layer==='exam')?.label || 'phase priority'} — weights this slot up.`, evid:"locked" },
    t.sources.find(s=>s.layer==='update') && { layer:"update", text:`Update intelligence: ${t.sources.find(s=>s.layer==='update').label}. Source verified.`, evid:"upsc.gov.in" },
    { layer:"engine", text:`Engine rule fired: ${t.sources.find(s=>s.layer==='engine')?.label || 'compile_daily'}. Confidence 0.86.`, evid:"v0.6" },
  ].filter(Boolean);
  return (
    <div className="mt-3 rounded-lg border border-[#EFE2C9] bg-[#FBF6EF]/70 px-3 py-2.5">
      <div className="flex items-center justify-between">
        <Eyebrow>Reasoning trace</Eyebrow>
        <span className="num-mono text-[10px] text-[#6C5038]">{reasoning.length} layers · 1 rule</span>
      </div>
      <ol className="mt-2 space-y-1.5">
        {reasoning.map((r,i) => (
          <li key={i} className="flex gap-2 text-[12.5px] leading-snug items-start">
            <span className={`chip chip-${r.layer}`} style={{minWidth:64, justifyContent:'center'}}>{r.layer}</span>
            <span className="text-[#3a2e22] flex-1">{r.text}</span>
            <span className="num-mono text-[10px] text-[#6C5038] shrink-0 mt-0.5">{r.evid}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function PlanPanel() {
  const [tasks, setTasks] = useState(DATA.tasks);
  const [open, setOpen] = useState("t3");
  const done = tasks.filter(t=>t.status === 'done').length;
  const pct = Math.round((done / tasks.length) * 100);
  function toggle(id) { setTasks(ts => ts.map(t => t.id === id ? {...t, status: t.status === 'done' ? 'todo' : 'done'} : t)); }
  function expand(id) { setOpen(o => o === id ? null : id); }
  function action(_kind, _id) {}

  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-4 flex items-end justify-between">
        <div>
          <Eyebrow>Today's tasks</Eyebrow>
          <h2 className="font-serif text-[26px] mt-1 leading-tight">Plan compiled at {DATA.engineMeta.generatedAt}</h2>
          <p className="text-[12.5px] text-[#6C5038] mt-1">Each task carries source chips. Tap "Why this task" for the reasoning drawer.</p>
        </div>
        <div className="text-right">
          <div className="num-mono text-[11.5px] text-[#6C5038]">{done}/{tasks.length} done · {pct}%</div>
          <div className="mt-1.5 w-[180px] h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full bg-[#54794E]" style={{width:pct+"%"}}></div>
          </div>
        </div>
      </div>
      <div className="hairline mx-7"></div>
      <div className="px-7 pb-6 pt-2">
        {tasks.map(t => <TaskCard key={t.id} t={t} expanded={open===t.id} onToggle={toggle} onExpand={expand} onAction={action} />)}
      </div>
    </Card>
  );
}

function PlanReasoningCard() {
  return (
    <Card>
      <SectionHeader eyebrow="Plan reasoning" title="What changed in your plan." sub="Live = backed by current backend signals. Preview = UI is built, backend hookup pending." right={<StatusDot state="live" />} />
      <ul className="space-y-2">
        {DATA.planReasoning.map((r,i) => (
          <li key={i} className="flex items-start gap-3 text-[13.5px]">
            <span className={`sdot ${r.state === 'live' ? 'sdot-live' : r.state === 'preview' ? 'sdot-preview' : 'sdot-not'} mt-2`}></span>
            <span className="flex-1">{r.text}</span>
            <span className="num-mono text-[10.5px] text-[#6C5038] mt-1 shrink-0">{r.state}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function StudyPolicyPreview() {
  const p = DATA.studyPolicy;
  return (
    <Card>
      <SectionHeader eyebrow="Study policy preview"
        title="The rules behind today's task selection."
        sub="Generated from your persona snapshot. Edit in Settings to tune."
        right={<StatusDot state="partial" label="Partially connected · /api/persona/policy" />} />
      <div className="grid grid-cols-3 gap-5">
        <div>
          <Eyebrow>Daily target</Eyebrow>
          <div className="font-serif text-[18px] mt-1.5">{p.dailyTarget}</div>
          <div className="text-[12px] text-[#6C5038] mt-1">Max {p.maxTasksPerDay} tasks · prefer {p.taskSizePreference}</div>
        </div>
        <div>
          <Eyebrow>Task mix</Eyebrow>
          <div className="mt-2 space-y-1.5">
            {p.mix.map((m,i) => (
              <div key={i} className="flex items-center gap-2 text-[12px]">
                <span className="w-[120px] text-[#3a2e22]">{m.k}</span>
                <MiniBar pct={m.pct/100} width={120} />
                <span className="num-mono text-[11px] text-[#6C5038]">{m.pct}%</span>
              </div>
            ))}
          </div>
        </div>
        <div>
          <Eyebrow>Constraints</Eyebrow>
          <ul className="mt-2 space-y-1.5 text-[12.5px] text-[#3a2e22]">
            {p.constraints.map((c,i) => <li key={i} className="flex items-start gap-2"><span className="text-[#54794E] mt-0.5">·</span><span>{c}</span></li>)}
          </ul>
        </div>
      </div>
    </Card>
  );
}

function TruthPanel() {
  const t = DATA.truthPanel;
  return (
    <Card>
      <SectionHeader eyebrow="Truth panel · weekly"
        title="Honest read. No motivational fluff."
        sub="What improved, what declined, what needs correction." right={<StatusDot state="live" />} />
      <div className="grid grid-cols-3 gap-5">
        <TruthCol title="Improved" tone="sage" items={t.improved} />
        <TruthCol title="Declined" tone="rose" items={t.declined} />
        <TruthCol title="Needs correction" tone="amber" items={t.correction} />
      </div>
    </Card>
  );
}
function TruthCol({ title, tone, items }) {
  const bg = tone === "sage" ? "#F0F5EF" : tone === "rose" ? "#F2DDD6" : "#F3E9CF";
  const fg = tone === "sage" ? "#33482F" : tone === "rose" ? "#7A3925" : "#6F5A22";
  return (
    <div className="rounded-xl border border-[#E7DECB] p-4" style={{background:bg}}>
      <div className="eyebrow !text-[10px]" style={{color:fg}}>{title}</div>
      <ul className="mt-2 space-y-1.5 text-[12.5px]" style={{color:fg}}>
        {items.map((it,i) => <li key={i} className="flex gap-2 items-start"><span className="opacity-60">·</span><span>{it}</span></li>)}
      </ul>
    </div>
  );
}

function ExamContextCard() {
  const e = DATA.examContext;
  return (
    <Card>
      <SectionHeader eyebrow="Exam context" title="What we know about this exam." right={<StatusDot state={e.status === 'connected' ? 'live' : 'partial'} label={e.status === 'connected' ? "Connected" : "Partially connected"} />} />
      <div className="grid grid-cols-4 gap-4">
        <FactCell k="Family" v={e.family} />
        <FactCell k="Exam · cycle" v={`${e.exam} · ${e.cycle}`} />
        <FactCell k="Phase" v={e.phase} />
        <FactCell k="Status" v={<TrustStamp kind="live" label="Connected" />} />
        <FactCell k="Verified topics" v={<span className="num-mono">{e.verifiedTopics}</span>} />
        <FactCell k="Verified PYQ tags" v={<span className="num-mono">{e.verifiedPYQ}</span>} />
        <FactCell k="Syllabus mentions" v={<span className="num-mono">{e.syllabusMentions} pending</span>} />
        <FactCell k="Source" v="/admin/exam-intelligence" />
      </div>
    </Card>
  );
}
function FactCell({ k, v }) {
  return (
    <div>
      <Eyebrow>{k}</Eyebrow>
      <div className="mt-1.5 text-[14px]">{v}</div>
    </div>
  );
}

function CompetitionContextCard() {
  const c = DATA.competitionContext;
  return (
    <Card>
      <SectionHeader eyebrow="Competition context"
        title="Useful for context, not for planning."
        sub="Competition data is preview unless reviewer-locked. The plan does not adapt to unverified numbers."
        right={<StatusDot state="partial" label="Mixed · 1 locked / 3 preview" />} />
      <div className="grid grid-cols-4 gap-4">
        <CompCell k="Vacancy"          v={c.vacancy.v}           trust={c.vacancy.trust} />
        <CompCell k="Applicants"        v={c.applicants.v}        trust={c.applicants.trust} />
        <CompCell k="Cutoff trend"      v={c.cutoffTrend.v}       trust={c.cutoffTrend.trust} />
        <CompCell k="Difficulty trend"  v={c.difficultyTrend.v}   trust={c.difficultyTrend.trust} />
      </div>
    </Card>
  );
}
function CompCell({ k, v, trust }) {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-serif text-[18px] mt-1.5">{v}</div>
      <div className="mt-2"><TrustStamp kind={trust} /></div>
    </div>
  );
}

function EngineTrace() {
  return (
    <Card padded={false}>
      <div className="grid grid-cols-[200px_1fr_220px]">
        <div className="p-5 border-r border-[#EFE2C9]">
          <Eyebrow>Engine trace</Eyebrow>
          <div className="font-serif text-[22px] mt-1.5 leading-[1.1]">Why today<br/>looks like this.</div>
          <div className="num-mono text-[10.5px] text-[#6C5038] mt-3 leading-relaxed">
            {DATA.engineMeta.version}<br/>
            {DATA.engineMeta.inputs} signals · {DATA.engineMeta.rulesFired} rules fired
          </div>
          <div className="mt-3"><StatusDot state="live" /></div>
        </div>
        <div className="relative">
          <svg viewBox="0 0 720 220" className="w-full h-[220px] block">
            <defs>
              <marker id="arrow2" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse">
                <path d="M0,0 L10,5 L0,10 z" fill="#8A6846" />
              </marker>
            </defs>
            {[
              { y:18,  fill:"#ECE7F2", stroke:"#8F86A1", text:"USER INTELLIGENCE",   sub:"persona · weak topics · hours" },
              { y:64,  fill:"#E4EDE0", stroke:"#94B28A", text:"EXAM INTELLIGENCE",   sub:"syllabus · PYQ · prereq graph" },
              { y:110, fill:"#F1E1CD", stroke:"#D6BC93", text:"UPDATE INTELLIGENCE", sub:"official + aggregator + research" },
              { y:156, fill:"#DDE3EC", stroke:"#7A8AA5", text:"STUDY HISTORY · MOCKS · FOCUS", sub:"adherence · review · consistency" },
              { y:198, fill:"#2E2218", stroke:"#2E2218", text:"STUDY OS ENGINE",     sub:"plan · prio · spaced · adapt", textFill:"#F3EADB", subFill:"#D6BC93" },
            ].map((n,i) => (
              <g key={i}>
                <rect x="14" y={n.y} width="240" height="32" rx="8" fill={n.fill} stroke={n.stroke} />
                <text x="26" y={n.y + 14} fontFamily="JetBrains Mono" fontSize="10" fontWeight="600" fill={n.textFill || "#2E2218"} letterSpacing="1.4">{n.text}</text>
                <text x="26" y={n.y + 26} fontFamily="Inter" fontSize="10.5" fill={n.subFill || "#6C5038"}>{n.sub}</text>
              </g>
            ))}
            <path d="M254,34  C 300,34  330,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,80  C 310,80  340,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,126 C 320,126 350,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />
            <path d="M254,172 C 330,172 360,214 380,214" fill="none" stroke="#8A6846" strokeWidth="1.2" className="flow-line" />

            <path d="M498,214 L580,214" fill="none" stroke="#2E2218" strokeWidth="1.8" markerEnd="url(#arrow2)" />
            <rect x="580" y="194" width="130" height="40" rx="10" fill="#FBF6EF" stroke="#2E2218" strokeWidth="1.4" />
            <text x="595" y="213" fontFamily="Fraunces" fontSize="14" fontWeight="600" fill="#2E2218">Today's plan</text>
            <text x="595" y="225" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">7 tasks · 6.5h</text>
          </svg>
        </div>
        <div className="p-5 border-l border-[#EFE2C9]">
          <Eyebrow>Provenance key</Eyebrow>
          <div className="mt-3 space-y-2 text-[11.5px]">
            <KeyRow color="#ECE7F2" border="#8F86A1" k="User"   v="your data" />
            <KeyRow color="#E4EDE0" border="#94B28A" k="Exam"   v="syllabus + PYQ" />
            <KeyRow color="#F1E1CD" border="#D6BC93" k="Update" v="official + trust-graded" />
            <KeyRow color="#DDE3EC" border="#7A8AA5" k="History" v="study + mocks + focus" />
            <KeyRow color="#2E2218" border="#2E2218" k="Engine" v="rules & cadence" dark />
          </div>
        </div>
      </div>
    </Card>
  );
}
function KeyRow({ color, border, k, v, dark }) {
  return (
    <div className="flex items-center gap-2.5">
      <span style={{background:color, border:`1px solid ${border}`, width:10, height:10, borderRadius:3}}></span>
      <span><strong>{k}</strong> · <span className="text-[#6C5038]">{v}</span></span>
    </div>
  );
}

function IntelligenceLayersPanel() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>The four layers</Eyebrow>
          <h2 className="font-serif text-[26px] mt-1 leading-tight">What feeds your plan.</h2>
          <p className="text-[12.5px] text-[#6C5038] mt-1">Each layer is auditable. Hover any task to see which signals it pulled from.</p>
        </div>
        <a href="#" className="text-[12px] text-[#6C5038] underline underline-offset-2 decoration-dotted">Open full data inspector →</a>
      </div>
      <div className="hairline mx-7"></div>
      <div className="grid grid-cols-4 gap-4 px-7 py-6">
        {DATA.layers.map(L => <LayerCard key={L.key} L={L} />)}
      </div>
    </Card>
  );
}

function LayerCard({ L }) {
  const dark = L.key === 'engine';
  return (
    <div className={`layer-card ${L.key}`}>
      <div className="flex items-center justify-between">
        <div className="eyebrow !text-[9.5px]" style={dark ? {color:'rgba(243,234,219,0.55)'} : {}}>{L.title}</div>
        <span className="num-mono text-[10px] opacity-70" style={dark ? {color:'#D6BC93'} : {}}>{L.count} signals</span>
      </div>
      <div className={`font-serif text-[16.5px] mt-1.5 ${dark ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{L.caption}</div>
      <ul className="mt-3 space-y-1.5">
        {L.items.map((it,i) => (
          <li key={i} className="text-[12px] leading-snug flex justify-between gap-3">
            <span className={`${dark ? 'text-[#D6BC93]' : 'text-[#6C5038]'} num-mono uppercase`} style={{fontSize:10, letterSpacing:'0.05em', flex:'0 0 auto', width:96}}>{it.k}</span>
            <span className={`text-right ${dark ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{it.v}</span>
          </li>
        ))}
      </ul>
      {L.missing && L.missing.length > 0 && (
        <div className={`mt-3 pt-2 border-t ${dark ? 'border-[#6C5038]' : 'border-[#EFE2C9]'}`}>
          <div className="eyebrow !text-[9px]" style={dark ? {color:'rgba(243,234,219,0.55)'} : {}}>Missing signals</div>
          <ul className={`mt-1.5 space-y-1 text-[11px] ${dark ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>
            {L.missing.map((m,i) => <li key={i}>· {m}</li>)}
          </ul>
        </div>
      )}
    </div>
  );
}

function UpdatePanel() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-4">
        <SectionHeader eyebrow="Update intelligence"
          title="Exam updates, separated by trust."
          sub="Official updates carry a verified seal and change your plan only after admin review. Aggregator, research and opportunity updates are surfaced separately and never silently rewrite your plan."
          right={
            <div className="num-mono text-[10.5px] text-[#6C5038] text-right">
              Last sync 2m ago<br/>
              <span className="text-[#33482F]">{DATA.updates.verified.length} official</span>
              {" · "}
              <span className="text-[#524864]">{DATA.updates.aggregator.length} aggregator</span>
              {" · "}
              <span className="text-[#6C5038]">{DATA.updates.research.length} research</span>
              {" · "}
              <span className="text-[#2E2218]">{DATA.updates.opportunity.length} opportunity</span>
            </div>
          } />
      </div>
      <div className="hairline mx-7"></div>
      <div className="grid grid-cols-4 gap-4 px-7 py-6">
        <UpdateLane kind="official" title="Official · auto-applied after admin review" items={DATA.updates.verified} />
        <UpdateLane kind="aggregator" title="Aggregator · discovery only" items={DATA.updates.aggregator} />
        <UpdateLane kind="research" title="Research · strategy hint only" items={DATA.updates.research} />
        <UpdateLane kind="opportunity" title="Opportunity · adjacent exams" items={DATA.updates.opportunity} />
      </div>
    </Card>
  );
}

function UpdateLane({ kind, title, items }) {
  const tone = { official:"#33482F", aggregator:"#524864", research:"#6C5038", opportunity:"#2E2218" }[kind];
  return (
    <div>
      <div className="flex items-center gap-2 mb-3">
        <TrustStamp kind={kind === "official" ? "official" : kind} />
      </div>
      <div className="eyebrow !text-[9.5px] mb-2" style={{color:tone}}>{title}</div>
      <div className="space-y-3">
        {items.map(u => <UpdateCard key={u.id} u={u} kind={kind} />)}
      </div>
    </div>
  );
}

function UpdateCard({ u, kind }) {
  if (kind === "official") return <VerifiedCard u={u} />;
  return <SoftUpdateCard u={u} kind={kind} />;
}

function VerifiedCard({ u }) {
  return (
    <article className="verified-card rounded-2xl p-4 relative">
      <div className="flex items-start gap-2.5">
        <VerifiedSeal size={22} />
        <div className="flex-1">
          <Pill tone="sage">{u.tag}</Pill>
          <h3 className="font-serif text-[16px] leading-[1.2] mt-1.5">{u.title}</h3>
          <p className="text-[12.5px] text-[#3a2e22] mt-1.5">{u.summary}</p>
        </div>
      </div>
      <div className="rule mt-3 pt-2.5 text-[11px]">
        <div className="num-mono text-[11px] text-[#2E2218]">{u.source}</div>
        <div className="text-[11px] mt-1 text-[#33482F]">{u.effect}</div>
      </div>
      <div className="mt-2 num-mono text-[10px] text-[#6C5038]">Received {u.receivedAt} · sig {u.hash}</div>
    </article>
  );
}

function SoftUpdateCard({ u, kind }) {
  const trustPct = Math.round((u.trust || 0) * 100);
  return (
    <article className="needs-verify-card rounded-2xl p-4">
      <Pill tone="dusk">{u.tag}</Pill>
      <h3 className="font-serif text-[16px] leading-[1.2] mt-1.5 text-[#31293B]">{u.title}</h3>
      <p className="text-[12.5px] text-[#3a2e22] mt-1.5">{u.summary}</p>
      {u.trust != null && (
        <div className="mt-3">
          <div className="flex items-center justify-between text-[10.5px] text-[#524864]">
            <span className="eyebrow !text-[9.5px]">Source trust</span>
            <span className="num-mono">{trustPct}%</span>
          </div>
          <div className="mt-1 h-[5px] bg-[#E3DFEA] rounded-full overflow-hidden">
            <div className="h-full" style={{ width: trustPct+"%", background: trustPct >= 70 ? '#8F86A1' : '#B7B0C4' }}></div>
          </div>
        </div>
      )}
      <div className="rule mt-3 pt-2.5">
        <div className="num-mono text-[11px] text-[#31293B]">{u.source}</div>
        <div className="text-[11px] mt-1 text-[#524864]">{u.effect}</div>
      </div>
      <div className="mt-2 flex justify-between items-center">
        <div className="num-mono text-[10px] text-[#524864]">{u.receivedAt}</div>
        {kind === "aggregator" && (
          <button className="text-[10.5px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Mark verified</button>
        )}
      </div>
    </article>
  );
}

function FooterStrip() {
  return (
    <footer className="px-10 pt-3 pb-10 flex items-center justify-between flex-wrap gap-3">
      <div className="num-mono text-[10.5px] text-[#6C5038]">
        ccp · study-os {DATA.engineMeta.version} · {DATA.engineMeta.generatedAt}
      </div>
      <div className="flex items-center gap-2 flex-wrap">
        <span className="num-mono text-[10.5px] text-[#6C5038]">Trust policy:</span>
        <TrustStamp kind="official" label="Auto-apply after review" />
        <TrustStamp kind="aggregator" label="Discovery only" />
        <TrustStamp kind="research" label="Hint only" />
        <TrustStamp kind="opportunity" label="Adjacent" />
      </div>
    </footer>
  );
}

function ScreenToday() {
  return (
    <div data-screen-label="Today · Study OS Mission Control">
      <TodayHeader />
      <div className="px-10 space-y-6">
        <ActivePlanCard />
        <SafeExplanationCard />
        <MetricsRow />
        <NextBestActionCard />
        <div className="grid grid-cols-[1fr_360px] gap-6">
          <PlanPanel />
          <div className="space-y-6">
            <PersonaQuestionCard />
            <PlanReasoningCard />
          </div>
        </div>
        <StudyPolicyPreview />
        <TruthPanel />
        <div className="grid grid-cols-2 gap-6">
          <ExamContextCard />
          <CompetitionContextCard />
        </div>
        <EngineTrace />
        <IntelligenceLayersPanel />
        <UpdatePanel />
      </div>
      <FooterStrip />
    </div>
  );
}

window.ScreenToday = ScreenToday;
