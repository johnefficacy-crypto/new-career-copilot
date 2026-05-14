/* Marketplace data — products, sellers, orders, payouts */

const SELLERS = {
  s_kavya:    { id:"s_kavya",    name:"Kavya Iyer",            kind:"topper",     badge:"AIR 42 · CSE 2024",      avatarColor:"#54794E", rating:4.8, products:6,  payoutShare:0.80 },
  s_arjun:    { id:"s_arjun",    name:"Arjun S.",              kind:"officer",    badge:"IPS · 2023 batch",        avatarColor:"#524864", rating:4.9, products:3,  payoutShare:0.80 },
  s_isha:     { id:"s_isha",     name:"Isha Trivedi",          kind:"topper",     badge:"AIR 8 · CSE 2022",        avatarColor:"#94B28A", rating:4.7, products:4,  payoutShare:0.80 },
  s_neha:     { id:"s_neha",     name:"Neha Verma",            kind:"mentor",     badge:"CCP Mentor · 2024",        avatarColor:"#8A6846", rating:4.6, products:5,  payoutShare:0.75 },
  s_ccp:      { id:"s_ccp",      name:"Career Copilot Studio", kind:"first-party",badge:"In-house · admin-curated", avatarColor:"#2E2218", rating:4.9, products:8,  payoutShare:1.00 },
  s_kalam:    { id:"s_kalam",    name:"Kalam Academy",         kind:"institute",  badge:"Verified institute",       avatarColor:"#A68057", rating:4.4, products:14, payoutShare:0.70, instituteSince:"2018" },
  s_vajiram:  { id:"s_vajiram",  name:"VajiramPrep",           kind:"affiliate",  badge:"Affiliate partner",        avatarColor:"#BE9C6B", rating:4.3, products:9,  payoutShare:0.00, affiliateCut:0.18 },
};

const MARKET_CATEGORIES = [
  { id:"test_series",  label:"Test series",   icon:"◎", count:42,  color:"#54794E" },
  { id:"course",       label:"Courses",       icon:"⊞", count:38,  color:"#A68057" },
  { id:"notes_pack",   label:"Notes & PYQ",   icon:"≣", count:64,  color:"#524864" },
  { id:"mentor_program",label:"Mentor programs", icon:"◊", count:18, color:"#8A6846" },
  { id:"coaching",     label:"Coaching",      icon:"❒", count:7,   color:"#94B28A" },
  { id:"book",         label:"Books",         icon:"❒", count:24,  color:"#6C5038" },
];

const PRODUCTS = [
  {
    id:"p1", type:"test_series", title:"UPSC CSE Prelims 2026 · 30 Full-length Mocks + 4 GS PT",
    blurb:"30 Prelims-grade mocks with auto-evaluation, percentile, and Study-OS error tagging.",
    longDesc:"Built on our 6-year question bank, scaled to UPSC 2026 expected difficulty. Each mock auto-feeds into your Study OS error patterns so weak-area drills are generated for you. Includes 4 dedicated GS-PT mocks and 2 free Mains essay mocks.",
    exam:"UPSC CSE", phase:"Prelims", subjects:["GS","CSAT"],
    seller:"s_ccp", trust:"first-party",
    price:1499, originalPrice:1999, currency:"₹",
    rating:4.8, reviews:2104, students:8420,
    duration:"Until Aug 30, 2026", lessons:30, lessonsLabel:"30 mocks", pages:null,
    refundDays:7, hasPreview:true, previewLabel:"Mock 0 · free trial",
    planRelevant:{ matches:"Mock cadence + auto error-tagging", reason:"Engine-recommended" },
    coverHue:"#33482F",
    learnPoints:[
      "30 Prelims FL mocks (each 100 Qs · 2h)",
      "Auto error-pattern extraction → feeds /app/study/mocks",
      "Section-wise percentile band",
      "Solutions video for every mock + downloadable PDF",
    ],
    curriculum:[
      { sec:"Section A · Baseline", items:["Mock 1 — Polity heavy","Mock 2 — History heavy","Mock 3 — Economy heavy"] },
      { sec:"Section B · Sectional GS-PT", items:["GS-PT 1","GS-PT 2","GS-PT 3","GS-PT 4"] },
      { sec:"Section C · Full-length grind", items:["Mocks 4–30 · weekly cadence"] },
    ],
    tags:["High volume","Auto-feeds Study OS","Refund 7d"],
  },
  {
    id:"p2", type:"course", title:"Federalism, end-to-end · 6-week structured course",
    blurb:"From Article 263 to Centre-State commissions — taught in 24 lessons by AIR 42.",
    longDesc:"For aspirants who have read Laxmikanth once but can't connect federalism across themes. 24 video lessons, 18 PYQ walkthroughs, and one mock review at the end. Live Q&A every Sunday for cohort members.",
    exam:"UPSC CSE", phase:"Prelims+Mains", subjects:["Polity"],
    seller:"s_kavya", trust:"verified-topper",
    price:2499, originalPrice:3499, currency:"₹",
    rating:4.9, reviews:412, students:1240,
    duration:"6 weeks · ~30h", lessons:24, lessonsLabel:"24 video lessons", pages:null,
    refundDays:14, hasPreview:true, previewLabel:"Lesson 0 · free",
    planRelevant:{ matches:"Polity · Federalism", reason:"Your weak topic" },
    coverHue:"#54794E",
    learnPoints:[
      "Centre–State financial relations end-to-end",
      "All Article 263 / NITI Aayog questions from PYQ",
      "Emergency provisions — 7 PYQ walkthroughs",
      "Live Q&A every Sunday with AIR 42",
    ],
    curriculum:[
      { sec:"Week 1 · Foundations", items:["Article 1–4","Article 263","Indian federalism vs others"] },
      { sec:"Week 2 · Centre–State", items:["Legislative · Union & State lists","Administrative","Financial"] },
      { sec:"Week 3 · Emergency provisions", items:["Article 352","Article 356","Article 360"] },
      { sec:"Week 4 · NITI · Finance Comm", items:["NITI Aayog","Finance Commission","GST Council"] },
      { sec:"Week 5 · PYQ walk-through", items:["2018 Q41","2019 Q24","2021 Q22","2022 Q41"] },
      { sec:"Week 6 · Mock review", items:["Open Q&A","Closing mock"] },
    ],
    tags:["Plan-recommended","Verified Topper","Live Q&A"],
  },
  {
    id:"p3", type:"notes_pack", title:"Polity Notes · 280-page bundle (handwritten + typed)",
    blurb:"Topic-mapped, PYQ-tagged, last-revised April 2026.",
    longDesc:"Two-format bundle: scanned handwritten notes for tactile readers + typed PDF for searching. Every section starts with its PYQ frequency block and ends with a 5-minute revision card.",
    exam:"UPSC CSE", phase:"Prelims+Mains", subjects:["Polity"],
    seller:"s_isha", trust:"verified-topper",
    price:399, originalPrice:599, currency:"₹",
    rating:4.7, reviews:618, students:2208,
    duration:"Lifetime access", lessons:null, lessonsLabel:null, pages:"280 pages · 38 MB",
    refundDays:5, hasPreview:true, previewLabel:"30-page sample",
    coverHue:"#41603D",
    learnPoints:[
      "Both handwritten + typed for the same content",
      "Every section: PYQ frequency block + revision card",
      "Topic-mapped to canonical syllabus tree",
    ],
    curriculum:[],
    tags:["PYQ-tagged","Lifetime access"],
  },
  {
    id:"p4", type:"mentor_program", title:"108-day Prelims sprint · 1:1 with AIR 8",
    blurb:"12-week structured 1:1 mentorship. 1 call/week + async on Telegram. Cap 6 aspirants.",
    longDesc:"For aspirants in their final 108 days who want a structured weekly review + one curated focus block per week. Includes mock-review walkthroughs after every fortnightly mock.",
    exam:"UPSC CSE", phase:"Prelims", subjects:["GS","CSAT"],
    seller:"s_isha", trust:"verified-topper",
    price:24999, originalPrice:34999, currency:"₹",
    rating:4.9, reviews:38, students:46,
    duration:"12 weeks", lessons:12, lessonsLabel:"12 weekly 1:1 calls", pages:null,
    refundDays:14, hasPreview:false,
    planRelevant:{ matches:"108-day Prelims phase · 1:1", reason:"Aligned with your phase" },
    coverHue:"#2E2218",
    learnPoints:[
      "12 weekly 60-min 1:1 calls (Daily.co)",
      "Async on Telegram (24h response)",
      "Mock review walkthrough after every fortnight",
      "Cap 6 aspirants per cohort",
    ],
    curriculum:[],
    tags:["Verified Topper","Limited seats","Refund 14d"],
    seatsLeft:2, seatsTotal:6,
  },
  {
    id:"p5", type:"course", title:"Mains GS-2 answer-writing · scoring patterns from CSE 2022–24",
    blurb:"What actually fetched 130+ in CSE 2022–24, taught by a serving officer.",
    longDesc:"This is not a 'how to write answers' course. It's an unsparing walkthrough of what scored, what didn't, and why — using anonymized real CSE 2022–24 answer sheets and DOPT-released marks.",
    exam:"UPSC CSE", phase:"Mains", subjects:["GS-2"],
    seller:"s_arjun", trust:"verified-officer",
    price:3499, originalPrice:4999, currency:"₹",
    rating:4.8, reviews:184, students:520,
    duration:"4 weeks · ~20h", lessons:16, lessonsLabel:"16 walkthroughs", pages:null,
    refundDays:14, hasPreview:true, previewLabel:"Lesson 1 · free",
    coverHue:"#524864",
    learnPoints:[
      "What 130+ scripts actually looked like (anonymized)",
      "Common 100-mark patterns to avoid",
      "Verified DOPT marks correlation",
      "Live mock-script review session",
    ],
    curriculum:[],
    tags:["Verified Officer","Mains-focused"],
  },
  {
    id:"p6", type:"test_series", title:"SSC CGL Tier 1 · 25 Mocks + Quant Speed pack",
    blurb:"25 Tier-1 mocks, 12 quant speed drills, real percentile bands.",
    longDesc:"For SSC CGL 2026. Built around the new question pattern post-2024 reform. Quant Speed pack includes 12 drills of 50 Qs in 25 min each.",
    exam:"SSC CGL", phase:"Tier 1", subjects:["Quant","English","Reasoning","GS"],
    seller:"s_ccp", trust:"first-party",
    price:799, originalPrice:1199, currency:"₹",
    rating:4.6, reviews:912, students:3140,
    duration:"Until exam", lessons:37, lessonsLabel:"25 mocks + 12 drills", pages:null,
    refundDays:7, hasPreview:true, previewLabel:"Mock 0 · free",
    coverHue:"#A68057",
    learnPoints:[
      "25 full Tier 1 mocks · new pattern",
      "12 quant-speed drills · 50 Qs / 25 min",
      "Auto-feeds Study OS error tagging",
    ],
    curriculum:[],
    tags:["Auto-feeds Study OS","Refund 7d"],
  },
  {
    id:"p7", type:"notes_pack", title:"PYQ archive · UPSC CSE Prelims · 1995–2024",
    blurb:"All PYQs, indexed by topic, with answer keys and verification notes.",
    longDesc:"30 years of UPSC Prelims questions, topic-mapped and PYQ-tagged. Every answer key is admin-verified or flagged when contested. Lifetime access; updated yearly.",
    exam:"UPSC CSE", phase:"Prelims", subjects:["All"],
    seller:"s_ccp", trust:"first-party",
    price:299, originalPrice:499, currency:"₹",
    rating:4.9, reviews:3208, students:14080,
    duration:"Lifetime + yearly updates", lessons:null, lessonsLabel:null, pages:"1240 pages",
    refundDays:5, hasPreview:true, previewLabel:"2020–24 sample",
    coverHue:"#2E2218",
    learnPoints:[
      "Every Prelims PYQ since 1995",
      "Topic-mapped to canonical syllabus tree",
      "Answer keys: admin-verified or flagged",
      "Yearly updates after every Prelims",
    ],
    curriculum:[],
    tags:["Source-of-truth","Lifetime"],
  },
  {
    id:"p8", type:"coaching", title:"Kalam Academy · UPSC CSE Foundation 2027 (1 yr)",
    blurb:"Full-year online foundation course — affiliate partner. We get 18% if you enrol.",
    longDesc:"Year-long structured foundation for aspirants starting 2027 cycle. Hyderabad-based, online. Career Copilot is an affiliate — we earn 18% on enrolment, which is disclosed here. Refunds run via Kalam Academy's own 30-day policy.",
    exam:"UPSC CSE", phase:"Foundation", subjects:["All"],
    seller:"s_kalam", trust:"institute", affiliate:true,
    price:65000, originalPrice:89000, currency:"₹",
    rating:4.4, reviews:1024, students:8200,
    duration:"12 months", lessons:280, lessonsLabel:"280+ live lessons", pages:null,
    refundDays:30, hasPreview:true, previewLabel:"7-day trial via Kalam",
    coverHue:"#6C5038",
    learnPoints:[
      "Live + recorded lessons across all GS papers",
      "Bi-weekly mocks + answer review",
      "Daily current-affairs digest",
      "Affiliate · 30d refund via Kalam Academy",
    ],
    curriculum:[],
    tags:["Affiliate · 18% disclosed","Institute","Refund 30d"],
  },
  {
    id:"p9", type:"course", title:"Daily compiler · how to run a 6h/day plan without burnout",
    blurb:"From 14 months of optimization. Mentor-led. Calm, structured, repeatable.",
    longDesc:"Not a strategy course — a daily-operations course. How to actually run a 6-hour study day every day for 6 months without losing the thread.",
    exam:"Generic", phase:"Any", subjects:["Meta"],
    seller:"s_neha", trust:"mentor",
    price:899, originalPrice:1499, currency:"₹",
    rating:4.7, reviews:240, students:610,
    duration:"3 weeks · ~9h", lessons:12, lessonsLabel:"12 lessons", pages:null,
    refundDays:7, hasPreview:true, previewLabel:"Lesson 0 · free",
    coverHue:"#8A6846",
    learnPoints:[
      "How to build a daily compiler that survives bad days",
      "Notion + Study OS integration template",
      "Recovery protocols after a missed week",
    ],
    curriculum:[],
    tags:["Mentor-led","Cross-exam"],
  },
];

/* User's library — purchased products */
const LIBRARY = [
  { productId:"p7", purchasedAt:"Mar 11, 2026", orderId:"ORD-2026-03-0042", price:299, status:"active",   progress:1.00, accessUntil:"Lifetime",        lastUsedAt:"Today" },
  { productId:"p2", purchasedAt:"Mar 14, 2026", orderId:"ORD-2026-03-0118", price:2499,status:"active",   progress:0.42, accessUntil:"Aug 30, 2026",    lastUsedAt:"3d ago", expiringIn:"108 days" },
  { productId:"p1", purchasedAt:"Apr 02, 2026", orderId:"ORD-2026-04-0204", price:1499,status:"active",   progress:0.43, accessUntil:"Aug 30, 2026",    lastUsedAt:"Today",  expiringIn:"108 days" },
  { productId:"p3", purchasedAt:"Apr 18, 2026", orderId:"ORD-2026-04-0331", price:399, status:"active",   progress:0.18, accessUntil:"Lifetime",        lastUsedAt:"6d ago" },
  { productId:"p9", purchasedAt:"Apr 28, 2026", orderId:"ORD-2026-04-0418", price:899, status:"completed",progress:1.00, accessUntil:"Lifetime",        lastUsedAt:"2w ago" },
];

/* Recently viewed (not purchased) */
const RECENTLY_VIEWED = ["p4","p5","p8"];

/* Cart */
const CART = [
  { productId:"p5", qty:1 },
  { productId:"p4", qty:1 },
];

/* Seller dashboard (you-as-seller view) */
const SELLER_DASH = {
  sellerId:"s_kavya",
  kpis:{
    listings:6,        listingsActive:5,
    revenueMonth:48420, revenuePrev:39200,
    studentsMonth:182,
    avgRating:4.8,
    pendingPayout:11600,
    refundsPct:0.018,
  },
  listings:[
    { id:"p2", status:"live",     priceShown:2499, sold30d:84,   revenue30d:167916, rating:4.9 },
    { id:"l-k1", title:"Constitution Day Crash Course",                         type:"course",      status:"live",     priceShown:499,  sold30d:128, revenue30d:51072,  rating:4.7 },
    { id:"l-k2", title:"PYQ Polity 2018–2024 walkthrough",                      type:"course",      status:"live",     priceShown:999,  sold30d:56,  revenue30d:44744,  rating:4.6 },
    { id:"l-k3", title:"Federalism · advanced workshop (Mains)",                type:"course",      status:"draft",    priceShown:1499, sold30d:0,   revenue30d:0,      rating:null },
    { id:"l-k4", title:"Daily Polity revision cards",                           type:"notes_pack",  status:"paused",   priceShown:199,  sold30d:0,   revenue30d:0,      rating:4.4 },
    { id:"l-k5", title:"AIR 42 — How I built my 6-month plan",                  type:"course",      status:"live",     priceShown:799,  sold30d:42,  revenue30d:26794,  rating:4.8 },
    { id:"l-k6", title:"Live: Mock 14 review (open enrolment)",                 type:"mentor_program", status:"review", priceShown:1999, sold30d:0,   revenue30d:0,      rating:null, blockedBy:"awaiting admin approval" },
  ],
  recentOrders:[
    { at:"21m ago",  buyer:"Aarav M.",   product:"Federalism, end-to-end",   amount:2499, ref:"ORD-2026-05-1842" },
    { at:"1h ago",   buyer:"Pooja I.",   product:"Constitution Day Crash",   amount:499,  ref:"ORD-2026-05-1838" },
    { at:"3h ago",   buyer:"Rohit S.",   product:"PYQ Polity walkthrough",   amount:999,  ref:"ORD-2026-05-1820" },
    { at:"6h ago",   buyer:"Anjali D.",  product:"AIR 42 6-month plan",       amount:799,  ref:"ORD-2026-05-1809" },
    { at:"9h ago",   buyer:"Vikram K.",  product:"Federalism, end-to-end",   amount:2499, ref:"ORD-2026-05-1791" },
  ],
  monthlyRevenue:[
    { m:"Dec", v:18200 },{ m:"Jan", v:22400 },{ m:"Feb", v:31000 },
    { m:"Mar", v:36800 },{ m:"Apr", v:39200 },{ m:"May", v:48420, partial:true },
  ],
  payouts:[
    { at:"May 02 · 14:18", amount:31360, ref:"PAY-2026-04-K42",   status:"paid", net:"₹31,360 after 20% platform" },
    { at:"Apr 04 · 12:01", amount:24640, ref:"PAY-2026-03-K42",   status:"paid", net:"₹24,640 after 20% platform" },
    { at:"Mar 04 · 16:44", amount:17920, ref:"PAY-2026-02-K42",   status:"paid", net:"₹17,920 after 20% platform" },
  ],
  reviewsRecent:[
    { product:"Federalism, end-to-end", stars:5, body:"Connected Article 263 to actual PYQs in a way no textbook does. Worth every rupee.", at:"3h ago", buyer:"Pooja I." },
    { product:"Constitution Day Crash", stars:4, body:"Good fundamentals but skipped emergency provisions. Wish that was its own lesson.", at:"1d ago", buyer:"Aman R." },
    { product:"AIR 42 6-month plan",   stars:5, body:"Practical. Not romanticised. Calmest planning course I've taken.", at:"2d ago", buyer:"Anjali D." },
  ],
};

/* Admin marketplace queues */
const ADMIN_MARKET = {
  kpis:{
    gmvMonth: 1842000, gmvPrev: 1648000,
    paidOut: 1284200, pendingPayout: 184600,
    refundsMonth: 18420, refundsPct: 0.012,
    flagged: 3, approvalsPending: 7,
  },
  approvalQueue:[
    { id:"aq1", title:"Live: Mock 14 review (open enrolment)", seller:"s_kavya", type:"mentor_program", price:1999, submittedAt:"3h ago",  flags:[], status:"pending" },
    { id:"aq2", title:"Topper Talks · Q&A bundle (recorded)",   seller:"s_isha",  type:"course",         price:1299, submittedAt:"6h ago",  flags:[], status:"pending" },
    { id:"aq3", title:"SSC CGL Quant Speed v2",                  seller:"s_ccp",   type:"test_series",    price:599,  submittedAt:"1d ago",  flags:[], status:"pending" },
    { id:"aq4", title:"All-India Mock + Solutions",              seller:"s_vajiram", type:"test_series",  price:899,  submittedAt:"1d ago",  flags:["affiliate-link unverified"], status:"needs-changes" },
    { id:"aq5", title:"Federalism for IBPS PO (Polity-light)",    seller:"s_neha",  type:"course",         price:299,  submittedAt:"2d ago",  flags:["exam-tag mismatch"], status:"pending" },
  ],
  refundRequests:[
    { id:"rf1", orderId:"ORD-2026-05-1812", product:"SSC CGL Tier 1 Mocks", buyer:"Pooja I.", amount:799,  reason:"Course not as described · Quant section sparse", withinWindow:true,  state:"open" },
    { id:"rf2", orderId:"ORD-2026-05-1781", product:"Federalism, end-to-end", buyer:"Vikram K.", amount:2499, reason:"Bought duplicate · same content elsewhere",        withinWindow:true,  state:"open" },
    { id:"rf3", orderId:"ORD-2026-04-1604", product:"108-day Prelims sprint",  buyer:"Anjali D.", amount:24999, reason:"Personal emergency",                              withinWindow:false, state:"escalated" },
  ],
  payouts:[
    { sellerId:"s_kavya",  name:"Kavya Iyer",   amount:11600, cycle:"May 2026", state:"queued",     scheduled:"May 30" },
    { sellerId:"s_ccp",    name:"Career Copilot Studio", amount:84200,  cycle:"May 2026", state:"queued",     scheduled:"May 30" },
    { sellerId:"s_isha",   name:"Isha Trivedi", amount:9420,  cycle:"May 2026", state:"hold",       reason:"Refund window open on 2 orders" },
    { sellerId:"s_arjun",  name:"Arjun S.",     amount:18400, cycle:"May 2026", state:"queued",     scheduled:"May 30" },
    { sellerId:"s_neha",   name:"Neha Verma",   amount:14820, cycle:"May 2026", state:"queued",     scheduled:"May 30" },
    { sellerId:"s_kalam",  name:"Kalam Academy",amount:38600, cycle:"May 2026", state:"affiliate",  scheduled:"Jun 04" },
  ],
  flagged:[
    { id:"fl1", title:"\"100% guaranteed selection\" course copy", productId:"l-c-fake", seller:"unknown-seller", reason:"misleading claim", at:"1h ago", severity:"high" },
    { id:"fl2", title:"Affiliate price mismatch — listed ₹15,000 / Kalam ₹89,000", productId:"p8", seller:"s_kalam", reason:"price drift", at:"2h ago", severity:"medium" },
    { id:"fl3", title:"Possible DMCA · 'Laxmikanth scanned chapters'", productId:"r-dmca-1", seller:"unverified", reason:"copyright", at:"5h ago", severity:"high" },
  ],
};

window.SELLERS = SELLERS;
window.MARKET_CATEGORIES = MARKET_CATEGORIES;
window.PRODUCTS = PRODUCTS;
window.LIBRARY = LIBRARY;
window.RECENTLY_VIEWED = RECENTLY_VIEWED;
window.CART = CART;
window.SELLER_DASH = SELLER_DASH;
window.ADMIN_MARKET = ADMIN_MARKET;
