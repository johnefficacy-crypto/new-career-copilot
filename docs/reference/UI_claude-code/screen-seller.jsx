/* /app/marketplace/sell — Seller dashboard */
const { useState: useStateS2 } = React;

function ScreenSellerDash() {
  const [tab, setTab] = useStateS2("overview");
  return (
    <div data-screen-label="Seller dashboard">
      <PageHeader eyebrow="Seller · you are Kavya Iyer"
        title="Sell what you actually know · Career Copilot takes 20%."
        sub="Listings, sales, payouts, reviews. Payouts every 4 weeks via Razorpay. Refunds are admin-mediated."
        right={
          <div className="flex gap-2">
            <button className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Public profile</button>
            <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ New listing</button>
          </div>
        } />

      <div className="px-10 space-y-6">
        <SellerKPIs />
        <Tabs value={tab} onChange={setTab} options={[
          { value:"overview", label:"Overview" },
          { value:"listings", label:"Listings", badge:SELLER_DASH.listings.length },
          { value:"orders",   label:"Orders" },
          { value:"payouts",  label:"Payouts" },
          { value:"reviews",  label:"Reviews" },
        ]} />

        {tab === "overview" && <SellerOverview />}
        {tab === "listings" && <SellerListings />}
        {tab === "orders"   && <SellerOrders />}
        {tab === "payouts"  && <SellerPayouts />}
        {tab === "reviews"  && <SellerReviews />}
      </div>
      <FooterStrip />
    </div>
  );
}

function SellerKPIs() {
  const k = SELLER_DASH.kpis;
  const growth = ((k.revenueMonth - k.revenuePrev) / k.revenuePrev * 100).toFixed(1);
  return (
    <div className="grid grid-cols-6 gap-3">
      <KPI k="Listings" v={`${k.listingsActive}/${k.listings}`} tone="ink" sub="active / total" />
      <KPI k="Revenue · May" v={`₹${k.revenueMonth.toLocaleString()}`} tone="ink" sub={`${growth >= 0 ? '+' : ''}${growth}% vs Apr`} />
      <KPI k="Students · May" v={k.studentsMonth} tone="sage" sub="new buyers" />
      <KPI k="Avg rating" v={`★ ${k.avgRating}`} tone="sage" sub="across listings" />
      <KPI k="Refunds · May" v={`${(k.refundsPct*100).toFixed(1)}%`} tone="amber" sub="of orders" />
      <KPI k="Pending payout" v={`₹${k.pendingPayout.toLocaleString()}`} tone="amber" sub="next May 30" />
    </div>
  );
}

function SellerOverview() {
  return (
    <>
      <Card>
        <SectionHeader eyebrow="Monthly revenue · last 6" title="Trend." sub="Bars are revenue after 20% platform fee." right={<StatusDot state="live" />} />
        <svg viewBox="0 0 720 180" className="w-full h-[180px]">
          {[0,15000,30000,45000].map((y,i) => (
            <g key={i}>
              <line x1="60" y1={150 - (y/52000)*120} x2="700" y2={150 - (y/52000)*120} stroke="#EFE7D4" />
              <text x="52" y={150 - (y/52000)*120} textAnchor="end" dominantBaseline="central" fontFamily="JetBrains Mono" fontSize="9.5" fill="#6C5038">{y === 0 ? '0' : '₹' + (y/1000) + 'k'}</text>
            </g>
          ))}
          {SELLER_DASH.monthlyRevenue.map((m,i) => (
            <g key={i}>
              <rect x={80 + i*108} y={150 - (m.v/52000)*120} width="58" height={(m.v/52000)*120} fill={m.partial ? '#BE9C6B' : '#54794E'} rx="4" />
              <text x={109 + i*108} y={150 - (m.v/52000)*120 - 6} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#2E2218">₹{(m.v/1000).toFixed(1)}k</text>
              <text x={109 + i*108} y={170} textAnchor="middle" fontFamily="JetBrains Mono" fontSize="10" fill="#6C5038">{m.m}{m.partial ? '*' : ''}</text>
            </g>
          ))}
        </svg>
        <div className="text-[10.5px] text-[#6C5038] mt-1">* partial month · pending payout</div>
      </Card>

      <div className="grid grid-cols-2 gap-6">
        <Card>
          <SectionHeader eyebrow="Top listings · last 30 days" title="Where your revenue actually comes from." />
          <ul className="space-y-2.5">
            {SELLER_DASH.listings.filter(l => l.sold30d > 0).sort((a,b)=>b.revenue30d-a.revenue30d).slice(0,4).map(l => {
              const p = PRODUCTS.find(x => x.id === l.id);
              const title = p?.title || l.title;
              return (
                <li key={l.id} className="grid grid-cols-[1fr_60px_80px] gap-3 items-center text-[12.5px]">
                  <span className="truncate">{title}</span>
                  <span className="num-mono text-[#6C5038] text-right">{l.sold30d} sold</span>
                  <span className="num-mono text-right font-semibold">₹{l.revenue30d.toLocaleString()}</span>
                </li>
              );
            })}
          </ul>
        </Card>

        <Card className="!bg-[#2E2218] !border-[#2E2218]">
          <Eyebrow tone="dark">Payout · next cycle</Eyebrow>
          <div className="font-serif text-[36px] text-[#F3EADB] mt-1.5 leading-none">₹{SELLER_DASH.kpis.pendingPayout.toLocaleString()}</div>
          <div className="num-mono text-[11px] text-[#D6BC93] mt-2">Razorpay transfer · scheduled May 30</div>
          <div className="rule mt-4 pt-3 text-[11.5px] text-[#D6BC93] border-[#4E3A29] space-y-1.5">
            <div>· Calculated from gross May revenue minus 20% platform fee</div>
            <div>· Excludes 2 orders still inside refund window</div>
            <div>· Bank: HDFC ****4218 · last verified Apr 02</div>
          </div>
          <button className="mt-4 text-[11.5px] px-3 py-1.5 rounded-full border border-[#6C5038] text-[#D6BC93] font-semibold">Edit bank details</button>
        </Card>
      </div>

      <Card>
        <SectionHeader eyebrow="Recent orders · last 24h" title="Live buyer activity." right={<StatusDot state="live" />} />
        <table className="tbl">
          <thead><tr><th>When</th><th>Buyer</th><th>Product</th><th>Amount</th><th>You earn</th><th className="right">Ref</th></tr></thead>
          <tbody>
            {SELLER_DASH.recentOrders.map((o,i) => (
              <tr key={i}>
                <td className="num-mono text-[#6C5038]">{o.at}</td>
                <td>{o.buyer}</td>
                <td>{o.product}</td>
                <td className="num-mono">₹{o.amount.toLocaleString()}</td>
                <td className="num-mono text-[#33482F] font-semibold">₹{Math.round(o.amount*0.8).toLocaleString()}</td>
                <td className="right num-mono text-[10.5px] text-[#6C5038]">{o.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </>
  );
}

function SellerListings() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Listings</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">All your products · {SELLER_DASH.listings.length} total.</h2>
          <p className="text-[12px] text-[#6C5038] mt-1">New listings require admin approval before going live. Drafts are private to you.</p>
        </div>
        <button className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">+ New listing</button>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Listing</th><th>Type</th><th>Price</th><th>Sold · 30d</th><th>Revenue · 30d</th><th>Rating</th><th>Status</th><th className="right">Actions</th></tr></thead>
          <tbody>
            {SELLER_DASH.listings.map(l => {
              const p = PRODUCTS.find(x => x.id === l.id);
              const title = p?.title || l.title;
              const type = p?.type || l.type;
              return (
                <tr key={l.id}>
                  <td><strong>{title}</strong>{l.blockedBy && <div className="text-[10.5px] text-[#7A3925] mt-0.5">⛔ {l.blockedBy}</div>}</td>
                  <td><Pill tone="outline">{type?.replace('_',' ')}</Pill></td>
                  <td className="num-mono">₹{l.priceShown.toLocaleString()}</td>
                  <td className="num-mono">{l.sold30d}</td>
                  <td className="num-mono">₹{l.revenue30d.toLocaleString()}</td>
                  <td className="num-mono">{l.rating ? `★ ${l.rating}` : "—"}</td>
                  <td>
                    {l.status === 'live'   && <TrustStamp kind="live" label="Live" />}
                    {l.status === 'draft'  && <TrustStamp kind="preview" label="Draft" />}
                    {l.status === 'paused' && <TrustStamp kind="notcon" label="Paused" />}
                    {l.status === 'review' && <TrustStamp kind="needs" label="In review" />}
                  </td>
                  <td className="right">
                    <div className="flex gap-1.5 justify-end">
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Edit</button>
                      <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Analytics</button>
                      {l.status === 'live' && <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#BE9C6B] text-[#6C5038] font-semibold">Pause</button>}
                      {l.status === 'draft' && <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#33482F] text-[#F0F5EF] font-semibold">Submit for review</button>}
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

function SellerOrders() {
  const orders = [
    ...SELLER_DASH.recentOrders.map(o => ({ ...o, status:"completed" })),
    { at:"2d ago", buyer:"Sandeep R.", product:"Federalism, end-to-end", amount:2499, ref:"ORD-2026-05-1762", status:"refund-requested" },
    { at:"3d ago", buyer:"Megha T.",   product:"PYQ Polity walkthrough", amount:999,  ref:"ORD-2026-05-1701", status:"completed" },
  ];
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Orders</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">{orders.length} orders · last 7 days</h2>
        </div>
        <div className="flex gap-2">
          <Pill tone="outline">All</Pill>
          <Pill tone="sage">Completed</Pill>
          <Pill tone="amber">Refund-requested</Pill>
        </div>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>When</th><th>Buyer</th><th>Product</th><th>Amount</th><th>Your earn</th><th>Status</th><th className="right">Ref</th></tr></thead>
          <tbody>
            {orders.map((o,i) => (
              <tr key={i}>
                <td className="num-mono text-[#6C5038]">{o.at}</td>
                <td>{o.buyer}</td>
                <td>{o.product}</td>
                <td className="num-mono">₹{o.amount.toLocaleString()}</td>
                <td className="num-mono">₹{Math.round(o.amount*0.8).toLocaleString()}</td>
                <td>{o.status === "completed" ? <Pill tone="sage">paid</Pill> : <Pill tone="amber">refund pending</Pill>}</td>
                <td className="right num-mono text-[10.5px] text-[#6C5038]">{o.ref}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SellerPayouts() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Payouts · Razorpay</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">Every 4 weeks · after the refund window closes.</h2>
        <p className="text-[12px] text-[#6C5038] mt-1">Platform fee is 20% on first-party hosted products. GST is collected and remitted on your behalf.</p>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>Date</th><th>Amount</th><th>Reference</th><th>Status</th><th>Notes</th><th className="right">Receipt</th></tr></thead>
          <tbody>
            <tr>
              <td className="num-mono">{`May 30 · scheduled`}</td>
              <td className="num-mono font-semibold">₹{SELLER_DASH.kpis.pendingPayout.toLocaleString()}</td>
              <td className="num-mono text-[#6C5038]">PAY-2026-05-K42</td>
              <td><Pill tone="amber">queued</Pill></td>
              <td className="text-[#6C5038]">2 orders still in refund window</td>
              <td className="right text-[#6C5038]">—</td>
            </tr>
            {SELLER_DASH.payouts.map((p,i) => (
              <tr key={i}>
                <td className="num-mono">{p.at}</td>
                <td className="num-mono">₹{p.amount.toLocaleString()}</td>
                <td className="num-mono text-[#6C5038]">{p.ref}</td>
                <td><Pill tone="sage">{p.status}</Pill></td>
                <td className="text-[#6C5038]">{p.net}</td>
                <td className="right"><button className="text-[11px] text-[#6C5038] hover:text-[#2E2218] underline">Download</button></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SellerReviews() {
  return (
    <Card>
      <SectionHeader eyebrow="Recent reviews" title={`Average ★ ${SELLER_DASH.kpis.avgRating} across listings.`} sub="Review responses are public. Be calm. Be brief." />
      <ul className="space-y-4">
        {SELLER_DASH.reviewsRecent.map((r,i) => (
          <li key={i} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
            <div className="flex items-center justify-between">
              <div className="num-mono text-[12px] text-[#54794E]">{"★".repeat(r.stars)}{"☆".repeat(5-r.stars)}</div>
              <div className="num-mono text-[10.5px] text-[#6C5038]">{r.buyer} · {r.at}</div>
            </div>
            <div className="font-serif text-[14px] mt-1.5">{r.product}</div>
            <p className="text-[13px] text-[#3a2e22] mt-1.5 leading-snug">{r.body}</p>
            <div className="rule mt-3 pt-3 flex gap-2">
              <button className="text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Respond publicly</button>
              <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Thank buyer</button>
              <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Report (if abusive)</button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}

window.ScreenSellerDash = ScreenSellerDash;
