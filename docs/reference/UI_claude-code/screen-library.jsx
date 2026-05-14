/* /app/marketplace/library — My library + cart + order history */
const { useState: useStateLib } = React;

function ScreenLibrary() {
  const [tab, setTab] = useStateLib("library");
  return (
    <div data-screen-label="My library">
      <PageHeader eyebrow="My library"
        title="Everything you've bought — and what it's actually doing for your plan."
        sub="Active purchases auto-feed Study OS where supported. Refund window status shown on every order."
        right={<a href="#marketplace" className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">← Back to marketplace</a>} />

      <div className="px-10 space-y-6">
        <Tabs value={tab} onChange={setTab} options={[
          { value:"library", label:"Library", badge:LIBRARY.length },
          { value:"cart",    label:"Cart",    badge:CART.length },
          { value:"orders",  label:"Order history" },
          { value:"saved",   label:"Saved" },
        ]} />

        {tab === "library" && <LibraryView />}
        {tab === "cart"    && <CartView />}
        {tab === "orders"  && <OrdersView />}
        {tab === "saved"   && <SavedView />}
      </div>
      <FooterStrip />
    </div>
  );
}

function LibraryView() {
  const active   = LIBRARY.filter(i => i.status === 'active');
  const completed = LIBRARY.filter(i => i.status === 'completed');
  return (
    <>
      <div className="grid grid-cols-4 gap-3">
        <KPI k="Active purchases"  v={active.length}    tone="ink" sub="auto-feeding Study OS" />
        <KPI k="Total spend · 90d" v={`₹${LIBRARY.reduce((a,b)=>a+b.price,0).toLocaleString()}`} tone="ink" sub="across all categories" />
        <KPI k="Avg progress"      v={`${Math.round(active.reduce((a,b)=>a+b.progress,0)/active.length*100)}%`} tone="sage" sub="across active" />
        <KPI k="Refundable now"    v="2" tone="amber" sub="within window" />
      </div>

      <Card padded={false}>
        <div className="px-7 pt-6 pb-3 flex items-end justify-between">
          <div>
            <Eyebrow>Active</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1">{active.length} products you can use right now.</h2>
          </div>
          <div className="flex gap-2 items-center">
            <Pill tone="outline">All</Pill>
            <Pill tone="sage">Auto-feeds Study OS</Pill>
            <Pill tone="amber">Refund window open</Pill>
          </div>
        </div>
        <div className="px-7 pb-6 space-y-3">
          {active.map(item => <LibraryRow key={item.orderId} item={item} />)}
        </div>
      </Card>

      {completed.length > 0 && (
        <Card padded={false}>
          <div className="px-7 pt-6 pb-3">
            <Eyebrow>Completed</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1">{completed.length} finished.</h2>
          </div>
          <div className="px-7 pb-6 space-y-3">
            {completed.map(item => <LibraryRow key={item.orderId} item={item} completed />)}
          </div>
        </Card>
      )}
    </>
  );
}

function LibraryRow({ item, completed }) {
  const p = PRODUCTS.find(x => x.id === item.productId);
  if (!p) return null;
  return (
    <div className="rounded-xl border border-[#E7DECB] bg-white/70 p-4 flex gap-4 items-start">
      <ProductCover p={p} h={88} />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <SellerTrustBadge trust={p.trust} />
          {p.planRelevant && <Pill tone="sage" className="!text-[9.5px]">◐ For your plan</Pill>}
          {completed && <Pill tone="ink">Completed</Pill>}
          {item.expiringIn && <Pill tone="amber">Access expires in {item.expiringIn}</Pill>}
        </div>
        <h3 className="font-serif text-[16px] mt-1.5 leading-snug">{p.title}</h3>
        <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">
          {p.lessonsLabel || p.pages} · purchased {item.purchasedAt} · ₹{item.price.toLocaleString()} · {item.orderId}
        </div>
        <div className="mt-3 flex items-center gap-3">
          <div className="flex-1 h-[6px] bg-[#EFE2C9] rounded-full overflow-hidden">
            <div className="h-full bg-[#54794E]" style={{width:`${Math.round(item.progress*100)}%`}}></div>
          </div>
          <span className="num-mono text-[11px] text-[#6C5038]">{Math.round(item.progress*100)}% · last used {item.lastUsedAt}</span>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5">
          <button className="text-[11.5px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Open</button>
          <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Download</button>
          <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Receipt</button>
          {item.progress < 0.25 && p.refundDays && <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Request refund</button>}
          <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#94B28A] text-[#33482F] font-semibold ml-auto">Add tasks to today →</button>
        </div>
      </div>
    </div>
  );
}

function CartView() {
  const items = CART.map(c => ({ ...c, p: PRODUCTS.find(p => p.id === c.productId) })).filter(c => c.p);
  const subtotal = items.reduce((a,c) => a + c.p.price * c.qty, 0);
  const platformFee = 0;
  const tax = Math.round(subtotal * 0.18 / 1.18);   // GST inclusive demo
  return (
    <div className="grid grid-cols-[1fr_360px] gap-6">
      <Card padded={false}>
        <div className="px-7 pt-6 pb-3 flex items-end justify-between">
          <div>
            <Eyebrow>Cart</Eyebrow>
            <h2 className="font-serif text-[22px] mt-1">{items.length} items</h2>
          </div>
          <button className="text-[11.5px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Save all for later</button>
        </div>
        <div className="px-7 pb-6 space-y-3">
          {items.map((c,i) => (
            <div key={i} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4 flex gap-4 items-start">
              <ProductCover p={c.p} h={88} />
              <div className="flex-1 min-w-0">
                <SellerTrustBadge trust={c.p.trust} />
                <h3 className="font-serif text-[15.5px] mt-1.5 leading-snug">{c.p.title}</h3>
                <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">{c.p.exam} · {c.p.lessonsLabel || c.p.pages}</div>
                <div className="mt-2 flex items-center gap-2">
                  <PriceBlock p={c.p} />
                </div>
                <div className="mt-2.5 text-[11px] text-[#33482F]">✓ {c.p.refundDays}d full refund · auto-Razorpay</div>
              </div>
              <div className="text-right shrink-0">
                <div className="num-mono text-[15px] font-semibold">₹{(c.p.price*c.qty).toLocaleString()}</div>
                <div className="num-mono text-[10.5px] text-[#6C5038] mt-1">qty {c.qty}</div>
                <div className="mt-2 flex flex-col gap-1">
                  <button className="text-[10.5px] px-2 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Save</button>
                  <button className="text-[10.5px] px-2 py-1 rounded-full border border-[#D9B4A6] text-[#7A3925] font-semibold">Remove</button>
                </div>
              </div>
            </div>
          ))}
          {items.length === 0 && <EmptyState icon="◌" title="Your cart is empty." body="Browse the marketplace for plan-relevant products." />}
        </div>
      </Card>

      <CheckoutSummary subtotal={subtotal} tax={tax} platformFee={platformFee} />
    </div>
  );
}

function CheckoutSummary({ subtotal, tax, platformFee }) {
  const total = subtotal;
  return (
    <Card className="sticky top-4">
      <Eyebrow>Order summary</Eyebrow>
      <h3 className="font-serif text-[20px] mt-1">Final price · no surprises.</h3>

      <ul className="mt-3 space-y-1.5 text-[13px]">
        <li className="flex justify-between"><span className="text-[#6C5038]">Subtotal</span><span className="num-mono">₹{subtotal.toLocaleString()}</span></li>
        <li className="flex justify-between"><span className="text-[#6C5038]">GST · included</span><span className="num-mono">₹{tax.toLocaleString()}</span></li>
        <li className="flex justify-between"><span className="text-[#6C5038]">Platform fee</span><span className="num-mono text-[#33482F]">₹0</span></li>
      </ul>
      <div className="rule mt-3 pt-3 flex justify-between items-baseline">
        <span className="text-[13px]">Total</span>
        <span className="font-serif text-[24px] num-mono">₹{total.toLocaleString()}</span>
      </div>

      <button className="mt-4 w-full px-4 py-3 rounded-full bg-[#2E2218] text-[#F3EADB] text-[14px] font-semibold">Pay with Razorpay →</button>
      <div className="num-mono text-[10.5px] text-[#6C5038] mt-2 text-center">UPI · Card · NetBanking · Wallets</div>

      <div className="rule mt-4 pt-3 text-[11px] text-[#33482F]">
        ✓ Refunds available per product (5–14 days)<br/>
        ✓ Access opens within 60 seconds of payment<br/>
        ✓ GST invoice emailed
      </div>
    </Card>
  );
}

function OrdersView() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Order history</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">All payments via Razorpay.</h2>
      </div>
      <div className="px-2">
        <table className="tbl">
          <thead><tr><th>When</th><th>Order ID</th><th>Product</th><th>Seller</th><th>Amount</th><th>Status</th><th className="right">Receipt</th></tr></thead>
          <tbody>
            {LIBRARY.map(o => {
              const p = PRODUCTS.find(x=>x.id===o.productId);
              const seller = SELLERS[p?.seller];
              return (
                <tr key={o.orderId}>
                  <td className="num-mono text-[#6C5038]">{o.purchasedAt}</td>
                  <td className="num-mono">{o.orderId}</td>
                  <td><strong>{p?.title}</strong></td>
                  <td>{seller?.name}</td>
                  <td className="num-mono">₹{o.price.toLocaleString()}</td>
                  <td><Pill tone="sage">paid</Pill></td>
                  <td className="right"><button className="text-[11px] text-[#6C5038] hover:text-[#2E2218] underline">Download invoice</button></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function SavedView() {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3">
        <Eyebrow>Saved for later</Eyebrow>
        <h2 className="font-serif text-[22px] mt-1">{RECENTLY_VIEWED.length} products you bookmarked.</h2>
      </div>
      <div className="grid grid-cols-3 gap-4 px-7 pb-6">
        {RECENTLY_VIEWED.map(id => {
          const p = PRODUCTS.find(x=>x.id===id);
          if (!p) return null;
          return (
            <article key={id} className="rounded-xl border border-[#E7DECB] bg-white/70 p-4">
              <SellerTrustBadge trust={p.trust} />
              <h3 className="font-serif text-[14.5px] mt-2 leading-snug line-clamp-2">{p.title}</h3>
              <PriceBlock p={p} />
              <div className="mt-3 flex gap-1.5">
                <button className="flex-1 text-[11px] px-2.5 py-1 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold">Move to cart</button>
                <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">Remove</button>
              </div>
            </article>
          );
        })}
      </div>
    </Card>
  );
}

window.ScreenLibrary = ScreenLibrary;
