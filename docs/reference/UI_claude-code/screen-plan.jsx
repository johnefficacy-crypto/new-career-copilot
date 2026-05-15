/* /app/study-plan — Plan timeline & adaptation */
const { useState: useStateP } = React;

function ScreenPlan() {
  const [preview, setPreview] = useStateP(false);
  return (
    <div data-screen-label="Study Plan · Timeline & adaptation">
      <PageHeader
        eyebrow="Study Plan · v0.6.4"
        title="Your week, with every change traced."
        sub="Active plan timeline · adaptation preview · plan change log. The plan only mutates after you preview and approve."
        right={
          <div className="text-right">
            <div className="num-mono text-[10.5px] text-[#6C5038]">Last regen May 14 · 03:12</div>
            <div className="mt-2 flex gap-2 justify-end">
              <button onClick={()=>setPreview(true)} className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Preview correction</button>
              <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Keep current plan</button>
            </div>
            <div className="mt-2"><StatusDot state="live" /></div>
          </div>
        } />
      <div className="px-10 space-y-6">
        <WeekTimeline />
        {preview && <PlanAdaptationPreview onClose={()=>setPreview(false)} />}
        <div className="grid grid-cols-[1fr_400px] gap-6">
          <PlanByTopic />
          <div className="space-y-6">
            <BacklogCard />
            <PlanChangeLogCard />
          </div>
        </div>
      </div>
      <FooterStrip />
    </div>
  );
}

function WeekTimeline() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>This week · adapted</Eyebrow>
          <h2 className="font-serif text-[24px] mt-1">May 13 – May 19 · 38 tasks · 38.5h focus</h2>
        </div>
        <div className="flex gap-2">
          <Pill tone="outline">v0.6.4 · adapted</Pill>
          <Pill tone="sage">Mon → Sun</Pill>
        </div>
      </div>
      <div className="hairline mx-7"></div>
      <div className="px-7 py-5">
        <div className="grid grid-cols-7 gap-3">
          {DATA.weekPlan.map((d,i) => <DayCell key={i} d={d} />)}
        </div>
      </div>
    </Card>
  );
}

function DayCell({ d }) {
  const isToday = d.isToday;
  return (
    <div className={`rounded-xl border ${isToday ? 'border-[#2E2218] bg-[#FBF6EF]' : 'border-[#E7DECB] bg-white/60'} p-3 relative`}>
      {isToday && <div className="absolute -top-2 left-3 px-2 py-0.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[9px] uppercase tracking-[0.18em] font-semibold">Today</div>}
      <div className="num-mono text-[10.5px] text-[#6C5038]">{d.day}</div>
      <div className="font-serif text-[14px] mt-1 leading-snug">{d.focus}</div>
      <div className="mt-2.5 flex items-center gap-2 text-[11px] text-[#6C5038]">
        <span className="num-mono">{d.tasks} tasks</span>
        <span>·</span>
        <span className="num-mono">{d.hours}h</span>
      </div>
      <div className="mt-2.5">
        <div className="h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
          <div className="h-full bg-[#54794E]" style={{width:`${Math.round(d.adherence*100)}%`}}></div>
        </div>
        <div className="text-[10.5px] text-[#6C5038] mt-1 num-mono">{Math.round(d.adherence*100)}% adherence</div>
      </div>
      <div className="mt-2.5">
        {d.status === 'done' && <Pill tone="sage">Done</Pill>}
        {d.status === 'today' && <Pill tone="ink">In progress</Pill>}
        {d.status === 'planned' && <Pill tone="outline">Planned</Pill>}
      </div>
    </div>
  );
}

function PlanByTopic() {
  const subjects = DATA.subjects.slice(0,5);
  return (
    <Card>
      <SectionHeader eyebrow="This week by subject" title="Where your hours go." right={<StatusDot state="live" />} />
      <ul className="space-y-3">
        {subjects.map(s => (
          <li key={s.id} className="grid grid-cols-[140px_1fr_100px] gap-3 items-center">
            <div className="flex items-center gap-2">
              <span className="w-2.5 h-2.5 rounded-sm" style={{background:s.color}}></span>
              <span className="text-[13px]">{s.name}</span>
            </div>
            <MiniBar pct={s.weight*4.5} width={undefined} color={s.color} height={9} />
            <div className="num-mono text-[11px] text-[#6C5038] text-right">{Math.round(s.weight*38.5)}h · {Math.round(s.weight*100)}%</div>
          </li>
        ))}
      </ul>
      <div className="rule mt-5 pt-3 text-[11.5px] text-[#6C5038]">
        Subject weights come from <strong>Exam intelligence</strong> (verified PYQ + syllabus) tuned by your weakness map. Locked tags can't shift; preview tags can.
      </div>
    </Card>
  );
}

function BacklogCard() {
  return (
    <Card>
      <SectionHeader eyebrow="Backlog · carried forward"
        title="3 tasks waiting on you."
        right={<StatusDot state="live" />} />
      <ul className="space-y-2.5">
        {[
          { t:"Polity Ch.4 spaced revision", carry:"2×", since:"May 11", urgency:"now" },
          { t:"GS-2 answer · Federalism short note", carry:"1×", since:"May 13", urgency:"this week" },
          { t:"Mock 13 wrong-answer review", carry:"3d", since:"May 11", urgency:"tonight" },
        ].map((b,i) => (
          <li key={i} className="rounded-xl border border-[#EFE2C9] bg-[#FBF6EF]/70 p-3">
            <div className="flex justify-between items-center">
              <div className="text-[13px] font-medium">{b.t}</div>
              <Pill tone="amber">{b.urgency}</Pill>
            </div>
            <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">Carried {b.carry} · since {b.since}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PlanAdaptationPreview({ onClose }) {
  return (
    <Card>
      <SectionHeader eyebrow="Preview · adaptation"
        title="Preview correction before applying."
        sub="The engine has a candidate v0.6.5. Compare before/after — nothing is applied until you say so."
        right={
          <div className="flex gap-2">
            <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Apply changes</button>
            <button onClick={onClose} className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Keep current plan</button>
            <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Regenerate after weekly review</button>
          </div>
        } />
      <div className="grid grid-cols-2 gap-5">
        <DiffSide label="Before · v0.6.4 (current)" tone="paper" rows={[
          { day:"Tue", hours:"6.5h", tasks:"7 tasks", focus:"Federalism + Mock 14" },
          { day:"Wed", hours:"6.0h", tasks:"6 tasks", focus:"Mock 14 review + GS-2" },
          { day:"Thu", hours:"5.0h", tasks:"5 tasks", focus:"Modern History + CA" },
          { day:"Fri", hours:"6.0h", tasks:"6 tasks", focus:"Economy + Mains" },
        ]} />
        <DiffSide label="After · v0.6.5 (preview)" tone="sage" rows={[
          { day:"Tue", hours:"6.5h", tasks:"7 tasks", focus:"Federalism + Mock 14", same:true },
          { day:"Wed", hours:"6.0h", tasks:"7 tasks", focus:"+ GS-2 drill (locked by policy)", changed:true },
          { day:"Thu", hours:"5.5h", tasks:"6 tasks", focus:"+ Mock 13 backlog absorb", changed:true },
          { day:"Fri", hours:"5.0h", tasks:"5 tasks", focus:"Lighter (consistency dip avoidance)", changed:true },
        ]} />
      </div>
      <div className="rule mt-5 pt-3">
        <Eyebrow>Why these changes</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-[12.5px]">
          <li className="flex gap-2"><Chip s={{layer:"engine", label:"adherence_drop"}} /><span>Adherence trended 91 → 82 over 7d → reduce Fri load.</span></li>
          <li className="flex gap-2"><Chip s={{layer:"user", label:"mock-13-unreviewed"}} /><span>Mock 13 review still pending → insert 30m absorb on Thu.</span></li>
          <li className="flex gap-2"><Chip s={{layer:"engine", label:"policy:mock_review_before_mock"}} /><span>Policy requires review before next mock → keep Wed +GS-2 drill.</span></li>
        </ul>
      </div>
    </Card>
  );
}

function DiffSide({ label, tone, rows }) {
  const bg = tone === "sage" ? "#F0F5EF" : "#FBF8F2";
  const accent = tone === "sage" ? "#33482F" : "#6C5038";
  return (
    <div className="rounded-xl border border-[#E7DECB] p-4" style={{background:bg}}>
      <div className="eyebrow !text-[10px]" style={{color:accent}}>{label}</div>
      <ul className="mt-3 space-y-2">
        {rows.map((r,i) => (
          <li key={i} className={`grid grid-cols-[40px_60px_60px_1fr_24px] gap-3 items-center text-[12.5px] ${r.changed ? 'font-medium text-[#2E2218]' : 'text-[#3a2e22]'}`}>
            <span className="num-mono text-[#6C5038]">{r.day}</span>
            <span className="num-mono">{r.hours}</span>
            <span className="num-mono">{r.tasks}</span>
            <span>{r.focus}</span>
            <span className="text-right">
              {r.changed ? <span className="num-mono text-[#33482F]">Δ</span> : <span className="num-mono text-[#A68057]">·</span>}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function PlanChangeLogCard() {
  return (
    <Card>
      <SectionHeader eyebrow="Plan change log" title="Every mutation is recorded." right={<StatusDot state="live" />} />
      <ul className="space-y-3">
        {DATA.planChangeLog.map((c,i) => (
          <li key={i} className="border-l-2 border-[#E7DECB] pl-3 relative">
            <span className="absolute -left-[5px] top-1 w-2 h-2 rounded-full bg-[#54794E]"></span>
            <div className="num-mono text-[10.5px] text-[#6C5038]">{c.v} · {c.at}</div>
            <div className="text-[13px] mt-0.5">{c.change}</div>
            <div className="mt-1 flex items-center gap-2 text-[11px] text-[#6C5038]">
              <Chip s={{layer: c.actor === "user" ? "user" : "engine", label:c.trigger}} />
              <span className="num-mono">by {c.actor}</span>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

window.ScreenPlan = ScreenPlan;
