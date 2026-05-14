/* /app/study/review — Weekly review */

function ScreenReview() {
  const w = DATA.weeklyReview;
  return (
    <div data-screen-label="Weekly review">
      <PageHeader eyebrow="Weekly review · May 6 → May 12"
        title="Close the loop."
        sub="An honest read of last week. We surface what improved, what declined, and what Study OS will change next week — calmly. No streaks. No shame."
        right={
          <div className="flex gap-2">
            <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Approve next-week changes</button>
            <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Save as draft</button>
          </div>
        } />

      <div className="px-10 space-y-6">
        <WeekHeadlineRow w={w} />
        <div className="grid grid-cols-2 gap-6">
          <ImprovedDeclined kind="improved" items={w.improved} />
          <ImprovedDeclined kind="declined" items={w.declined} />
        </div>
        <div className="grid grid-cols-[1fr_400px] gap-6">
          <NextWeekChangesCard items={w.nextWeekChanges} />
          <UserCorrectionChecklist />
        </div>
        <BacklogMovementChart w={w} />
        <ReviewLoopExplainer />
      </div>
      <FooterStrip />
    </div>
  );
}

function WeekHeadlineRow({ w }) {
  const cells = [
    { k:"Hours studied", v:`${w.hoursStudied}h`, sub:`of ${w.hoursPlanned}h planned` },
    { k:"Adherence",     v:`${Math.round(w.adherence*100)}%`, sub:"7-day rolling" },
    { k:"Tasks complete",v:`${w.tasksDone}/${w.tasksPlanned}`, sub:"of weekly plan" },
    { k:"Mocks taken",   v:w.mocksTaken, sub:"+ 1 scheduled" },
    { k:"Backlog",       v:`${w.backlogStart} → ${w.backlogEnd}`, sub:"+2 carried" },
    { k:"Revision cov.", v:`${Math.round(w.revisionCoverage*100)}%`, sub:"target 65%" },
  ];
  return (
    <div className="grid grid-cols-6 gap-3">
      {cells.map((c,i) => (
        <div key={i} className="soft-card grain relative px-4 py-3.5">
          <Eyebrow>{c.k}</Eyebrow>
          <div className="font-serif text-[24px] mt-1.5 leading-none">{c.v}</div>
          <div className="text-[11px] text-[#6C5038] mt-2">{c.sub}</div>
        </div>
      ))}
    </div>
  );
}

function ImprovedDeclined({ kind, items }) {
  const sage = kind === "improved";
  return (
    <Card className={sage ? "!bg-[#F0F5EF] !border-[#B9CFAF]" : "!bg-[#F2DDD6] !border-[#D9B4A6]"}>
      <Eyebrow tone={sage ? '' : ''}>{sage ? "What improved" : "What declined"}</Eyebrow>
      <h2 className={`font-serif text-[20px] mt-1.5 ${sage ? 'text-[#33482F]' : 'text-[#7A3925]'}`}>{sage ? "These are working." : "These need attention."}</h2>
      <ul className="mt-4 space-y-3">
        {items.map((it,i) => (
          <li key={i} className="grid grid-cols-[1fr_70px] gap-2 items-baseline">
            <div>
              <div className={`text-[13px] font-medium ${sage ? 'text-[#33482F]' : 'text-[#7A3925]'}`}>{it.k}</div>
              <div className={`text-[11.5px] mt-0.5 ${sage ? 'text-[#41603D]' : 'text-[#7A3925]/80'}`}>{it.note}</div>
            </div>
            <div className={`text-right num-mono text-[14px] font-semibold ${sage ? 'text-[#33482F]' : 'text-[#7A3925]'}`}>{it.d}</div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function NextWeekChangesCard({ items }) {
  return (
    <Card>
      <SectionHeader eyebrow="What Study OS will change next week"
        title="Preview only. Apply with one click."
        sub="The engine drafts adaptations from this week's signals. Nothing applies until you approve at the top of this page."
        right={<StatusDot state="live" />} />
      <ul className="space-y-3">
        {items.map((it,i) => (
          <li key={i} className="grid grid-cols-[40px_1fr] gap-3 items-start">
            <div className="num-mono text-[12px] text-[#6C5038] pt-0.5">{String(i+1).padStart(2,'0')}</div>
            <div>
              <div className="text-[13.5px]">{it}</div>
              <div className="mt-1 flex gap-1.5 flex-wrap">
                <Chip s={{layer:"engine", label:"plan-adapt"}} />
                <Chip s={{layer:"user",   label:"weekly-signal"}} />
              </div>
            </div>
          </li>
        ))}
      </ul>
      <div className="rule mt-4 pt-3 flex gap-2">
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Preview as v0.6.5</button>
        <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Discuss with mentor</button>
      </div>
    </Card>
  );
}

function UserCorrectionChecklist() {
  return (
    <Card>
      <SectionHeader eyebrow="Your turn"
        title="Three quick things from you."
        sub="Engine can adapt task selection; only you can adjust intent and availability." />
      <ul className="space-y-3">
        {[
          { t:"Confirm next week's available hours", body:"Last week: 38.5h. Plan target 42h. Adjust?" },
          { t:"Pick a focus topic to fully clear",   body:"We suggest Polity ▸ Federalism (mastery 56%)." },
          { t:"Mock pace — keep weekly cadence?",    body:"Last 4 mocks at 7-day cadence. Keep, slow, accelerate?" },
        ].map((c,i) => (
          <li key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-3">
            <div className="flex items-start gap-3">
              <span className="tick mt-1.5"></span>
              <div className="flex-1">
                <div className="text-[13px] font-medium">{c.t}</div>
                <div className="text-[11.5px] text-[#6C5038] mt-1">{c.body}</div>
                <div className="mt-2 flex gap-2">
                  <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Answer</button>
                  <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Skip</button>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function BacklogMovementChart({ w }) {
  return (
    <Card>
      <SectionHeader eyebrow="Backlog movement"
        title="Daily backlog over the week."
        sub="Goal: end the week with backlog ≤ start of week. We didn't this time."
        right={<StatusDot state="live" />} />
      <svg viewBox="0 0 720 160" className="w-full h-[160px]">
        {[0,1,2,3].map((y,i) => (
          <g key={i}>
            <line x1="40" y1={140-y*30} x2="700" y2={140-y*30} stroke="#EFE7D4" />
            <text x="32" y={140-y*30} textAnchor="end" dominantBaseline="central" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{y}</text>
          </g>
        ))}
        {["Mon","Tue","Wed","Thu","Fri","Sat","Sun"].map((d,i) => (
          <text key={i} x={70+i*90} y={155} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{d}</text>
        ))}
        {[1,1,2,2,2,3,3].map((v,i) => (
          <rect key={i} x={55+i*90} y={140-v*30} width="30" height={v*30} fill="#A68057" rx="3" />
        ))}
        <line x1="40" y1={140 - w.backlogStart*30} x2="700" y2={140 - w.backlogStart*30} stroke="#33482F" strokeDasharray="4 3" />
        <text x="704" y={140 - w.backlogStart*30 - 4} fontFamily="JetBrains Mono" fontSize="10" fill="#33482F" textAnchor="end">start = {w.backlogStart}</text>
      </svg>
    </Card>
  );
}

function ReviewLoopExplainer() {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <Eyebrow tone="dark">How this becomes next week's plan</Eyebrow>
      <h3 className="font-serif text-[20px] text-[#F3EADB] mt-1.5">Weekly signals → Engine → Adapted plan v0.6.5</h3>
      <div className="grid grid-cols-4 gap-3 mt-4">
        {[
          { k:"Weekly signals", v:"adherence · backlog · revision · mock" },
          { k:"Policy check",   v:"availability · constraints · mix targets" },
          { k:"Engine adapt",   v:"v0.6.5-draft compiled" },
          { k:"You approve",    v:"applied or kept-current" },
        ].map((s,i) => (
          <div key={i} className="rounded-xl border border-[#6C5038] p-3 bg-[#4E3A29]/40">
            <div className="num-mono text-[9.5px] text-[#D6BC93] uppercase tracking-[0.16em]">{String(i+1).padStart(2,'0')}</div>
            <div className="font-serif text-[15px] text-[#F3EADB] mt-1">{s.k}</div>
            <div className="text-[11px] text-[#D6BC93] mt-1">{s.v}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

window.ScreenReview = ScreenReview;
