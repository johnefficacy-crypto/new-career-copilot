/* /admin/persona — Persona → Study Policy inspector */

function ScreenAdminPersona() {
  const u = DATA.personaUser;
  return (
    <div data-screen-label="Admin · Persona Inspector">
      <PageHeader eyebrow="Admin · Persona to Study Policy"
        title="How internal signals become study behavior."
        sub="This page is for trust + debugging only. Persona is internal personalization metadata — not identity, not diagnosis, not eligibility truth, not recruitment truth."
        right={<Pill tone="ink">RBAC: persona-debug</Pill>} />

      <div className="px-10">
        <PersonaWarning />
      </div>

      <div className="px-10 mt-6 grid grid-cols-[320px_1fr] gap-6">
        <UserSearchSidebar />
        <div className="space-y-6">
          <PersonaSnapshot u={u} />
          <div className="grid grid-cols-2 gap-6">
            <DimensionsCard u={u} />
            <PolicyOutCard u={u} />
          </div>
          <div className="grid grid-cols-[1fr_400px] gap-6">
            <SignalEvents u={u} />
            <RecomputeQueue />
          </div>
        </div>
      </div>
      <FooterStrip />
    </div>
  );
}

function PersonaWarning() {
  return (
    <div className="rounded-xl border border-[#D9B4A6] bg-[#F2DDD6] px-5 py-3.5 flex items-start gap-3">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" className="mt-0.5 shrink-0"><path d="M12 8v5M12 16.5v.5M3.5 19h17L12 4.5 3.5 19z" stroke="#7A3925" strokeWidth="1.6" strokeLinejoin="round"/></svg>
      <div className="text-[12.5px] text-[#7A3925]">
        <strong>Internal use only.</strong> Persona snapshots inform study-plan generation. They are not user-visible labels, do not constitute a diagnosis, do not affect eligibility checks, and do not represent recruitment truth.
      </div>
    </div>
  );
}

function UserSearchSidebar() {
  return (
    <Card padded={false}>
      <div className="px-4 pt-4 pb-3">
        <Eyebrow>User search</Eyebrow>
        <div className="mt-2 flex items-center gap-2 rounded-full border border-[#E7DECB] bg-[#FBF8F2] px-3 py-1.5">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><circle cx="11" cy="11" r="6" stroke="#6C5038" strokeWidth="1.6"/><path d="M21 21l-4-4" stroke="#6C5038" strokeWidth="1.6" strokeLinecap="round"/></svg>
          <input className="bg-transparent outline-none text-[12.5px] flex-1" placeholder="search id, email, exam…" defaultValue="usr_8a2…f31" />
        </div>
      </div>
      <div className="hairline mx-4"></div>
      <ul className="py-2">
        {[
          { name:"Aarav Mehra", id:"usr_8a2…f31", exam:"UPSC CSE 2026", active:true },
          { name:"Pooja Iyer",  id:"usr_44b…9c1", exam:"RBI Grade B 2026" },
          { name:"Rohit Sen",   id:"usr_c12…d4e", exam:"SSC CGL 2026" },
          { name:"Anjali D.",   id:"usr_91f…7aa", exam:"UPSC CSE 2026" },
          { name:"Vikram K.",   id:"usr_67e…1bb", exam:"UPPSC 2026" },
        ].map(u => (
          <li key={u.id}>
            <button className={`w-full text-left px-4 py-2.5 hover:bg-[#F3EADB] ${u.active ? 'bg-[#2E2218] hover:bg-[#2E2218]' : ''}`}>
              <div className={`font-medium text-[13px] ${u.active ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{u.name}</div>
              <div className={`num-mono text-[10.5px] mt-0.5 ${u.active ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>{u.id} · {u.exam}</div>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PersonaSnapshot({ u }) {
  return (
    <Card>
      <div className="flex items-start justify-between gap-6">
        <div>
          <Eyebrow>Latest persona snapshot</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1.5">{u.name}</h2>
          <div className="num-mono text-[11px] text-[#6C5038] mt-1">{u.id} · {u.exam} · compiled {u.snapshotAt}</div>
          <div className="mt-3 flex gap-2 flex-wrap">
            <Pill tone="ink">snapshot v3.1</Pill>
            <Pill tone="outline">41 inputs · 7 rules</Pill>
            <Pill tone="sage">stable</Pill>
          </div>
        </div>
        <div className="flex gap-2 shrink-0">
          <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Recompute now</button>
          <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Export raw</button>
        </div>
      </div>
    </Card>
  );
}

function DimensionsCard({ u }) {
  return (
    <Card>
      <SectionHeader eyebrow="Internal dimensions"
        title="Scores · evidence count" sub="Not user-visible. Used only by study-policy compiler." />
      <ul className="space-y-3">
        {u.dimensions.map((d,i) => (
          <li key={i} className="grid grid-cols-[1fr_120px_60px_70px] gap-3 items-center text-[12.5px]">
            <span>{d.k}</span>
            <div className="h-[7px] bg-[#EFE2C9] rounded-full overflow-hidden">
              <div className="h-full bg-[#54794E]" style={{width:`${d.score*100}%`}}></div>
            </div>
            <span className="num-mono text-[11px] text-[#6C5038] text-right">{Math.round(d.score*100)}</span>
            <span className="num-mono text-[11px] text-[#6C5038] text-right">{d.evidence} ev.</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function PolicyOutCard({ u }) {
  return (
    <Card>
      <SectionHeader eyebrow="Study policy · derived"
        title="What aspirant sees as `Study policy preview`." />
      <div className="grid grid-cols-2 gap-4 text-[12.5px]">
        <div><Eyebrow>Max tasks</Eyebrow><div className="font-serif text-[18px] mt-1">{u.policyOut.maxTasks}</div></div>
        <div><Eyebrow>Task size pref.</Eyebrow><div className="font-serif text-[18px] mt-1">{u.policyOut.sizePref}</div></div>
      </div>
      <div className="rule mt-4 pt-3">
        <Eyebrow>Task mix</Eyebrow>
        <div className="mt-2 space-y-1.5">
          {Object.entries(u.policyOut.mix).map(([k,v]) => (
            <div key={k} className="grid grid-cols-[120px_1fr_40px] gap-3 items-center text-[12px]">
              <span className="capitalize">{k}</span>
              <MiniBar pct={v/100} width={undefined} />
              <span className="num-mono text-[11px] text-[#6C5038] text-right">{v}%</span>
            </div>
          ))}
        </div>
      </div>
      <div className="rule mt-4 pt-3">
        <Eyebrow>Constraints</Eyebrow>
        <ul className="mt-2 text-[12px] space-y-1 text-[#3a2e22]">
          {u.policyOut.constraints.map((c,i) => <li key={i}>· {c}</li>)}
        </ul>
      </div>
    </Card>
  );
}

function SignalEvents({ u }) {
  return (
    <Card>
      <SectionHeader eyebrow="Recent signal events" title="What touched this user's persona." right={<StatusDot state="live" />} />
      <ul className="space-y-2">
        {u.events.map((e,i) => (
          <li key={i} className="grid grid-cols-[120px_140px_1fr] gap-3 items-center text-[12.5px] py-2 border-b border-[#EFE7D4] last:border-0">
            <span className="num-mono text-[10.5px] text-[#6C5038]">{e.at}</span>
            <span className="chip chip-engine" style={{width:'fit-content'}}>{e.k}</span>
            <span>{e.v}</span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

function RecomputeQueue() {
  return (
    <Card>
      <SectionHeader eyebrow="Recompute queue · live" title="What's processing right now." right={<StatusDot state="live" />} />
      <ul className="space-y-2">
        {DATA.personaUser.recomputeQueue.map((q,i) => (
          <li key={i} className="grid grid-cols-[1fr_110px_90px] gap-3 items-center text-[12px] py-2 border-b border-[#EFE7D4] last:border-0">
            <div>
              <div className="num-mono">{q.user}</div>
              <div className="text-[10.5px] text-[#6C5038]">{q.reason}</div>
            </div>
            <span className="num-mono text-[10.5px] text-[#6C5038]">queued {q.queuedAt}</span>
            <span className="text-right">
              {q.state === 'done' && <Pill tone="sage">done</Pill>}
              {q.state === 'running' && <Pill tone="amber">running</Pill>}
              {q.state === 'queued' && <Pill tone="outline">queued</Pill>}
            </span>
          </li>
        ))}
      </ul>
    </Card>
  );
}

window.ScreenAdminPersona = ScreenAdminPersona;
