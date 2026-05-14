/* /admin/exam-intelligence — 7-tab admin console */
const { useState: useStateA } = React;

const ADMIN_TABS = [
  { value:"overview",     label:"Overview" },
  { value:"exams",        label:"Exams", badge:14 },
  { value:"review-queue", label:"Review Queue", badge:38 },
  { value:"topic-cov",    label:"Topic Coverage" },
  { value:"competition",  label:"Competition Metrics" },
  { value:"policy",       label:"Policy Updates" },
  { value:"plan-impact",  label:"Plan Impact" },
];

function ScreenAdminExam() {
  const [tab, setTab] = useStateA("overview");
  const [drawer, setDrawer] = useStateA(null);
  return (
    <div data-screen-label="Admin · Exam Intelligence">
      <PageHeader
        eyebrow="Admin · Exam Intelligence"
        title="Verify the signals that drive every aspirant's plan."
        sub="Nothing locked here = nothing labelled high-yield to users. Aggregator updates can't change plans until paired with an official source."
        right={
          <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
            <span className="num-mono text-[10.5px] text-[#6C5038] whitespace-nowrap">admin@ccp</span>
            <Pill tone="ink" className="whitespace-nowrap">RBAC · exam-curator</Pill>
          </div>
        } />
      <div className="px-10">
        <Tabs value={tab} onChange={setTab} options={ADMIN_TABS} />
        <div className="mt-6 space-y-6">
          {tab === "overview" && <AdminOverview />}
          {tab === "exams" && <AdminExams onOpenReview={()=>setTab("review-queue")} />}
          {tab === "review-queue" && <AdminReviewQueueTable onOpenEvidence={(r)=>setDrawer({kind:"evidence", row:r})} />}
          {tab === "topic-cov" && <AdminTopicCoverage onOpenEvidence={(r)=>setDrawer({kind:"evidence", row:r})} />}
          {tab === "competition" && <AdminCompetition />}
          {tab === "policy" && <AdminPolicy onOpenSource={(p)=>setDrawer({kind:"source", row:p})} />}
          {tab === "plan-impact" && <AdminPlanImpact />}
        </div>
      </div>

      {drawer && drawer.kind === "evidence" && (
        <EvidenceDrawer open={true} onClose={()=>setDrawer(null)} title={`Evidence · ${drawer.row.topic || drawer.row.kind}`} items={[
          { kind:"PYQ", id:"2022 Q41", text:"Which of the following best describes the federal structure under Article 263?", source:"upsc.gov.in/pyq/2022", trust:"verified" },
          { kind:"Syllabus", id:"§II.3", text:"\"Federal structure under stress\" — Polity syllabus, p.18", source:"upsc.gov.in/syllabus-2026.pdf", trust:"verified" },
          { kind:"Coverage model", id:"cov.0.91", text:"Topic matched in 14 PYQs · model confidence 91%", source:"internal · model v0.6", trust:"research" },
          { kind:"Aggregator", id:"agg.318", text:"Mentioned in coaching syllabus PDFs (5 of 7 sources)", source:"various", trust:"aggregator" },
        ]} />
      )}
      {drawer && drawer.kind === "source" && (
        <Drawer open={true} onClose={()=>setDrawer(null)} title={drawer.row.title}>
          <div className="space-y-3">
            <div className="flex items-center gap-2"><TrustStamp kind={drawer.row.type} /><Pill tone="outline">{drawer.row.status}</Pill></div>
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
              <Eyebrow>Source</Eyebrow>
              <div className="num-mono text-[12px] mt-1">{drawer.row.source}</div>
              <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">received {drawer.row.at}</div>
            </div>
            <div className="rounded-xl border border-[#E7DECB] bg-white/60 p-4">
              <Eyebrow>Impacts</Eyebrow>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(drawer.row.impacts || []).length === 0
                  ? <Pill tone="outline">No plan impact</Pill>
                  : drawer.row.impacts.map((im,i) => <Pill key={i} tone="amber">{im}</Pill>)}
              </div>
              {drawer.row.blockedBy && <div className="text-[11.5px] text-[#7A3925] mt-2">⛔ {drawer.row.blockedBy}</div>}
            </div>
            <div className="flex gap-2">
              <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Promote to plan-affecting</button>
              <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Mark as research-only</button>
              <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Reject</button>
            </div>
          </div>
        </Drawer>
      )}

      <FooterStrip />
    </div>
  );
}

function AdminOverview() {
  const o = DATA.adminExamOverview;
  return (
    <>
      <div className="grid grid-cols-6 gap-3">
        <KPI k="Active exams"          v={o.activeExams}        tone="ink"   sub="connected + partial" />
        <KPI k="Pending syllabus"      v={o.pendingSyllabus}    tone="amber" sub="in review queue" />
        <KPI k="Verified PYQ tags"     v={o.verifiedPYQ}        tone="sage"  sub="locked or reviewed" />
        <KPI k="Locked topic coverage" v={`${o.lockedCoverage}%`} tone="sage" sub="planner-eligible" />
        <KPI k="Low-confidence"        v={o.lowConfidence}      tone="rose"  sub="conf < 65%" />
        <KPI k="User-facing readiness" v={`${Math.round(o.userReadiness*100)}%`} tone="ink" sub="surfaced to aspirants" />
      </div>
      <div className="grid grid-cols-[1fr_420px] gap-6">
        <Card>
          <SectionHeader eyebrow="Today" title="What needs your attention." />
          <ul className="space-y-2.5">
            {[
              { sev:"high", t:"5 PYQ tags below 65% confidence on UPSC CSE", cta:"Open review queue" },
              { sev:"med",  t:"Public Admin addendum (4 µtopics) awaiting topic-coverage review", cta:"Open Topic Coverage" },
              { sev:"med",  t:"Aggregator update for SSC CGL admit card unresolved (>48h)", cta:"Open Policy Updates" },
              { sev:"low",  t:"Plan impact pi1 staged at 50% rollout — approve to 100%", cta:"Open Plan Impact" },
            ].map((r,i) => (
              <li key={i} className="grid grid-cols-[10px_1fr_140px] gap-3 items-center text-[12.5px] py-2 border-b border-[#EFE7D4] last:border-0">
                <span className={`sdot ${r.sev === 'high' ? 'sdot-not' : r.sev === 'med' ? 'sdot-partial' : 'sdot-preview'}`}></span>
                <span>{r.t}</span>
                <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">{r.cta} →</button>
              </li>
            ))}
          </ul>
        </Card>
        <Card>
          <SectionHeader eyebrow="Verification cadence · 7d"
            title="What you've shipped this week." />
          <ul className="space-y-2.5 text-[12.5px]">
            {[
              { k:"Topics locked",    v:"+18", n:"3 reviewers" },
              { k:"PYQ tags verified",v:"+96", n:"avg conf 0.84" },
              { k:"Aggregator → official", v:"+4", n:"7 still pending" },
              { k:"Plan impacts approved", v:"2",  n:"affecting 2,238 users" },
            ].map((r,i) => (
              <li key={i} className="flex items-center justify-between border-b border-[#EFE7D4] py-2 last:border-0">
                <span>{r.k}</span>
                <span className="text-right">
                  <div className="num-mono">{r.v}</div>
                  <div className="num-mono text-[10.5px] text-[#6C5038]">{r.n}</div>
                </span>
              </li>
            ))}
          </ul>
        </Card>
      </div>
    </>
  );
}

function KPI({ k, v, tone, sub }) {
  const tones = { ink:"#2E2218", amber:"#6F5A22", sage:"#33482F", rose:"#7A3925" };
  return (
    <div className="soft-card grain relative px-4 py-3.5">
      <Eyebrow>{k}</Eyebrow>
      <div className="font-serif text-[26px] mt-1.5 leading-none" style={{color:tones[tone] || "#2E2218"}}>{v}</div>
      <div className="text-[11px] text-[#6C5038] mt-2">{sub}</div>
    </div>
  );
}

function AdminExams({ onOpenReview }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Exams</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">Coverage state per exam.</h2>
        </div>
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Add exam</button>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead>
            <tr>
              <th>Family</th><th>Exam</th><th>Cycle</th><th>Phase</th>
              <th>Coverage</th><th>Verified topics</th><th>Pending</th><th></th>
            </tr>
          </thead>
          <tbody>
            {DATA.adminExams.map((r,i) => (
              <tr key={i}>
                <td className="text-[#6C5038]">{r.family}</td>
                <td><strong>{r.exam}</strong></td>
                <td className="num-mono">{r.cycle}</td>
                <td>{r.phase}</td>
                <td>
                  {r.cov === 'connected' && <TrustStamp kind="live" label="Connected" />}
                  {r.cov === 'partial'   && <TrustStamp kind="preview" label="Partially connected" />}
                  {r.cov === 'not'       && <TrustStamp kind="notcon" label="Not connected" />}
                </td>
                <td className="num-mono">{r.verified}</td>
                <td><Pill tone={r.pending === 0 ? "outline" : "amber"}>{r.pending}</Pill></td>
                <td className="right">
                  <button onClick={onOpenReview} className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Open review →</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminReviewQueueTable({ onOpenEvidence }) {
  const [rows, setRows] = useStateA(DATA.adminReviewQueue);
  function act(id, status) { setRows(rs => rs.map(r => r.id === id ? {...r, status} : r)); }
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Review queue · UPSC CSE</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{rows.filter(r=>r.status==='pending').length} pending decisions.</h2>
          <p className="text-[12px] text-[#6C5038] mt-1">Lock = high-yield label can show to users. Reject = mark as not applicable. Needs correction = sends back to enrichment.</p>
        </div>
        <div className="flex gap-2">
          <Pill tone="outline">All kinds</Pill>
          <Pill tone="outline">Conf &lt; 75%</Pill>
        </div>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead>
            <tr><th>Kind</th><th>Candidate</th><th>Source</th><th>Confidence</th><th>Status</th><th className="right">Actions</th></tr>
          </thead>
          <tbody>
            {rows.map(r => (
              <tr key={r.id}>
                <td><Pill tone="dusk">{r.kind}</Pill></td>
                <td className="text-[#2E2218]">{r.text}</td>
                <td className="text-[#6C5038]">{r.source}</td>
                <td><ConfidencePill value={r.conf} /></td>
                <td>
                  {r.status === 'pending' && <TrustStamp kind="needs" />}
                  {r.status === 'verified' && <TrustStamp kind="verified" />}
                  {r.status === 'rejected' && <TrustStamp kind="notcon" label="Rejected" />}
                  {r.status === 'correction' && <TrustStamp kind="preview" label="Needs correction" />}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={()=>onOpenEvidence(r)} className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Evidence</button>
                    <button onClick={()=>act(r.id,'verified')} className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Verify</button>
                    <button onClick={()=>act(r.id,'correction')} className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold">Needs correction</button>
                    <button onClick={()=>act(r.id,'rejected')} className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Reject</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminTopicCoverage({ onOpenEvidence }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Topic coverage · UPSC CSE · Prelims</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">Only locked rows surface as high-yield to users.</h2>
        </div>
        <div className="flex gap-2">
          <Pill tone="ink">{DATA.adminTopicCoverage.filter(t=>t.status==='locked').length} locked</Pill>
          <Pill tone="sage">{DATA.adminTopicCoverage.filter(t=>t.status==='reviewed').length} reviewed</Pill>
          <Pill tone="amber">{DATA.adminTopicCoverage.filter(t=>t.status==='pending_review').length} pending</Pill>
          <Pill tone="outline">{DATA.adminTopicCoverage.filter(t=>t.status==='draft').length} draft</Pill>
        </div>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead>
            <tr>
              <th>Subject</th><th>Topic</th><th>Depth</th><th>Exp diff</th><th>Priority</th>
              <th>High-yield</th><th>Confidence</th><th>Status</th><th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {DATA.adminTopicCoverage.map((t,i) => (
              <tr key={i}>
                <td className="text-[#6C5038]">{t.subject}</td>
                <td><strong>{t.topic}</strong></td>
                <td><Pill tone="outline">{t.depth}</Pill></td>
                <td className="num-mono">{Math.round(t.expDiff*100)}%</td>
                <td className="num-mono">{Math.round(t.prio*100)}</td>
                <td>
                  {t.hy ? (t.status === 'locked' ? <TrustStamp kind="locked" label="HY · locked" /> : <TrustStamp kind="preview" label="HY · pending lock" />) : <Pill tone="outline">—</Pill>}
                </td>
                <td><ConfidencePill value={t.conf} evidence={t.evid} /></td>
                <td>
                  {t.status === 'locked' && <TrustStamp kind="locked" />}
                  {t.status === 'reviewed' && <TrustStamp kind="verified" label="Reviewed" />}
                  {t.status === 'pending_review' && <TrustStamp kind="needs" label="Pending review" />}
                  {t.status === 'draft' && <TrustStamp kind="preview" label="Draft" />}
                  {t.status === 'rejected' && <TrustStamp kind="notcon" label="Rejected" />}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button onClick={()=>onOpenEvidence(t)} className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Evidence ({t.evid})</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Lock</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold">Request more evidence</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminCompetition() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Competition metrics</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Only locked rows affect Study OS context.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Unverified competition data is shown as preview to users. The planner does not adapt to unverified numbers.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead>
            <tr>
              <th>Exam</th><th>Cycle</th><th>Vacancy</th><th>Applicant ratio</th>
              <th>Cutoff trend</th><th>Difficulty trend</th><th>Reliability</th><th>Status</th>
              <th className="right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {DATA.adminCompetition.map((r,i) => (
              <tr key={i}>
                <td><strong>{r.exam}</strong></td>
                <td className="num-mono">{r.cycle}</td>
                <td className="num-mono">{r.vacancy.toLocaleString()}</td>
                <td className="num-mono">{r.ratio}</td>
                <td>{r.cutoff}</td>
                <td>{r.diff}</td>
                <td><ConfidencePill value={r.reliability} /></td>
                <td>
                  {r.status === 'locked' && <TrustStamp kind="locked" />}
                  {r.status === 'reviewed' && <TrustStamp kind="verified" label="Reviewed" />}
                  {r.status === 'pending_review' && <TrustStamp kind="needs" label="Pending" />}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Lock</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Hold as preview</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminPolicy({ onOpenSource }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Policy updates</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Source lanes — strictly enforced.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Rule: aggregator cannot affect plan until paired with an official source. Research informs strategy only. Opportunity is separate from recruitment truth.</p>
      </div>
      <div className="px-7 pb-6">
        <div className="grid grid-cols-4 gap-4">
          <PolicyLane kind="official" items={DATA.adminPolicy.filter(p=>p.type==='official')} onPick={onOpenSource} />
          <PolicyLane kind="aggregator" items={DATA.adminPolicy.filter(p=>p.type==='aggregator')} onPick={onOpenSource} />
          <PolicyLane kind="research" items={DATA.adminPolicy.filter(p=>p.type==='research')} onPick={onOpenSource} />
          <PolicyLane kind="opportunity" items={DATA.adminPolicy.filter(p=>p.type==='opportunity')} onPick={onOpenSource} />
        </div>
      </div>
    </Card>
  );
}

function PolicyLane({ kind, items, onPick }) {
  return (
    <div>
      <div className="mb-3"><TrustStamp kind={kind} /></div>
      <div className="space-y-3">
        {items.length === 0 ? <EmptyState icon="·" title="No items" body="Nothing in this lane." /> : items.map(p => (
          <button key={p.id} onClick={()=>onPick(p)} className="text-left w-full rounded-xl border border-[#E7DECB] bg-white/60 p-3.5 hover:border-[#A68057]">
            <div className="font-serif text-[15px] leading-snug">{p.title}</div>
            <div className="num-mono text-[10.5px] text-[#6C5038] mt-1.5">{p.source}</div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {(p.impacts || []).length > 0
                ? p.impacts.map((im,i) => <Pill key={i} tone="amber">{im}</Pill>)
                : <Pill tone="outline">no plan impact</Pill>}
            </div>
            <div className="num-mono text-[10px] text-[#6C5038] mt-2">{p.at}</div>
            {p.blockedBy && <div className="text-[10.5px] text-[#7A3925] mt-1.5">⛔ {p.blockedBy}</div>}
          </button>
        ))}
      </div>
    </div>
  );
}

function AdminPlanImpact() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Plan impact</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Before / after — and who it affects.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">No automatic mutation in prototype. Each impact requires admin approval and staged rollout.</p>
      </div>
      <div className="px-7 pb-6 space-y-4">
        {DATA.adminPlanImpact.map(p => <PlanImpactCard key={p.id} p={p} />)}
      </div>
    </Card>
  );
}

function PlanImpactCard({ p }) {
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-5">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="font-serif text-[18px]">{p.title}</div>
          <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">{p.id} · risk {p.risk} · rollout {p.rollout}</div>
        </div>
        <div className="flex gap-2 shrink-0">
          {p.approval === 'approved' ? <Pill tone="sage">Approved</Pill> : <Pill tone="amber">Pending approval</Pill>}
          <Pill tone="ink">{p.affectedUsers.toLocaleString()} users</Pill>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-4 mt-4">
        <div className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2] p-4">
          <Eyebrow>Before · {p.before}</Eyebrow>
          <div className="text-[12.5px] text-[#6C5038] mt-2">Current state. Affects {p.affectedExams.join(', ')}.</div>
        </div>
        <div className="rounded-lg border border-[#B9CFAF] bg-[#F0F5EF] p-4">
          <Eyebrow>After · {p.after}</Eyebrow>
          <div className="text-[12.5px] text-[#33482F] mt-2">{p.note}</div>
        </div>
      </div>
      <div className="rule mt-4 pt-3 flex gap-2 flex-wrap">
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Approve &amp; roll out</button>
        <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">Stage further</button>
        <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Reject</button>
      </div>
    </div>
  );
}

window.ScreenAdminExam = ScreenAdminExam;
