/* /app/study/subjects — Subject & topic intelligence */
const { useState: useStateS } = React;

function ScreenSubjects() {
  const [active, setActive] = useStateS("polity");
  return (
    <div data-screen-label="Subjects · Topic intelligence">
      <PageHeader
        eyebrow="Subjects · Topic intelligence"
        title="From subject to a concrete next action."
        sub="Topic-level mastery, exam priority, observed vs expected difficulty. High-yield labels appear only after admin lock."
        right={<StatusDot state="partial" label="Partial · mastery live, priority locked-only" />} />
      <div className="px-10 space-y-6">
        <SubjectCards active={active} onPick={setActive} />
        <TopicTreePanel subjectId={active} />
        <div className="grid grid-cols-[1fr_360px] gap-6">
          <MasteryDistribution />
          <NextRecommendedActions />
        </div>
      </div>
      <FooterStrip />
    </div>
  );
}

function SubjectCards({ active, onPick }) {
  return (
    <div className="grid grid-cols-7 gap-3">
      {DATA.subjects.map(s => (
        <button key={s.id} onClick={()=>onPick(s.id)}
          className={`text-left rounded-xl border p-3.5 transition ${active===s.id ? 'border-[#2E2218] bg-[#FBF6EF]' : 'border-[#E7DECB] bg-white/60 hover:border-[#A68057]'}`}>
          <div className="flex items-center justify-between">
            <span className="w-2.5 h-2.5 rounded-sm" style={{background:s.color}}></span>
            <span className="num-mono text-[10px] text-[#6C5038]">{Math.round(s.weight*100)}%</span>
          </div>
          <div className="font-serif text-[16px] mt-1.5 leading-tight">{s.name}</div>
          <div className="mt-2 h-[5px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full" style={{width:`${Math.round(s.mastery*100)}%`, background:s.color}}></div>
          </div>
          <div className="mt-2 flex items-center justify-between text-[10.5px] text-[#6C5038]">
            <span className="num-mono">{Math.round(s.mastery*100)}% mastery</span>
            {s.due > 0 && <Pill tone="amber">{s.due} due</Pill>}
          </div>
          {s.weak > 0 && <div className="mt-1.5 text-[10.5px] text-[#7A3925]">{s.weak} weak topic{s.weak>1?'s':''}</div>}
        </button>
      ))}
    </div>
  );
}

function TopicTreePanel({ subjectId }) {
  const topics = DATA.topicTree[subjectId] || [];
  const subj = DATA.subjects.find(s => s.id === subjectId);
  return (
    <Card>
      <SectionHeader
        eyebrow={`${subj?.name} · topic tree`}
        title="Click any topic to see priority + evidence."
        sub="High-yield only appears on topics admin has locked. Observed difficulty is your data; expected difficulty is exam intelligence."
        right={<div className="flex gap-2"><TrustStamp kind="locked" label="Locked = planner uses it" /><TrustStamp kind="preview" label="Draft = informational" /></div>} />

      {topics.length === 0 ? (
        <EmptyState icon="◑" title="Topic tree not yet connected for this subject." body="Backend hookup pending. Verified topics from /admin/exam-intelligence will populate here." />
      ) : (
        <div className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] px-4 py-3">
          <div className="tt-row head">
            <div>Topic</div>
            <div>Mastery</div>
            <div>Priority</div>
            <div>PYQ rel.</div>
            <div className="text-right">Action</div>
          </div>
          {topics.map(t => (
            <TopicRow key={t.id} t={t} />
          ))}
        </div>
      )}
    </Card>
  );
}

function TopicRow({ t }) {
  const [open, setOpen] = useStateS(false);
  return (
    <>
      <div className="tt-row">
        <div>
          <button onClick={()=>setOpen(o=>!o)} className="text-left flex items-center gap-2">
            <span className={`text-[10px] text-[#6C5038] transition ${open ? 'rotate-90' : ''}`}>▶</span>
            <span className="font-medium">{t.name}</span>
            {t.weak && <Pill tone="rose">Weak</Pill>}
            {t.hyVerified && <TrustStamp kind="locked" label="High-yield · locked" />}
            {t.due && <Pill tone="amber">Revision due</Pill>}
          </button>
        </div>
        <div className="flex items-center gap-1.5">
          <MiniBar pct={t.mastery} width={56} />
          <span className="num-mono text-[11px] text-[#6C5038]">{Math.round(t.mastery*100)}%</span>
        </div>
        <div><TrustStamp kind={t.priority === "locked" ? "locked" : "verified"} label={t.priority} /></div>
        <div className="text-[11.5px]">
          <span className={`pill ${t.pyqRel==='high'?'pill-sage':t.pyqRel==='medium'?'pill-amber':'pill-outline'}`}>{t.pyqRel}</span>
        </div>
        <div className="text-right">
          <button className="text-[11.5px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Drill →</button>
        </div>
      </div>
      {open && (
        <div className="rounded-lg bg-[#FBF6EF] border border-[#E7DECB] mx-3 my-2 p-3">
          <div className="grid grid-cols-4 gap-3 text-[12px]">
            <FactCellLocal k="User mastery"        v={`${Math.round(t.mastery*100)}% · σ low`} />
            <FactCellLocal k="Observed difficulty" v={`${Math.round((t.obsDiff||0)*100)}%`} />
            <FactCellLocal k="Expected difficulty" v={`${Math.round((t.expDiff||0)*100)}%`} />
            <FactCellLocal k="Confidence"          v={<ConfidencePill value={0.82} evidence={`${(t.sub||[]).length+8} evid.`} />} />
          </div>
          <div className="rule mt-3 pt-3">
            <Eyebrow>Microtopics</Eyebrow>
            <ul className="mt-2 space-y-1">
              {(t.sub || []).map(s => (
                <li key={s.id} className="grid grid-cols-[1fr_90px_120px_100px_60px] gap-3 items-center text-[12.5px]">
                  <span className="pl-2">· {s.name}</span>
                  <span className="flex items-center gap-1.5"><MiniBar pct={s.mastery} width={48} /><span className="num-mono text-[10.5px] text-[#6C5038]">{Math.round(s.mastery*100)}%</span></span>
                  <TrustStamp kind={s.priority === "locked" ? "locked" : "verified"} label={s.priority} />
                  <span className={`pill ${s.pyqRel==='high'?'pill-sage':s.pyqRel==='medium'?'pill-amber':'pill-outline'}`}>{s.pyqRel}</span>
                  <span className="text-right">{s.weak ? <Pill tone="rose">weak</Pill> : <span className="text-[#6C5038] text-[10.5px]">·</span>}</span>
                </li>
              ))}
            </ul>
          </div>
          <div className="rule mt-3 pt-3 flex gap-2">
            <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Schedule revision</button>
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Open answer drill</button>
            <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">View PYQ tags</button>
          </div>
        </div>
      )}
    </>
  );
}

function FactCellLocal({ k, v }) {
  return (
    <div>
      <Eyebrow>{k}</Eyebrow>
      <div className="mt-1 text-[13px]">{v}</div>
    </div>
  );
}

function MasteryDistribution() {
  return (
    <Card>
      <SectionHeader eyebrow="Mastery distribution" title="Where you stand, by subject." right={<StatusDot state="live" />} />
      <div className="space-y-2.5">
        {DATA.subjects.map(s => (
          <div key={s.id} className="grid grid-cols-[120px_1fr_60px_60px] gap-3 items-center text-[12.5px]">
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-sm" style={{background:s.color}}></span>
              <span>{s.name}</span>
            </div>
            <div className="h-[8px] bg-[#EFE2C9] rounded-full overflow-hidden relative">
              <div className="h-full" style={{width:`${Math.round(s.mastery*100)}%`, background:s.color}}></div>
              <div className="absolute top-0 bottom-0" style={{left:'65%', width:1, background:'rgba(46,34,24,0.4)'}} title="target 65%"></div>
            </div>
            <span className="num-mono text-[11px] text-[#6C5038] text-right">{Math.round(s.mastery*100)}%</span>
            {s.mastery >= 0.65 ? <Pill tone="sage">on target</Pill> : <Pill tone="amber">below 65%</Pill>}
          </div>
        ))}
      </div>
      <div className="rule mt-4 pt-3 text-[11.5px] text-[#6C5038]">
        Target lines (vertical) come from your study policy. Subjects below target trigger weak-area drills.
      </div>
    </Card>
  );
}

function NextRecommendedActions() {
  return (
    <Card>
      <SectionHeader eyebrow="Next recommended actions" title="Per subject — engine selected." right={<StatusDot state="live" />} />
      <ul className="space-y-3">
        {[
          { sub:"Polity",  act:"Concept drill · Federalism · Centre-State",   reason:"weak topic + locked HY tag", chip:{layer:"exam",label:"locked"} },
          { sub:"History", act:"Deep read · Revolts of 1857 (90m)",           reason:"prerequisite for next 3 topics", chip:{layer:"engine",label:"prereq"} },
          { sub:"Economy", act:"Spaced revision · Monetary policy (30m)",     reason:"forgetting curve · interval +2d", chip:{layer:"engine",label:"spaced"} },
          { sub:"Geo",     act:"Quick retrieval · climate zones (20m)",       reason:"mastery 61% · maintain", chip:{layer:"user",label:"maintain"} },
        ].map((r,i) => (
          <li key={i} className="rounded-xl border border-[#EFE2C9] bg-[#FBF6EF]/70 p-3">
            <div className="flex items-center justify-between">
              <div className="num-mono text-[10.5px] text-[#6C5038] uppercase tracking-[0.18em]">{r.sub}</div>
              <button className="text-[10.5px] px-2 py-0.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Add to today</button>
            </div>
            <div className="text-[13px] mt-1">{r.act}</div>
            <div className="mt-1.5 flex items-center gap-2 text-[11px]"><Chip s={r.chip} /><span className="text-[#6C5038]">{r.reason}</span></div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

window.ScreenSubjects = ScreenSubjects;
