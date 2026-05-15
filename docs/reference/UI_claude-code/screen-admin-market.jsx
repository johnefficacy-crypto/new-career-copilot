/* /admin/marketplace — Approvals, refunds, payouts, flagged */
const { useState: useStateAM } = React;

const ADMIN_MARKET_TABS = [
  { value:"overview",   label:"Overview" },
  { value:"approvals",  label:"Approval queue", badge:ADMIN_MARKET.approvalQueue.length },
  { value:"refunds",    label:"Refund requests", badge:ADMIN_MARKET.refundRequests.length },
  { value:"payouts",    label:"Payouts" },
  { value:"flagged",    label:"Flagged listings", badge:ADMIN_MARKET.flagged.length },
  { value:"sellers",    label:"Sellers" },
  { value:"affiliates", label:"Affiliate partners" },
];

function ScreenAdminMarket() {
  const [tab, setTab] = useStateAM("overview");
  return (
    <div data-screen-label="Admin · Marketplace">
      <PageHeader eyebrow="Admin · Marketplace"
        title="Curation over volume. Refunds over outrage."
        sub="Approvals are human. Refunds inside the window go through automatically. Outside the window, escalations land here."
        right={
          <div className="flex gap-2 items-center flex-wrap justify-end shrink-0">
            <span className="num-mono text-[10.5px] text-[#6C5038] whitespace-nowrap">admin@ccp</span>
            <Pill tone="ink" className="whitespace-nowrap">RBAC · marketplace-ops</Pill>
          </div>
        } />

      <div className="px-10">
        <Tabs value={tab} onChange={setTab} options={ADMIN_MARKET_TABS} />

        <div className="mt-6 space-y-6">
          <AdminMarketKPIs />
          {tab === "overview"   && <AdminMarketOverview />}
          {tab === "approvals"  && <AdminApprovals />}
          {tab === "refunds"    && <AdminRefunds />}
          {tab === "payouts"    && <AdminPayouts />}
          {tab === "flagged"    && <AdminFlagged />}
          {tab === "sellers"    && <AdminSellers />}
          {tab === "affiliates" && <AdminAffiliates />}
        </div>
      </div>
      <FooterStrip />
    </div>
  );
}

function AdminMarketKPIs() {
  const k = ADMIN_MARKET.kpis;
  const growth = ((k.gmvMonth - k.gmvPrev) / k.gmvPrev * 100).toFixed(1);
  return (
    <div className="grid grid-cols-6 gap-3">
      <KPI k="GMV · May" v={`₹${(k.gmvMonth/100000).toFixed(1)}L`} tone="ink"  sub={`${growth >= 0 ? '+' : ''}${growth}% vs Apr`} />
      <KPI k="Paid out · May" v={`₹${(k.paidOut/100000).toFixed(1)}L`} tone="sage" sub="to sellers" />
      <KPI k="Pending payout"  v={`₹${(k.pendingPayout/1000).toFixed(0)}k`} tone="amber" sub="next May 30" />
      <KPI k="Refunds · May"    v={`₹${(k.refundsMonth/1000).toFixed(0)}k`} tone="rose" sub={`${(k.refundsPct*100).toFixed(1)}% of GMV`} />
      <KPI k="Approval queue"   v={k.approvalsPending} tone="amber" sub="awaiting decision" />
      <KPI k="Flagged listings" v={k.flagged}          tone="rose"  sub="needs review" />
    </div>
  );
}

function AdminMarketOverview() {
  return (
    <>
      <Card>
        <SectionHeader eyebrow="Today" title="What needs your attention."
          sub="High-severity first." />
        <ul className="space-y-2.5">
          {[
            { sev:"high", t:`${ADMIN_MARKET.flagged.filter(f=>f.severity==='high').length} listings flagged · misleading copy or copyright`, cta:"Open flagged" },
            { sev:"med",  t:`${ADMIN_MARKET.approvalQueue.length} products awaiting approval`, cta:"Open queue" },
            { sev:"med",  t:`${ADMIN_MARKET.refundRequests.filter(r=>r.state==='escalated').length} refund escalations outside window`, cta:"Open refunds" },
            { sev:"low",  t:"Affiliate partner 'VajiramPrep' submitted updated price list",     cta:"Open affiliates" },
          ].map((r,i) => (
            <li key={i} className="grid grid-cols-[10px_1fr_140px] gap-3 items-center text-[12.5px] py-2 border-b border-[#EFE7D4] last:border-0">
              <span className={`sdot ${r.sev === 'high' ? 'sdot-not' : r.sev === 'med' ? 'sdot-partial' : 'sdot-preview'}`}></span>
              <span>{r.t}</span>
              <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">{r.cta} →</button>
            </li>
          ))}
        </ul>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <SectionHeader eyebrow="GMV split · May" title="Where the money came from." />
          <ul className="space-y-2">
            {[
              { k:"Test series",      v:62, color:"#54794E" },
              { k:"Courses",          v:18, color:"#A68057" },
              { k:"Notes & PYQ",      v:10, color:"#524864" },
              { k:"Mentor programs",  v:6,  color:"#8A6846" },
              { k:"Affiliate · coaching", v:4, color:"#BE9C6B" },
            ].map((s,i) => (
              <li key={i} className="grid grid-cols-[140px_1fr_60px] gap-3 items-center text-[12.5px]">
                <span className="flex items-center gap-2"><span className="w-2.5 h-2.5 rounded-sm" style={{background:s.color}}></span>{s.k}</span>
                <div className="h-[7px] bg-[#EFE2C9] rounded-full overflow-hidden">
                  <div className="h-full" style={{ width:`${s.v}%`, background:s.color }}></div>
                </div>
                <span className="num-mono text-right">{s.v}%</span>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <SectionHeader eyebrow="Top sellers · May" title="By revenue." />
          <table className="tbl">
            <thead><tr><th>Seller</th><th>GMV</th><th>Listings</th><th>Refund %</th></tr></thead>
            <tbody>
              {[
                { name:"Career Copilot Studio", gmv:842000, l:8, ref:0.4 },
                { name:"Kalam Academy (aff)", gmv:386000, l:14, ref:0.0 },
                { name:"Isha Trivedi",          gmv:204200, l:4,  ref:1.8 },
                { name:"Kavya Iyer",            gmv:167916, l:6,  ref:1.8 },
                { name:"Arjun S.",              gmv:88460,  l:3,  ref:1.1 },
              ].map((s,i) => (
                <tr key={i}>
                  <td><strong>{s.name}</strong></td>
                  <td className="num-mono">₹{(s.gmv/1000).toFixed(0)}k</td>
                  <td className="num-mono">{s.l}</td>
                  <td className="num-mono">{s.ref.toFixed(1)}%</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      </div>
    </>
  );
}

function AdminApprovals() {
  const [rows, setRows] = useStateAM(ADMIN_MARKET.approvalQueue);
  function act(id, status) { setRows(rs => rs.map(r => r.id === id ? {...r, status} : r)); }
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Approval queue</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">{rows.filter(r=>r.status==='pending').length} pending · {rows.filter(r=>r.status==='needs-changes').length} need changes</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">No auto-approval. Marketing copy must be honest. Affiliate links must resolve. Refund policy must be displayed.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Listing</th><th>Seller</th><th>Type</th><th>Price</th><th>Submitted</th><th>Flags</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {rows.map(r => {
              const s = SELLERS[r.seller];
              return (
                <tr key={r.id}>
                  <td><strong>{r.title}</strong></td>
                  <td><div className="flex items-center gap-2"><Avatar user={{name:s?.name, avatarColor:s?.avatarColor}} size={22} /><span className="text-[#3a2e22]">{s?.name}</span></div></td>
                  <td><Pill tone="outline">{r.type.replace('_',' ')}</Pill></td>
                  <td className="num-mono">₹{r.price.toLocaleString()}</td>
                  <td className="num-mono text-[#6C5038]">{r.submittedAt}</td>
                  <td>{r.flags.length === 0 ? <Pill tone="outline">—</Pill> : r.flags.map((f,i) => <Pill key={i} tone="rose" className="!text-[9.5px] mr-1">{f}</Pill>)}</td>
                  <td>
                    {r.status === 'pending' && <TrustStamp kind="needs" label="Pending" />}
                    {r.status === 'approved' && <TrustStamp kind="verified" />}
                    {r.status === 'needs-changes' && <TrustStamp kind="preview" label="Needs changes" />}
                    {r.status === 'rejected' && <TrustStamp kind="notcon" label="Rejected" />}
                  </td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">Open detail</button>
                      <button onClick={()=>act(r.id,'approved')} className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Approve</button>
                      <button onClick={()=>act(r.id,'needs-changes')} className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold whitespace-nowrap">Request changes</button>
                      <button onClick={()=>act(r.id,'rejected')} className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Reject</button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function AdminRefunds() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Refund requests</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">In-window refunds auto-process. Out-of-window escalate here.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Bias toward approval. A free refund preserves trust; a contested one destroys it.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Order</th><th>Product</th><th>Buyer</th><th>Amount</th><th>Reason</th><th>Window</th><th>State</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {ADMIN_MARKET.refundRequests.map(r => (
              <tr key={r.id}>
                <td className="num-mono text-[10.5px] text-[#6C5038]">{r.orderId}</td>
                <td><strong>{r.product}</strong></td>
                <td>{r.buyer}</td>
                <td className="num-mono">₹{r.amount.toLocaleString()}</td>
                <td className="text-[#3a2e22]">{r.reason}</td>
                <td>{r.withinWindow ? <Pill tone="sage">in-window</Pill> : <Pill tone="rose">out-of-window</Pill>}</td>
                <td>
                  {r.state === 'open' && <TrustStamp kind="needs" label="Open" />}
                  {r.state === 'escalated' && <TrustStamp kind="preview" label="Escalated" />}
                  {r.state === 'approved' && <TrustStamp kind="verified" label="Approved" />}
                  {r.state === 'denied' && <TrustStamp kind="notcon" label="Denied" />}
                </td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Approve refund</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold whitespace-nowrap">Partial · 50%</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Deny</button>
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

function AdminPayouts() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Payouts · this cycle</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">May 30 · ₹{ADMIN_MARKET.payouts.filter(p=>p.state==='queued').reduce((a,b)=>a+b.amount,0).toLocaleString()} queued to {ADMIN_MARKET.payouts.filter(p=>p.state==='queued').length} sellers.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Razorpay batch transfer at 14:00 IST. Holds release once flagged orders resolve.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Seller</th><th>Amount</th><th>Cycle</th><th>State</th><th>Note</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {ADMIN_MARKET.payouts.map((p,i) => (
              <tr key={i}>
                <td><strong>{p.name}</strong><div className="num-mono text-[10.5px] text-[#6C5038]">{p.sellerId}</div></td>
                <td className="num-mono">₹{p.amount.toLocaleString()}</td>
                <td className="num-mono">{p.cycle}</td>
                <td>
                  {p.state === 'queued' && <Pill tone="sage">queued · {p.scheduled}</Pill>}
                  {p.state === 'hold' && <Pill tone="amber">hold</Pill>}
                  {p.state === 'affiliate' && <Pill tone="dusk">affiliate · {p.scheduled}</Pill>}
                </td>
                <td className="text-[#6C5038]">{p.reason || (p.state === 'queued' ? 'Refund window closed' : '')}</td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">Open breakdown</button>
                    {p.state === 'hold' && <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold whitespace-nowrap">Release hold</button>}
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

function AdminFlagged() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Flagged listings</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">{ADMIN_MARKET.flagged.length} need a decision.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Misleading copy ("guaranteed selection"), price drift on affiliate links, copyright on PDFs.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Severity</th><th>Listing</th><th>Seller</th><th>Reason</th><th>Flagged at</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {ADMIN_MARKET.flagged.map(f => (
              <tr key={f.id}>
                <td>
                  {f.severity === 'high'   && <Pill tone="rose">high</Pill>}
                  {f.severity === 'medium' && <Pill tone="amber">medium</Pill>}
                  {f.severity === 'low'    && <Pill tone="outline">low</Pill>}
                </td>
                <td><strong>{f.title}</strong></td>
                <td className="num-mono text-[#6C5038]">{f.seller}</td>
                <td className="text-[#3a2e22]">{f.reason}</td>
                <td className="num-mono text-[#6C5038]">{f.at}</td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">Open listing</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#7A3925] text-[#F2DDD6] font-semibold whitespace-nowrap">Take down</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold whitespace-nowrap">Warn seller</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#94B28A] text-[#33482F] font-semibold whitespace-nowrap">Mark resolved</button>
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

function AdminSellers() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Sellers</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{Object.keys(SELLERS).length} active sellers across categories.</h2>
        </div>
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ Invite seller</button>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Seller</th><th>Trust</th><th>Listings</th><th>Rating</th><th>Platform cut</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {Object.values(SELLERS).map(s => (
              <tr key={s.id}>
                <td>
                  <div className="flex items-center gap-2">
                    <Avatar user={{name:s.name, avatarColor:s.avatarColor}} size={26} />
                    <div>
                      <strong>{s.name}</strong>
                      <div className="num-mono text-[10.5px] text-[#6C5038]">{s.badge}</div>
                    </div>
                  </div>
                </td>
                <td><SellerTrustBadge trust={s.kind === "first-party" ? "first-party" : s.kind === "topper" ? "verified-topper" : s.kind === "officer" ? "verified-officer" : s.kind} /></td>
                <td className="num-mono">{s.products}</td>
                <td className="num-mono">★ {s.rating}</td>
                <td className="num-mono">{s.kind === "affiliate" ? `${Math.round(s.affiliateCut*100)}% affiliate` : `${Math.round((1-s.payoutShare)*100)}%`}</td>
                <td className="right">
                  <div className="flex gap-1.5 justify-end">
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">Open profile</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold whitespace-nowrap">Adjust cut</button>
                    <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold whitespace-nowrap">Pause seller</button>
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

function AdminAffiliates() {
  return (
    <Card>
      <SectionHeader eyebrow="Affiliate partners"
        title="Coaching institutes and content partners we share revenue with."
        sub="All partners must accept Career Copilot's refund passthrough and price-parity rules." />
      <div className="grid grid-cols-2 gap-4">
        {[
          { name:"Kalam Academy", since:"2023", products:14, cut:18, gmv:386000, status:"active" },
          { name:"VajiramPrep",   since:"2025", products:9,  cut:18, gmv:182000, status:"active" },
        ].map((a,i) => (
          <div key={i} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <div className="flex items-center justify-between">
              <div className="font-serif text-[18px]">{a.name}</div>
              <Pill tone="sage">{a.status}</Pill>
            </div>
            <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">partner since {a.since}</div>
            <div className="grid grid-cols-3 gap-3 mt-4">
              <Mini2 k="Listings" v={a.products} />
              <Mini2 k="Cut" v={`${a.cut}%`} />
              <Mini2 k="GMV · May" v={`₹${(a.gmv/1000).toFixed(0)}k`} />
            </div>
            <div className="rule mt-3 pt-3 flex gap-2">
              <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Open agreement</button>
              <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold">Adjust cut</button>
              <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Pause partner</button>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function Mini2({ k, v }) {
  return (
    <div className="rounded-md border border-[#E7DECB] bg-[#FBF8F2] p-2">
      <div className="eyebrow !text-[9px]">{k}</div>
      <div className="font-serif text-[15px] mt-0.5">{v}</div>
    </div>
  );
}

window.ScreenAdminMarket = ScreenAdminMarket;
