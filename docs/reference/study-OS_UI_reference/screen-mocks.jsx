/* /app/study/mocks — Mock analysis & correction */
const { useState: useStateM } = React;

function ScreenMocks() {
  const [active, setActive] = useStateM("M13");
  const mock = DATA.mocks.find(m => m.id === active);
  return (
    <div data-screen-label="Mocks · Analysis & correction">
      <PageHeader eyebrow="Mocks · analysis"
        title="Turn every mock into a correction plan."
        sub="A mock is just data until you review it. We surface error patterns, weak topics, and propose correction tasks you can add to today's plan."
        right={<StatusDot state="live" />} />
      <div className="px-10 grid grid-cols-[320px_1fr] gap-6">
        <MockList active={active} onPick={setActive} />
        <div className="space-y-6">
          {mock && <MockAnalysis mock={mock} />}
          {mock?.status === 'unreviewed' && <ReviewNudge />}
          <CorrectionTasks />
          <MockScoreTrend />
        </div>
      </div>
      <FooterStrip />
    </div>
  );
}

function MockList({ active, onPick }) {
  return (
    <Card padded={false}>
      <div className="px-5 pt-5 pb-3">
        <Eyebrow>Mock log · last 6</Eyebrow>
        <h2 className="font-serif text-[20px] mt-1">14 mocks · best 134/200</h2>
      </div>
      <div className="hairline mx-5"></div>
      <ul className="px-3 py-3">
        {DATA.mocks.map(m => (
          <li key={m.id}>
            <button onClick={()=>onPick(m.id)}
              className={`w-full text-left rounded-xl px-3.5 py-3 mb-1 ${active===m.id ? 'bg-[#2E2218] text-[#F3EADB]' : 'hover:bg-[#F3EADB]'}`}>
              <div className="flex items-center justify-between gap-2">
                <span className={`font-serif text-[15px] ${active===m.id ? '' : 'text-[#2E2218]'}`}>{m.name}</span>
                {m.status === 'scheduled' && <Pill tone="outline">scheduled</Pill>}
                {m.status === 'unreviewed' && <Pill tone="amber">unreviewed</Pill>}
                {m.status === 'corrected' && <Pill tone="sage">corrected</Pill>}
              </div>
              <div className={`flex items-center justify-between mt-1 text-[11.5px] ${active===m.id ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>
                <span className="num-mono">{m.date}</span>
                <span className="num-mono">{m.score || '—'}</span>
              </div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MockAnalysis({ mock }) {
  if (mock.status === 'scheduled') {
    return (
      <Card>
        <Eyebrow>Scheduled mock</Eyebrow>
        <h2 className="font-serif text-[24px] mt-1.5">{mock.name}</h2>
        <p className="text-[13px] text-[#6C5038] mt-1">Engine-scheduled for {mock.date}. Coverage 68% · cadence 7d since last mock.</p>
        <div className="mt-4 flex gap-2">
          <button className="px-4 py-2 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12.5px]">Start mock now</button>
          <button className="px-4 py-2 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[12.5px]">Reschedule</button>
        </div>
      </Card>
    );
  }
  const errors = mock.errors || {};
  const total = Object.values(errors).reduce((a,b)=>a+b,0);
  return (
    <Card>
      <SectionHeader
        eyebrow={`Mock · ${mock.date}`}
        title={`${mock.name} · ${mock.score}`}
        sub="Subject breakdown and error patterns are extracted from your answer sheet."
        right={mock.status === 'unreviewed' ? <Pill tone="amber">Unreviewed · {3} days</Pill> : <Pill tone="sage">Correction tasks generated</Pill>} />

      <div className="grid grid-cols-[1fr_240px] gap-6 mt-2">
        <div>
          <Eyebrow>Subject breakdown</Eyebrow>
          <ul className="mt-2 space-y-2">
            {[
              { sub:"Polity",  s:"24/40", pct:0.60, weak:true },
              { sub:"History", s:"18/40", pct:0.45, weak:true },
              { sub:"Economy", s:"20/40", pct:0.50, weak:true },
              { sub:"Geo",     s:"28/40", pct:0.70, weak:false },
              { sub:"CA",      s:"32/40", pct:0.80, weak:false },
            ].map((r,i) => (
              <li key={i} className="grid grid-cols-[100px_1fr_50px_70px] gap-3 items-center text-[12.5px]">
                <span>{r.sub}</span>
                <div className="h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
                  <div className="h-full" style={{width:`${r.pct*100}%`, background: r.pct >= 0.6 ? '#54794E' : '#A68057'}}></div>
                </div>
                <span className="num-mono text-[11.5px] text-[#6C5038] text-right">{r.s}</span>
                {r.weak ? <Pill tone="rose">weak</Pill> : <Pill tone="sage">ok</Pill>}
              </li>
            ))}
          </ul>
        </div>
        <div>
          <Eyebrow>Error patterns</Eyebrow>
          <ErrorPatternPanel errors={errors} total={total} />
        </div>
      </div>

      <div className="rule mt-5 pt-3">
        <Eyebrow>Weak topics surfaced</Eyebrow>
        <div className="mt-2 flex flex-wrap gap-2">
          {(mock.weak || []).map((w,i) => <Pill key={i} tone="rose">{w}</Pill>)}
        </div>
      </div>

      <div className="rule mt-4 pt-3 flex gap-2 flex-wrap">
        <button className="px-3.5 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold text-[12px]">Create correction tasks</button>
        <button className="px-3.5 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[12px]">Review wrong answers</button>
        <button className="px-3.5 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold text-[12px]">Schedule weak-topic drill</button>
      </div>
    </Card>
  );
}

function ErrorPatternPanel({ errors, total }) {
  const rows = [
    { k:"Concept gap",       v:errors.concept || 0, c:"#7A3925", tone:"rose" },
    { k:"Calculation error", v:errors.calc || 0,    c:"#6F5A22", tone:"amber" },
    { k:"Time pressure",     v:errors.time || 0,    c:"#524864", tone:"dusk" },
    { k:"Misread question",  v:errors.misread || 0, c:"#6C5038", tone:"clay" },
    { k:"Guesswork",         v:errors.guess || 0,   c:"#A68057", tone:"outline" },
  ];
  return (
    <div className="mt-2 space-y-1.5">
      {rows.map((r,i) => (
        <div key={i} className="grid grid-cols-[1fr_30px] items-center text-[12px]">
          <span className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-sm" style={{background:r.c}}></span>
            <span>{r.k}</span>
          </span>
          <span className="num-mono text-right">{r.v}</span>
        </div>
      ))}
      <div className="rule mt-1 pt-1.5 text-[10.5px] text-[#6C5038]">{total} wrong answers · pattern weighted in next plan</div>
    </div>
  );
}

function ReviewNudge() {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-4">
        <div className="w-10 h-10 rounded-full bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center shrink-0">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none"><path d="M12 8v5l3 2" stroke="#F3EADB" strokeWidth="1.8" strokeLinecap="round"/><circle cx="12" cy="12" r="9" stroke="#F3EADB" strokeWidth="1.6"/></svg>
        </div>
        <div className="flex-1">
          <Eyebrow tone="dark">High mock, low review</Eyebrow>
          <h3 className="font-serif text-[20px] text-[#F3EADB] mt-1.5 leading-snug">Review before next mock.</h3>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[64ch]">
            You've taken 13 mocks but only reviewed 9. Tonight's mock will repeat the same errors unless you review M13 first. This is a nudge, not a verdict.
          </p>
        </div>
        <button className="px-4 py-2 rounded-full bg-[#F3EADB] text-[#2E2218] font-semibold text-[12.5px] shrink-0">Open M13 review →</button>
      </div>
    </Card>
  );
}

function CorrectionTasks() {
  return (
    <Card>
      <SectionHeader eyebrow="Proposed correction tasks"
        title="From Mock 13 → today's plan"
        sub="Add any/all to your day. Each task knows which mock question it came from."
        right={<StatusDot state="live" />} />
      <ul className="space-y-2">
        {[
          { t:"Polity · Federalism concept drill (30m)",  from:"Q14, Q22, Q41", chip:{layer:"engine",label:"weak-area"} },
          { t:"Modern · 1857 deep read (45m)",            from:"Q07, Q31",        chip:{layer:"exam",label:"prereq"} },
          { t:"Economy · Monetary policy notes (20m)",    from:"Q53, Q67, Q72",  chip:{layer:"user",label:"weak"} },
          { t:"Timed retrieval · 30 Qs in 35m",           from:"time-pressure pattern", chip:{layer:"engine",label:"pattern"} },
        ].map((r,i) => (
          <li key={i} className="grid grid-cols-[1fr_120px_140px] gap-3 items-center px-3.5 py-2.5 rounded-xl border border-[#EFE2C9] bg-[#FBF6EF]/70">
            <div>
              <div className="text-[13px]">{r.t}</div>
              <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">from: {r.from}</div>
            </div>
            <Chip s={r.chip} />
            <div className="flex gap-1.5 justify-end">
              <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Add to today</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function MockScoreTrend() {
  const scores = [
    { m:"M9",  s:108 }, { m:"M10", s:115 }, { m:"M11", s:126 },
    { m:"M12", s:118 }, { m:"M13", s:122 }, { m:"M14", s:null, target:130 },
  ];
  const max = 160;
  return (
    <Card>
      <SectionHeader eyebrow="Score trend · last 6"
        title="Drift +14 across 5 mocks · target 130."
        right={<StatusDot state="live" />} />
      <svg viewBox="0 0 600 160" className="w-full h-[160px]">
        <line x1="40" y1="20" x2="40" y2="140" stroke="#E7DECB" />
        <line x1="40" y1="140" x2="580" y2="140" stroke="#E7DECB" />
        {[100,120,140,160].map((y,i) => (
          <g key={i}>
            <line x1="40" y1={140 - (y/max)*120} x2="580" y2={140 - (y/max)*120} stroke="#EFE7D4" strokeDasharray="2 4" />
            <text x="32" y={140 - (y/max)*120} textAnchor="end" dominantBaseline="central" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{y}</text>
          </g>
        ))}
        {/* line */}
        <polyline points={scores.filter(p=>p.s!=null).map((p,i)=>`${60+i*100},${140-(p.s/max)*120}`).join(' ')}
          fill="none" stroke="#54794E" strokeWidth="2" />
        {scores.map((p,i) => p.s != null ? (
          <g key={i}>
            <circle cx={60+i*100} cy={140-(p.s/max)*120} r="4" fill="#54794E" />
            <text x={60+i*100} y={140-(p.s/max)*120 - 10} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#2E2218">{p.s}</text>
            <text x={60+i*100} y={155} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{p.m}</text>
          </g>
        ) : (
          <g key={i}>
            <circle cx={60+i*100} cy={140-(p.target/max)*120} r="5" fill="none" stroke="#2E2218" strokeDasharray="2 3" />
            <text x={60+i*100} y={140-(p.target/max)*120 - 10} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">target {p.target}</text>
            <text x={60+i*100} y={155} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{p.m}</text>
          </g>
        ))}
      </svg>
    </Card>
  );
}

window.ScreenMocks = ScreenMocks;
