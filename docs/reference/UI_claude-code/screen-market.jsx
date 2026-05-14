/* /app/marketplace — Browse + product detail */
const { useState: useStateM, useMemo: useMemoM } = React;

/* ─── Seller trust badge ────────────────────────────────────────────────── */
function SellerTrustBadge({ trust }) {
  const map = {
    "first-party":      { tone:"ink",  label:"Career Copilot · in-house" },
    "verified-topper":  { tone:"sage", label:"Verified Topper" },
    "verified-officer": { tone:"dusk", label:"Verified Officer" },
    "mentor":           { tone:"clay", label:"Mentor" },
    "institute":        { tone:"amber",label:"Verified institute" },
    "affiliate":        { tone:"outline", label:"Affiliate partner" },
    "community":        { tone:"outline", label:"Community seller" },
  };
  const m = map[trust] || map["community"];
  return <Pill tone={m.tone} className="!text-[9.5px]">{m.label}</Pill>;
}

/* ─── Price block ───────────────────────────────────────────────────────── */
function PriceBlock({ p, large }) {
  const off = p.originalPrice && p.originalPrice > p.price
    ? Math.round(((p.originalPrice - p.price) / p.originalPrice) * 100) : 0;
  return (
    <div className="flex items-baseline gap-2">
      <span className={`font-serif ${large ? 'text-[28px]' : 'text-[18px]'} text-[#2E2218]`}>
        {p.currency}{p.price.toLocaleString()}
      </span>
      {off > 0 && (
        <>
          <span className={`num-mono text-[#A68057] line-through ${large ? 'text-[14px]' : 'text-[11.5px]'}`}>{p.currency}{p.originalPrice.toLocaleString()}</span>
          <span className={`pill pill-sage ${large ? '' : '!text-[9.5px]'}`}>{off}% off</span>
        </>
      )}
    </div>
  );
}

/* ─── Product cover ─────────────────────────────────────────────────────── */
function ProductCover({ p, h = 96, small }) {
  const cat = MARKET_CATEGORIES.find(c => c.id === p.type);
  return (
    <div className="rounded-lg overflow-hidden relative shrink-0"
      style={{ height:h, width:h, background: p.coverHue || cat?.color || "#A68057" }}>
      <div className="absolute inset-0 grain"></div>
      <span className="absolute top-1.5 left-1.5 num-mono text-[9px] tracking-[0.18em] uppercase" style={{color: "rgba(243,234,219,0.85)"}}>{cat?.label || p.type}</span>
      <span className="absolute bottom-1.5 left-1.5 text-[#F3EADB]" style={{ fontSize: small ? 24 : 34, lineHeight:1 }}>{cat?.icon || "·"}</span>
      {p.affiliate && <span className="absolute top-1.5 right-1.5 stamp" style={{background:"#FBF6EF", color:"#6C5038", fontSize:8.5}}>AFF</span>}
    </div>
  );
}

function ScreenMarketplace() {
  const [openProductId, setOpenProductId] = useStateM(null);
  const [activeCat, setActiveCat] = useStateM("all");
  const [activeExam, setActiveExam] = useStateM("UPSC CSE");
  const [sort, setSort] = useStateM("relevance");

  const product = openProductId ? PRODUCTS.find(p => p.id === openProductId) : null;

  const filtered = PRODUCTS.filter(p => {
    if (activeCat !== "all" && p.type !== activeCat) return false;
    if (activeExam !== "all" && p.exam !== activeExam && p.exam !== "Generic") return false;
    return true;
  });

  const planRecs = PRODUCTS.filter(p => p.planRelevant);

  return (
    <div data-screen-label="Marketplace · Browse">
      <PageHeader eyebrow="Marketplace · Phase 11"
        title="Curated commerce, the same trust rules as the rest of Study OS."
        sub="Mock tests, courses, notes, mentor programs, books, coaching partners. First-party + verified third-party. Refund windows on every product. Affiliate disclosure is mandatory."
        right={
          <div className="flex gap-2 items-center">
            <a href="#mylib"     className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap">My library · {LIBRARY.length}</a>
            <a href="#cart"      className="text-[12px] px-3 py-1.5 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold whitespace-nowrap flex items-center gap-1.5">
              <svg width="13" height="13" viewBox="0 0 16 16" fill="none"><path d="M2 3h2l1.5 8.5h7l1.5-6h-9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/><circle cx="6.5" cy="14" r="1" fill="currentColor"/><circle cx="12" cy="14" r="1" fill="currentColor"/></svg>
              Cart · {CART.length}
            </a>
            <a href="#sellerdash" className="text-[12px] px-3 py-1.5 rounded-full bg-[#2E2218] text-[#F3EADB] font-semibold whitespace-nowrap">Sell on CCP</a>
          </div>
        } />

      <div className="px-10 space-y-6">
        <TrustLegendStrip />
        <PlanRecRail products={planRecs} onOpen={setOpenProductId} />
        <CategoriesGrid active={activeCat} onPick={setActiveCat} />
        <FeaturedRow products={filtered.slice(0,3)} onOpen={setOpenProductId} />

        <Card padded={false}>
          <div className="px-7 pt-6 pb-3 flex items-end justify-between gap-3 flex-wrap">
            <div>
              <Eyebrow>All products</Eyebrow>
              <h2 className="font-serif text-[22px] mt-1">{filtered.length} matching · {activeExam} · {activeCat === 'all' ? 'all categories' : MARKET_CATEGORIES.find(c=>c.id===activeCat)?.label}</h2>
            </div>
            <div className="flex gap-2 items-center flex-wrap">
              <ExamPicker active={activeExam} onPick={setActiveExam} />
              <SortPicker value={sort} onChange={setSort} />
            </div>
          </div>
          <div className="hairline mx-7"></div>
          <div className="grid grid-cols-3 gap-4 px-7 py-6">
            {filtered.map(p => <ProductCard key={p.id} p={p} onOpen={()=>setOpenProductId(p.id)} />)}
            {filtered.length === 0 && <EmptyState icon="◌" title="No products match these filters." body="Loosen filters or browse a different exam." />}
          </div>
        </Card>

        <RefundPolicyCard />
        <BecomeSellerCTA />
      </div>

      {product && <ProductDetailDrawer product={product} onClose={()=>setOpenProductId(null)} />}

      <FooterStrip />
    </div>
  );
}

function TrustLegendStrip() {
  return (
    <div className="rounded-2xl border border-[#E7DECB] bg-[#FBF8F2] px-5 py-3.5 flex items-center gap-4 flex-wrap">
      <div className="eyebrow">Trust ladder</div>
      <SellerTrustBadge trust="first-party" />
      <SellerTrustBadge trust="verified-topper" />
      <SellerTrustBadge trust="verified-officer" />
      <SellerTrustBadge trust="mentor" />
      <SellerTrustBadge trust="institute" />
      <SellerTrustBadge trust="affiliate" />
      <div className="ml-auto text-[11px] text-[#6C5038]">Refund on every product · affiliate cuts disclosed · no upsells.</div>
    </div>
  );
}

function PlanRecRail({ products, onOpen }) {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-start gap-5">
        <div className="shrink-0">
          <div className="w-12 h-12 rounded-2xl bg-[#4E3A29] border border-[#6C5038] flex items-center justify-center">
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none"><path d="M4 12h11l-4-4m4 4-4 4" stroke="#F3EADB" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/></svg>
          </div>
        </div>
        <div className="flex-1 min-w-0">
          <Eyebrow tone="dark">For your plan · {DATA.user.exam} · {DATA.user.phase}</Eyebrow>
          <h2 className="font-serif text-[22px] text-[#F3EADB] mt-1 leading-tight">3 things the engine actually thinks would help you.</h2>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[64ch]">Recommendations are computed from your weak topics, phase, and study cadence. You'll see exactly which signal each product matched.</p>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-3 mt-4">
        {products.slice(0,3).map(p => (
          <button key={p.id} onClick={()=>onOpen(p.id)} className="text-left rounded-xl bg-[#4E3A29]/40 border border-[#6C5038] p-3.5 hover:bg-[#4E3A29]/70 transition">
            <div className="flex items-center gap-2"><SellerTrustBadge trust={p.trust} /></div>
            <h3 className="font-serif text-[15px] text-[#F3EADB] mt-2 leading-snug">{p.title}</h3>
            <div className="num-mono text-[10.5px] text-[#D6BC93] mt-2 flex items-center gap-1.5">
              <span style={{color:"#94B28A"}}>◐</span>
              <span>matches: {p.planRelevant.matches}</span>
            </div>
            <div className="rule mt-3 pt-2.5 flex items-center justify-between text-[#D6BC93] border-[#6C5038]">
              <span className="num-mono text-[11px]">{p.currency}{p.price.toLocaleString()}</span>
              <span className="text-[11px] underline">View →</span>
            </div>
          </button>
        ))}
      </div>
    </Card>
  );
}

function CategoriesGrid({ active, onPick }) {
  return (
    <div className="grid grid-cols-6 gap-3">
      <button onClick={()=>onPick("all")}
        className={`rounded-xl p-3.5 border text-left transition ${active==='all' ? 'bg-[#2E2218] border-[#2E2218]' : 'bg-white/70 border-[#E7DECB] hover:border-[#A68057]'}`}>
        <div className={`text-[20px] ${active==='all' ? 'text-[#D6BC93]' : 'text-[#A68057]'}`}>✦</div>
        <div className={`font-serif text-[15px] mt-2 ${active==='all' ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>All</div>
        <div className={`num-mono text-[10.5px] mt-0.5 ${active==='all' ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>{PRODUCTS.length} products</div>
      </button>
      {MARKET_CATEGORIES.map(c => (
        <button key={c.id} onClick={()=>onPick(c.id)}
          className={`rounded-xl p-3.5 border text-left transition ${active===c.id ? 'bg-[#2E2218] border-[#2E2218]' : 'bg-white/70 border-[#E7DECB] hover:border-[#A68057]'}`}>
          <div className="text-[20px]" style={{color: active===c.id ? "#D6BC93" : c.color}}>{c.icon}</div>
          <div className={`font-serif text-[15px] mt-2 ${active===c.id ? 'text-[#F3EADB]' : 'text-[#2E2218]'}`}>{c.label}</div>
          <div className={`num-mono text-[10.5px] mt-0.5 ${active===c.id ? 'text-[#D6BC93]' : 'text-[#6C5038]'}`}>{c.count} products</div>
        </button>
      ))}
    </div>
  );
}

function FeaturedRow({ products, onOpen }) {
  return (
    <Card padded={false}>
      <div className="px-7 pt-6 pb-3 flex items-end justify-between">
        <div>
          <Eyebrow>Editor's picks · this week</Eyebrow>
          <h2 className="font-serif text-[22px] mt-1">Curated by the team, not the algorithm.</h2>
        </div>
        <div className="num-mono text-[10.5px] text-[#6C5038]">3 of 18 picks · rotates weekly</div>
      </div>
      <div className="grid grid-cols-3 gap-4 px-7 pb-6">
        {products.map(p => (
          <article key={p.id} onClick={()=>onOpen(p.id)}
            className="rounded-xl border border-[#E7DECB] bg-white/80 hover:bg-white hover:border-[#A68057] transition cursor-pointer overflow-hidden flex flex-col">
            <div className="h-[120px] relative" style={{background: p.coverHue}}>
              <div className="absolute inset-0 grain"></div>
              <div className="absolute top-3 left-3 num-mono text-[10px] tracking-[0.16em] uppercase text-[#F3EADB] opacity-90">
                {MARKET_CATEGORIES.find(c=>c.id===p.type)?.label}
              </div>
              <div className="absolute bottom-3 left-3 right-3 flex items-end justify-between">
                <span className="text-[40px] text-[#F3EADB]" style={{lineHeight:1, opacity:0.9}}>
                  {MARKET_CATEGORIES.find(c=>c.id===p.type)?.icon}
                </span>
                {p.planRelevant && <Pill tone="sage" className="!text-[9.5px]">◐ For your plan</Pill>}
              </div>
            </div>
            <div className="p-4 flex-1 flex flex-col">
              <div className="flex flex-wrap gap-1.5">
                <SellerTrustBadge trust={p.trust} />
              </div>
              <h3 className="font-serif text-[16px] mt-2 leading-snug">{p.title}</h3>
              <p className="text-[12px] text-[#6C5038] mt-1.5 line-clamp-2">{p.blurb}</p>
              <div className="mt-auto pt-3 flex items-center justify-between border-t border-[#E7DECB] mt-3">
                <PriceBlock p={p} />
                <div className="text-[10.5px] text-[#6C5038] num-mono">★ {p.rating} · {p.reviews}</div>
              </div>
            </div>
          </article>
        ))}
      </div>
    </Card>
  );
}

function ExamPicker({ active, onPick }) {
  const exams = ["UPSC CSE","SSC CGL","IBPS PO","RBI Grade B","all"];
  return (
    <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
      {exams.map(e => (
        <button key={e} onClick={()=>onPick(e)} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${active === e ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>{e === 'all' ? 'All exams' : e}</button>
      ))}
    </div>
  );
}

function SortPicker({ value, onChange }) {
  const sorts = [
    { v:"relevance", label:"Relevance" },
    { v:"plan",      label:"For your plan" },
    { v:"top",       label:"Top rated" },
    { v:"new",       label:"New" },
    { v:"low",       label:"Price low" },
  ];
  return (
    <div className="flex gap-1 bg-[#F3EADB] p-1 rounded-full border border-[#E7DECB]">
      {sorts.map(s => (
        <button key={s.v} onClick={()=>onChange(s.v)} className={`text-[11px] px-2.5 py-1 rounded-full font-semibold ${value === s.v ? 'bg-[#2E2218] text-[#F3EADB]' : 'text-[#6C5038]'}`}>{s.label}</button>
      ))}
    </div>
  );
}

function ProductCard({ p, onOpen }) {
  const seller = SELLERS[p.seller];
  return (
    <article onClick={onOpen}
      className="rounded-xl border border-[#E7DECB] bg-white/70 hover:bg-white hover:border-[#A68057] transition cursor-pointer overflow-hidden">
      <div className="flex">
        <ProductCover p={p} h={104} />
        <div className="px-4 py-3 flex-1 min-w-0 flex flex-col">
          <div className="flex flex-wrap gap-1.5">
            <SellerTrustBadge trust={p.trust} />
            {p.planRelevant && <Pill tone="sage" className="!text-[9.5px]">◐ Plan match</Pill>}
            {p.affiliate && <Pill tone="amber" className="!text-[9.5px]">Affiliate · 18%</Pill>}
          </div>
          <h3 className="font-serif text-[14.5px] mt-1.5 leading-snug line-clamp-2">{p.title}</h3>
          <div className="num-mono text-[10.5px] text-[#6C5038] mt-auto">
            <span>{p.exam}</span>
            {p.lessonsLabel && <> · <span>{p.lessonsLabel}</span></>}
            {p.pages && <> · <span>{p.pages}</span></>}
          </div>
        </div>
      </div>
      <div className="px-4 py-3 border-t border-[#E7DECB] flex items-center justify-between">
        <PriceBlock p={p} />
        <div className="text-right text-[10.5px] text-[#6C5038]">
          <div className="num-mono">★ {p.rating} · {p.reviews}</div>
          <div className="text-[#33482F] mt-0.5">{p.refundDays}d refund</div>
        </div>
      </div>
    </article>
  );
}

function ProductDetailDrawer({ product, onClose }) {
  const seller = SELLERS[product.seller];
  const cat = MARKET_CATEGORIES.find(c => c.id === product.type);
  return (
    <Drawer open={true} onClose={onClose} title="" width={680}>
      {/* Cover */}
      <div className="rounded-xl overflow-hidden relative -mt-2 mb-4" style={{ height:160, background:product.coverHue }}>
        <div className="absolute inset-0 grain"></div>
        <div className="absolute top-4 left-4 right-4 flex items-start justify-between">
          <div className="num-mono text-[10.5px] tracking-[0.16em] uppercase text-[#F3EADB] opacity-90">{cat?.label}</div>
          {product.planRelevant && <Pill tone="sage" className="!text-[10px]">◐ Plan match</Pill>}
        </div>
        <div className="absolute bottom-4 left-4 text-[#F3EADB]" style={{fontSize:54, lineHeight:1, opacity:0.9}}>{cat?.icon}</div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        <SellerTrustBadge trust={product.trust} />
        {product.affiliate && <Pill tone="amber">Affiliate · 18% to CCP</Pill>}
        {product.tags?.map((t,i) => <Pill key={i} tone="outline" className="!text-[9.5px]">{t}</Pill>)}
      </div>

      <h2 className="font-serif text-[24px] mt-2.5 leading-tight">{product.title}</h2>
      <p className="text-[13px] text-[#3a2e22] mt-2">{product.longDesc || product.blurb}</p>

      <div className="mt-3 flex items-center gap-3">
        <Avatar user={{name:seller.name, avatarColor:seller.avatarColor}} size={32} />
        <div className="flex-1 min-w-0">
          <div className="text-[13px] font-medium">{seller.name}</div>
          <div className="num-mono text-[10.5px] text-[#6C5038]">{seller.badge}</div>
        </div>
        <button className="text-[11px] px-2.5 py-1 rounded-full border border-[#E7DECB] text-[#6C5038] font-semibold">View seller</button>
      </div>

      {/* Price + buy */}
      <div className="mt-5 rounded-xl border border-[#2E2218] bg-[#FBF6EF] p-4">
        <div className="flex items-end justify-between">
          <PriceBlock p={product} large />
          <div className="text-right text-[11px] text-[#6C5038]">
            <div className="num-mono">★ {product.rating} · {product.reviews} reviews</div>
            <div className="num-mono mt-0.5">{product.students.toLocaleString()} students</div>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button className="flex-1 px-4 py-2.5 rounded-full bg-[#2E2218] text-[#F3EADB] text-[13px] font-semibold">Buy now</button>
          <button className="px-4 py-2.5 rounded-full border border-[#E7DECB] text-[#6C5038] text-[13px] font-semibold">Add to cart</button>
          {product.hasPreview && <button className="px-4 py-2.5 rounded-full border border-[#94B28A] text-[#33482F] text-[13px] font-semibold whitespace-nowrap">{product.previewLabel}</button>}
        </div>
        <div className="mt-3 grid grid-cols-3 gap-2 text-[11px] text-[#6C5038]">
          <Fact k="Access" v={product.duration} />
          <Fact k="Refund" v={`${product.refundDays}d full refund`} tone="sage" />
          <Fact k="Payment" v="Razorpay · UPI / card" />
        </div>
        {product.seatsLeft != null && (
          <div className="mt-3 num-mono text-[11px] text-[#7A3925]">Only {product.seatsLeft} of {product.seatsTotal} seats left</div>
        )}
      </div>

      {/* What you'll get */}
      <div className="mt-5">
        <Eyebrow>What's included</Eyebrow>
        <ul className="mt-2 space-y-1.5 text-[13px]">
          {product.learnPoints.map((p,i) => (
            <li key={i} className="flex items-start gap-2">
              <span className="text-[#33482F] mt-0.5">✓</span><span>{p}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Plan-relevance reasoning */}
      {product.planRelevant && (
        <div className="mt-5 rounded-xl bg-[#F0F5EF] border border-[#B9CFAF] p-4">
          <Eyebrow>Why the engine surfaces this</Eyebrow>
          <ul className="mt-2 space-y-1 text-[12.5px] text-[#33482F]">
            <li className="flex gap-2"><Chip s={{layer:"user",  label:"weak: polity"}} /><span>Matches your weak topic surfaced from Mock 13</span></li>
            <li className="flex gap-2"><Chip s={{layer:"engine",label:"phase:prelims"}} /><span>Your current phase has 108d to D-day</span></li>
            <li className="flex gap-2"><Chip s={{layer:"exam",  label:"locked"}} /><span>Topic carries an admin-locked high-yield tag</span></li>
          </ul>
        </div>
      )}

      {/* Curriculum */}
      {product.curriculum && product.curriculum.length > 0 && (
        <div className="mt-5">
          <Eyebrow>Curriculum · {product.lessonsLabel || `${product.lessons} lessons`}</Eyebrow>
          <div className="mt-2 space-y-2">
            {product.curriculum.map((s,i) => (
              <details key={i} className="rounded-lg border border-[#E7DECB] bg-[#FBF8F2]">
                <summary className="px-3.5 py-2.5 flex items-center justify-between cursor-pointer">
                  <span className="font-medium text-[13px]">{s.sec}</span>
                  <span className="num-mono text-[10.5px] text-[#6C5038]">{s.items.length} items</span>
                </summary>
                <ul className="px-3.5 pb-3 pt-1 space-y-1 text-[12.5px] text-[#3a2e22] border-t border-[#E7DECB]">
                  {s.items.map((it,j) => <li key={j}>· {it}</li>)}
                </ul>
              </details>
            ))}
          </div>
        </div>
      )}

      {/* Refund policy */}
      <div className="mt-5 rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
        <Eyebrow>Refund policy</Eyebrow>
        <p className="text-[12.5px] text-[#3a2e22] mt-1.5">
          <strong>{product.refundDays}-day full refund.</strong> If you bought this and haven't engaged with more than 25% of the material, you can request a full refund — no questions asked. Refunds via Razorpay take 5–7 business days.
        </p>
        {product.affiliate && (
          <p className="text-[12.5px] text-[#3a2e22] mt-2"><strong>Affiliate disclosure.</strong> Career Copilot earns 18% of your purchase. We surface this product because our engine matched it to your weak topic — not because of the affiliate cut.</p>
        )}
      </div>

      {/* Reviews snippet */}
      <div className="mt-5">
        <Eyebrow>Top reviews · {product.reviews}</Eyebrow>
        <ul className="mt-2 space-y-3">
          {[
            { stars:5, body:"Best I've used. Auto-feeding into the Study OS was the killer feature.", who:"Anjali D.", t:"2d" },
            { stars:5, body:"Solid material. Mocks felt like the real paper.", who:"Vikram K.", t:"5d" },
            { stars:4, body:"Quant section is sparser than I expected. Otherwise great.", who:"Pooja I.", t:"1w" },
          ].map((r,i) => (
            <li key={i} className="rounded-lg border border-[#E7DECB] bg-white/70 p-3">
              <div className="flex items-center justify-between">
                <div className="text-[#54794E] num-mono text-[11.5px]">{"★".repeat(r.stars)}{"☆".repeat(5-r.stars)}</div>
                <div className="num-mono text-[10.5px] text-[#6C5038]">{r.who} · {r.t}</div>
              </div>
              <div className="text-[12.5px] text-[#3a2e22] mt-1.5">{r.body}</div>
            </li>
          ))}
        </ul>
      </div>
    </Drawer>
  );
}

function Fact({ k, v, tone }) {
  return (
    <div className="rounded-md border border-[#E7DECB] bg-white/60 p-2">
      <div className="eyebrow !text-[9px]">{k}</div>
      <div className={`text-[11.5px] mt-0.5 ${tone === 'sage' ? 'text-[#33482F] font-semibold' : 'text-[#2E2218]'}`}>{v}</div>
    </div>
  );
}

function RefundPolicyCard() {
  return (
    <Card>
      <SectionHeader eyebrow="The rules · stated plainly"
        title="What you'll never see on Career Copilot."
        sub="The marketplace exists to fund the platform. It does not exist to manipulate you." />
      <div className="grid grid-cols-4 gap-3">
        {[
          { k:"01", t:"No surprise upsells",     b:"Final price shown before checkout. The price you see is the price you pay." },
          { k:"02", t:"Refunds on every product", b:"5–14 days, depending on type. Refunds go through Razorpay automatically." },
          { k:"03", t:"Affiliate cuts disclosed", b:"If we earn an affiliate cut, it's shown on the product card and detail." },
          { k:"04", t:"No fake scarcity",         b:"Seat counts on mentor programs are real. Timers we don't do." },
        ].map((r,i) => (
          <div key={i} className="rounded-xl border border-[#E7DECB] bg-[#FBF8F2] p-4">
            <div className="num-mono text-[11px] text-[#A68057]">{r.k}</div>
            <div className="font-serif text-[15px] mt-1.5">{r.t}</div>
            <div className="text-[12px] text-[#6C5038] mt-1.5 leading-snug">{r.b}</div>
          </div>
        ))}
      </div>
    </Card>
  );
}

function BecomeSellerCTA() {
  return (
    <Card className="!bg-[#2E2218] !border-[#2E2218]">
      <div className="flex items-center gap-4">
        <div className="flex-1">
          <Eyebrow tone="dark">Sell on Career Copilot</Eyebrow>
          <h3 className="font-serif text-[22px] mt-1 text-[#F3EADB] leading-tight">Verified Toppers · Officers · Mentors · Institutes — apply once, list many products.</h3>
          <p className="text-[12.5px] text-[#D6BC93] mt-1.5 max-w-[68ch]">Platform fee 20% on first-party hosted products, 18% affiliate on partner products. Razorpay payouts every 4 weeks. Refunds are admin-policed.</p>
        </div>
        <div className="flex flex-col gap-2 shrink-0">
          <a href="#sellerdash" className="px-4 py-2 rounded-full bg-[#F3EADB] text-[#2E2218] text-[12.5px] font-semibold whitespace-nowrap">Open seller dashboard →</a>
          <button className="px-4 py-2 rounded-full border border-[#6C5038] text-[#D6BC93] text-[12.5px] font-semibold whitespace-nowrap">Apply to sell</button>
        </div>
      </div>
    </Card>
  );
}

window.ScreenMarketplace = ScreenMarketplace;
window.SellerTrustBadge = SellerTrustBadge;
window.PriceBlock = PriceBlock;
window.ProductCover = ProductCover;
