/* All sample data lives here so screens stay readable.
   Anything marked LIVE_HINT is paired to /api/study/mission-control fields
   we know exist; PREVIEW means UI exists, backend not connected yet. */

const DATA = {
  user: {
    name: "Aarav Mehra",
    exam: "UPSC CSE",
    family: "Civil Services",
    cycle: "CSE 2026",
    phase: "Prelims",
    daysToD: 108,
    hoursToday: 6.5,
    weekConsistency: 0.82,
    weakTopics: ["Modern History · Revolts", "Polity · Federalism", "Economy · Monetary policy"],
    hoursAvailable: ["06:30–08:30", "10:00–13:00", "19:30–22:00"],
  },

  engineMeta: {
    generatedAt: "Today · 03:12 IST",
    inputs: 41,
    rulesFired: 7,
    version: "Engine v0.6 · spaced+weakdrill",
    planTheme: "Federalism foundations + Mock 14 prep",
    planTarget: "Lock Polity Ch. 1–4, clear M13 corrections, sit Mock 14",
    planSource: "adapted-from-existing", // existing | adapted | preview
  },

  /* Today metrics row */
  metrics: [
    { k:"Tasks done",      v:"2 / 7",  delta:"+1 vs yesterday", live:true,  tone:"sage" },
    { k:"Adherence (7d)",  v:"82%",    delta:"+4pp",            live:true,  tone:"sage" },
    { k:"Backlog",         v:"3 tasks",delta:"+2 carried",      live:true,  tone:"amber" },
    { k:"Mocks this week", v:"1 / 2",  delta:"on track",        live:true,  tone:"sage" },
    { k:"Focus hours",     v:"4.2h",   delta:"−0.8h vs plan",   live:true,  tone:"clay" },
    { k:"Revision cov.",   v:"56%",    delta:"4 topics due",    live:"partial", tone:"clay" },
  ],

  safeExplanation: {
    headline: "Plan adjusted because Mock 13 review is pending and revision backlog grew this week.",
    signals: [
      { label:"Mock review pending",  tone:"amber" },
      { label:"Revision backlog",     tone:"amber" },
      { label:"Deadline approaching · CSE 2026 form opens May 22", tone:"clay" },
      { label:"Availability normal today (6.5h)", tone:"sage" },
    ],
  },

  nextBest: {
    type: "mock-review",
    title: "Review Mock 13 before tonight's Mock 14",
    body: "You scored 122/200 last mock. 14 wrong answers are unreviewed — error patterns shape tonight's task selection.",
    cta: "Open mock review",
    estimate: "35–45 min",
    reasonChips: [
      { layer:"user",   label:"mock-cadence" },
      { layer:"engine", label:"review-before-mock" },
    ],
  },

  tasks: [
    { id:"t1", time:"06:30", duration:"60m", type:"revision",
      title:"Polity · Federalism — concept revision",
      topic:"Polity ▸ Federalism ▸ Centre-State", planned:60, status:"done",
      sub:"Spaced revision due · 3rd encounter · last 84% accuracy",
      sources:[ {layer:"user",label:"Weak topic"},{layer:"engine",label:"Spaced due"},{layer:"exam",label:"PYQ-heavy"} ],
    },
    { id:"t2", time:"07:30", duration:"30m", type:"current-affairs",
      title:"Current affairs · Monetary policy — Apr digest",
      topic:"Economy ▸ Monetary", planned:30, status:"done",
      sub:"Linked to your weak topic in Economy",
      sources:[ {layer:"update",label:"RBI Apr policy"},{layer:"user",label:"Weak: Monetary"},{layer:"engine",label:"Daily compiler"} ],
    },
    { id:"t3", time:"10:00", duration:"90m", type:"learn",
      title:"Modern History · Revolts of 1857 — deep read",
      topic:"Modern ▸ 1857", planned:90, status:"in-progress", oneThing:true,
      sub:"Prerequisite for Governor-General sequence · scheduled before Mock 14",
      sources:[ {layer:"exam",label:"Prerequisite"},{layer:"user",label:"Weak: Modern"},{layer:"engine",label:"Pre-mock"} ],
    },
    { id:"t4", time:"11:30", duration:"45m", type:"answer-drill",
      title:"Mains answer drill · GS-2 (federalism short note)",
      topic:"GS-2 ▸ Federalism", planned:45, status:"todo",
      sub:"From your Mock 13 weak-area report",
      sources:[ {layer:"user",label:"Mock 13 weak"},{layer:"engine",label:"Weak-area drill"} ],
    },
    { id:"t5", time:"12:15", duration:"20m", type:"exam-update",
      title:"Review · CSE 2026 Notification — cycle changes",
      topic:"Meta ▸ Cycle 2026", planned:20, status:"todo", needsAck:true,
      sub:"Officially verified update on May 12 · syllabus addendum noted",
      sources:[ {layer:"update",label:"CSE 2026 notif"},{layer:"exam",label:"Cycle 2026"} ],
    },
    { id:"t6", time:"19:30", duration:"75m", type:"mock",
      title:"Full-length Mock 14 — Prelims · Paper I",
      topic:"Prelims ▸ Full mock", planned:75, status:"todo",
      sub:"Engine-scheduled · last mock 7d ago · coverage 68%",
      sources:[ {layer:"user",label:"Mock cadence"},{layer:"exam",label:"Prelims"},{layer:"engine",label:"Cadence"} ],
    },
    { id:"t7", time:"21:00", duration:"30m", type:"revision",
      title:"Spaced revision · Polity Ch.4 (carried 2×)",
      topic:"Polity ▸ Ch.4", planned:30, status:"todo",
      sub:"Forgetting curve · interval +2d, mastery 56%",
      sources:[ {layer:"engine",label:"Spaced revision"},{layer:"user",label:"Carried 2×"} ],
    },
  ],

  planReasoning: [
    { text:"Adherence dropped from 91% → 82% — engine reduced today's load to 6.5h.", state:"live" },
    { text:"Backlog grew by 2 carried tasks — surfaced Polity Ch.4 as the One Thing.", state:"live" },
    { text:"Mock 13 review still pending — added correction drill before tonight's Mock 14.", state:"live" },
    { text:"Verified PYQ tag for Modern History · 1857 is locked — concept block scheduled.", state:"live" },
    { text:"Official update: CSE 2026 form opens May 22 — acknowledgement task added.", state:"live" },
    { text:"Research signal hints Polity may drop in weightage — strategy only, no plan change.", state:"preview" },
  ],

  studyPolicy: {
    dailyTarget: "6h focus / 7 tasks",
    maxTasksPerDay: 7,
    taskSizePreference: "Medium (30–75m)",
    mix: [
      { k:"Concept learning",   pct:30 },
      { k:"Retrieval practice", pct:25 },
      { k:"Revision (spaced)",  pct:20 },
      { k:"Mock + correction",  pct:25 },
    ],
    constraints: [
      "Avoid theory blocks > 90m back-to-back",
      "Weekend catch-up allowed on backlog only",
      "Require mock review before next mock",
      "No new concept block within 2h of a mock",
    ],
  },

  truthPanel: {
    improved: ["Morning consistency: 4/5 days started by 06:45", "Polity mastery: 48% → 56%"],
    declined: ["Mains answer practice: 3 → 1 / week", "Mock review latency: 2.4d → 3.1d"],
    correction: ["Schedule Mock 13 review tonight pre-Mock 14", "Add 1 GS-2 answer drill on Wed + Sat"],
  },

  examContext: {
    family: "Civil Services", exam: "UPSC CSE", cycle: "CSE 2026", phase: "Prelims",
    verifiedTopics: 184, verifiedPYQ: 1124, syllabusMentions: 38, status:"connected",
  },

  competitionContext: {
    vacancy: { v:"1056", trust:"locked" },
    applicants: { v:"~9.8L", trust:"preview" },
    cutoffTrend: { v:"flat ±2", trust:"preview" },
    difficultyTrend: { v:"↑ slight", trust:"preview" },
    status: "partial",
  },

  layers: [
    { key:"user", title:"User intelligence", count:14, caption:"What we know about you",
      items:[
        { k:"Persona",       v:"Aspirant · UPSC CSE", evidence:6 },
        { k:"Action profile",v:"Morning-heavy · Mock-cautious", evidence:18 },
        { k:"Study history", v:"168h last 30d · 82% consistency", evidence:30 },
        { k:"Mock history",  v:"13 mocks · best 134/200 · drift +8", evidence:13 },
        { k:"Focus consistency", v:"4.2h/day avg · σ 0.9", evidence:30 },
        { k:"Weak topics",   v:"3 active", evidence:9 },
        { k:"Hours today",   v:"6.5h", evidence:1 },
      ], missing:[ "Sleep schedule signal (opt-in)", "Subject preference rating" ], trust:"live",
    },
    { key:"exam", title:"Exam intelligence", count:9, caption:"What the exam looks like",
      items:[
        { k:"Family",        v:"Civil Services", evidence:"locked" },
        { k:"Exam · cycle",  v:"UPSC CSE · 2026", evidence:"locked" },
        { k:"Phase",         v:"Prelims · 108d", evidence:"locked" },
        { k:"Syllabus tree", v:"12 subj · 184 topics · 1.1k µtopics", evidence:"reviewed" },
        { k:"PYQ trend",     v:"Polity ↓ · Economy ↑ (3yr)", evidence:"reviewed" },
        { k:"Prereq graph",  v:"94 edges · 7 unblock today", evidence:"reviewed" },
        { k:"Calendar",      v:"Prelims Aug 30 · Mains Sep 19", evidence:"locked" },
      ], missing:[ "Cutoff history (post-2022 verified)" ], trust:"live",
    },
    { key:"update", title:"Update intelligence", count:11, caption:"What the world is saying",
      items:[
        { k:"Official",      v:"2 verified · CSE 2026 notification", evidence:"verified" },
        { k:"Deadline",      v:"Application opens May 22", evidence:"verified" },
        { k:"Syllabus chg.", v:"+4 µtopics (Public Admin)", evidence:"verified" },
        { k:"Pattern chg.",  v:"None official · 1 research hint", evidence:"research" },
        { k:"Aggregator",    v:"3 items · all flagged", evidence:"aggregator" },
        { k:"Current affairs",v:"Daily digest · 9 items", evidence:"reviewed" },
      ], missing:[ "Subject-wise weightage notice" ], trust:"partial",
    },
    { key:"engine", title:"Study OS engine", count:7, caption:"How it composes the plan",
      items:[
        { k:"Plan gen",      v:"compile_daily · v0.6" },
        { k:"Prioritization",v:"weak·prereq·cadence" },
        { k:"Spaced rev",    v:"3 due · interval ±2d" },
        { k:"Weak drill",    v:"Federalism · 1 cycle" },
        { k:"Mock cadence",  v:"Next: Mock 14 tonight" },
        { k:"Daily compiler",v:"7 tasks · 6.5h" },
        { k:"Adapt",         v:"Paused (no negative drift)" },
      ], missing:[ "Multi-week plan rebalancer (preview)" ], trust:"live",
    },
  ],

  updates: {
    verified: [
      { id:"u1", title:"UPSC CSE 2026 — Notification released",
        summary:"Application window opens May 22 · Prelims on Aug 30, 2026.",
        source:"upsc.gov.in", sourceType:"official",
        receivedAt:"May 12 · 09:14 IST", tag:"Cycle update",
        effect:"Calendar updated · 3 deadlines added to tracker.", hash:"0x4f·a7c2",
      },
      { id:"u2", title:"Syllabus addendum — Optional: Public Admin",
        summary:"Section II Topic 3 expanded to include digital governance.",
        source:"upsc.gov.in/notifications/cse-2026", sourceType:"official",
        receivedAt:"May 12 · 09:14 IST", tag:"Syllabus change",
        effect:"Subject tree v2026.1 · 4 new microtopics queued.", hash:"0x4f·a7d1",
      },
    ],
    aggregator: [
      { id:"u3", title:"Admit card likely by Jul 28 (rumoured)",
        summary:"Aggregator reports earlier-than-usual release based on staffing notice.",
        source:"examstudy.in · careerwala", sourceType:"aggregator", trust:0.42,
        receivedAt:"May 13 · 18:02 IST", tag:"Date rumor",
        effect:"No calendar change · flagged for follow-up.",
      },
    ],
    research: [
      { id:"u4", title:"Pattern shift — fewer Polity questions predicted",
        summary:"Trend analysis from PYQs 2021–25; not an official communication.",
        source:"Internal research · coverage model 0.8", sourceType:"research", trust:0.71,
        receivedAt:"May 11 · 22:40 IST", tag:"Trend",
        effect:"Strategy hint only · plan not auto-adjusted.",
      },
    ],
    opportunity: [
      { id:"u5", title:"RBI Grade B — eligibility looks open for you",
        summary:"Adjacent recruitment surfaced by the eligibility engine; no action yet.",
        source:"rbi.org.in (matched) · enrichment", sourceType:"opportunity", trust:0.88,
        receivedAt:"May 10 · 11:05 IST", tag:"Opportunity",
        effect:"Listed under Adjacent exams · saved to Tracker draft.",
      },
    ],
  },

  /* persona question */
  personaQuestion: {
    prompt: "On a mock test day, when do you feel sharpest?",
    options: ["Early morning", "Late morning", "Afternoon", "Evening"],
    why: "Helps schedule mocks at your sharpest 90-min window. Stored as a study signal, not a profile label.",
    state: "live",
  },

  /* Plan timeline (7 days) */
  weekPlan: [
    { day:"Mon May 13", tasks:6, hours:5.5, focus:"Mock 13 + correction", status:"done", adherence:0.84 },
    { day:"Tue May 14", tasks:7, hours:6.5, focus:"Federalism + Mock 14", status:"today", adherence:0.28, isToday:true },
    { day:"Wed May 15", tasks:6, hours:6.0, focus:"Mock 14 review · GS-2 drill", status:"planned", adherence:0 },
    { day:"Thu May 16", tasks:5, hours:5.0, focus:"Modern History deep · CA", status:"planned", adherence:0 },
    { day:"Fri May 17", tasks:6, hours:6.0, focus:"Economy concepts + Mains", status:"planned", adherence:0 },
    { day:"Sat May 18", tasks:5, hours:5.5, focus:"Weekend catchup + revision", status:"planned", adherence:0 },
    { day:"Sun May 19", tasks:4, hours:4.0, focus:"Weekly review + Mock 15", status:"planned", adherence:0 },
  ],

  planChangeLog: [
    { v:"v0.6.4", at:"May 14 · 03:12", change:"Added Mock 13 correction drill before Mock 14", trigger:"engine:review-before-mock", actor:"system" },
    { v:"v0.6.3", at:"May 12 · 09:18", change:"Calendar: CSE 2026 form open May 22 added", trigger:"update:official:CSE2026", actor:"system" },
    { v:"v0.6.2", at:"May 11 · 21:40", change:"Reduced Wed load 7 → 6 tasks (adherence drift)", trigger:"engine:adherence_drop", actor:"system" },
    { v:"v0.6.1", at:"May 09 · 08:00", change:"User toggled task size to Medium", trigger:"user:setting", actor:"user" },
  ],

  /* Subjects */
  subjects: [
    { id:"polity", name:"Polity", mastery:0.56, weight:0.18, due:4, weak:2, color:"#54794E" },
    { id:"history", name:"History", mastery:0.42, weight:0.15, due:3, weak:3, color:"#A68057" },
    { id:"economy", name:"Economy", mastery:0.38, weight:0.14, due:2, weak:2, color:"#524864" },
    { id:"geo", name:"Geography", mastery:0.61, weight:0.12, due:1, weak:0, color:"#BE9C6B" },
    { id:"env", name:"Environment", mastery:0.55, weight:0.10, due:2, weak:1, color:"#94B28A" },
    { id:"sci", name:"Sci & Tech", mastery:0.49, weight:0.10, due:1, weak:1, color:"#8F86A1" },
    { id:"ca", name:"Current Affairs", mastery:0.62, weight:0.21, due:6, weak:1, color:"#6C5038" },
  ],

  topicTree: {
    polity: [
      { id:"federalism", name:"Federalism", mastery:0.48, priority:"reviewed", pyqRel:"high", obsDiff:0.62, expDiff:0.55, due:true, weak:true, hyVerified:true,
        sub:[
          { id:"centrestate", name:"Centre-State relations", mastery:0.41, priority:"locked", pyqRel:"high", weak:true, hyVerified:true },
          { id:"emergency", name:"Emergency provisions", mastery:0.55, priority:"reviewed", pyqRel:"medium", weak:false, hyVerified:false },
        ] },
      { id:"constitution", name:"Constitutional bodies", mastery:0.62, priority:"reviewed", pyqRel:"medium", obsDiff:0.45, expDiff:0.50, due:false, weak:false, hyVerified:false,
        sub:[
          { id:"eci", name:"Election Commission", mastery:0.70, priority:"reviewed", pyqRel:"medium", weak:false, hyVerified:false },
          { id:"cag", name:"CAG", mastery:0.66, priority:"reviewed", pyqRel:"low", weak:false, hyVerified:false },
        ] },
      { id:"fundr", name:"Fundamental Rights", mastery:0.71, priority:"locked", pyqRel:"high", obsDiff:0.40, expDiff:0.42, due:false, weak:false, hyVerified:true, sub:[] },
    ],
  },

  /* Focus session preset */
  focus: {
    presets: [25, 50, 90],
    currentTask: "Modern History · Revolts of 1857 — deep read",
    currentTopic: "Modern ▸ 1857",
    history: [
      { date:"May 13", min:50, topic:"Polity Ch.4 revision", confidence:0.62 },
      { date:"May 13", min:25, topic:"Current Affairs digest", confidence:0.74 },
      { date:"May 12", min:90, topic:"Economy · Monetary", confidence:0.55 },
    ],
  },

  /* Mocks */
  mocks: [
    { id:"M14", name:"Mock 14 — Prelims P1", date:"Tonight", score:null, status:"scheduled" },
    { id:"M13", name:"Mock 13 — Prelims P1", date:"May 07", score:"122/200", status:"unreviewed", weak:["Polity · Federalism","Modern · 1857","Economy · MP"], errors:{ concept:6, calc:1, time:4, misread:2, guess:1 } },
    { id:"M12", name:"Mock 12 — Prelims P1", date:"Apr 30", score:"118/200", status:"corrected", weak:["Polity · Bills","Economy · Banking"], errors:{ concept:5, calc:2, time:3, misread:1, guess:0 } },
    { id:"M11", name:"Mock 11 — Prelims P1", date:"Apr 23", score:"126/200", status:"corrected", weak:["History · Modern","Geo · Climate"], errors:{ concept:4, calc:0, time:5, misread:2, guess:1 } },
  ],

  /* Weekly review */
  weeklyReview: {
    hoursStudied: 38.5, hoursPlanned: 42, adherence: 0.82, tasksDone: 41, tasksPlanned: 50,
    mocksTaken: 1, backlogStart: 1, backlogEnd: 3, revisionCoverage: 0.56,
    improved: [
      { k:"Morning starts on time",  d:"+12%", note:"4/5 days started by 06:45" },
      { k:"Polity mastery",           d:"+8pp", note:"48% → 56% via 3 spaced cycles" },
      { k:"Daily compiler adherence", d:"+4pp", note:"82% over the week" },
    ],
    declined: [
      { k:"Mains answer practice", d:"3 → 1/wk", note:"Wed + Sat slots missed" },
      { k:"Mock review latency",   d:"2.4d → 3.1d", note:"M13 still unreviewed" },
    ],
    nextWeekChanges: [
      "Lock GS-2 answer drill Wed + Sat (engine constraint)",
      "Insert M13 review tonight before Mock 14",
      "Pause Polity new-concept blocks until mastery > 65%",
    ],
  },

  /* Admin · Exam Intelligence */
  adminExamOverview: {
    activeExams: 14, pendingSyllabus: 38, verifiedPYQ: 1124,
    lockedCoverage: 92, lowConfidence: 17, userReadiness: 0.78,
  },

  adminExams: [
    { family:"Civil Services", exam:"UPSC CSE", cycle:"2026", phase:"Prelims", cov:"connected", verified:184, pending:38 },
    { family:"Banking",        exam:"RBI Grade B", cycle:"2026", phase:"Phase I", cov:"partial",   verified:96,  pending:14 },
    { family:"SSC",            exam:"SSC CGL",   cycle:"2026", phase:"Tier 1",  cov:"connected", verified:142, pending:22 },
    { family:"State PSC",      exam:"UPPSC",     cycle:"2026", phase:"Prelims", cov:"not",       verified:0,   pending:0 },
    { family:"Defense",        exam:"CDS",       cycle:"2026·1", phase:"Written", cov:"partial",  verified:54,  pending:9 },
  ],

  adminReviewQueue: [
    { id:"r1", kind:"syllabus-mention", text:"\"Federal structure under stress\" → Polity ▸ Federalism", source:"UPSC syllabus PDF", conf:0.91, status:"pending" },
    { id:"r2", kind:"pyq-tag",  text:"2022 Q41 → Modern ▸ 1857", source:"PYQ archive", conf:0.86, status:"pending" },
    { id:"r3", kind:"pyq-tag",  text:"2021 Q33 → Economy ▸ Monetary policy", source:"PYQ archive", conf:0.74, status:"pending" },
    { id:"r4", kind:"syllabus-mention", text:"\"Digital governance frameworks\" → Pub Admin", source:"Notification addendum", conf:0.69, status:"pending" },
    { id:"r5", kind:"pyq-question", text:"2023 Q07 (full text + 4 options) → tag candidate", source:"PYQ archive", conf:0.58, status:"pending" },
  ],

  adminTopicCoverage: [
    { exam:"UPSC CSE", phase:"Prelims", subject:"Polity",  topic:"Federalism",       depth:"deep",  expDiff:0.62, prio:0.88, hy:true,  conf:0.91, evid:14, status:"locked" },
    { exam:"UPSC CSE", phase:"Prelims", subject:"History", topic:"Revolts of 1857",  depth:"deep",  expDiff:0.55, prio:0.81, hy:true,  conf:0.86, evid:11, status:"reviewed" },
    { exam:"UPSC CSE", phase:"Prelims", subject:"Economy", topic:"Monetary policy",  depth:"medium",expDiff:0.58, prio:0.74, hy:false, conf:0.71, evid:8,  status:"reviewed" },
    { exam:"UPSC CSE", phase:"Prelims", subject:"Geo",     topic:"Climate zones",    depth:"medium",expDiff:0.42, prio:0.46, hy:false, conf:0.65, evid:6,  status:"pending_review" },
    { exam:"UPSC CSE", phase:"Prelims", subject:"Polity",  topic:"Pub Admin · digital", depth:"shallow", expDiff:0.50, prio:0.40, hy:false, conf:0.58, evid:3, status:"draft" },
  ],

  adminCompetition: [
    { exam:"UPSC CSE", cycle:"2026", vacancy:1056, ratio:"~930:1", cutoff:"flat ±2", diff:"↑", reliability:0.92, status:"locked" },
    { exam:"RBI Grade B", cycle:"2026", vacancy:94, ratio:"~610:1", cutoff:"↑ 3", diff:"flat", reliability:0.74, status:"reviewed" },
    { exam:"SSC CGL", cycle:"2026", vacancy:9650, ratio:"~88:1", cutoff:"↑ 4", diff:"↑", reliability:0.68, status:"pending_review" },
  ],

  adminPolicy: [
    { id:"p1", type:"official",   title:"CSE 2026 Notification", source:"upsc.gov.in", status:"reviewed",
      impacts:["plan","deadline","syllabus"], at:"May 12 · 09:14" },
    { id:"p2", type:"aggregator", title:"Admit card likely Jul 28", source:"examstudy.in", status:"discovery",
      impacts:[], at:"May 13 · 18:02", blockedBy:"awaits official source" },
    { id:"p3", type:"research",   title:"Polity weightage may drop", source:"Internal research", status:"strategy-only",
      impacts:["strategy-hint"], at:"May 11 · 22:40" },
    { id:"p4", type:"opportunity",title:"RBI Grade B eligibility opens", source:"rbi.org.in", status:"adjacent",
      impacts:[], at:"May 10 · 11:05" },
  ],

  adminPlanImpact: [
    { id:"pi1", title:"Apply Public Admin syllabus addendum (4 µtopics)", before:"v0.6.3", after:"v0.6.4-draft",
      affectedUsers:418, affectedExams:["UPSC CSE 2026"], risk:"low", rollout:"staged 10% → 50% → 100%", approval:"pending", note:"No automatic mutation in prototype." },
    { id:"pi2", title:"Lock Federalism · Centre-State as high-yield", before:"reviewed", after:"locked",
      affectedUsers:1820, affectedExams:["UPSC CSE 2026","UPPSC 2026"], risk:"low", rollout:"immediate after approval", approval:"approved", note:"Will affect planner prioritization." },
  ],

  /* Admin · Persona */
  personaUser: {
    name:"Aarav Mehra", id:"usr_8a2…f31", exam:"UPSC CSE 2026",
    snapshotAt:"May 14 · 03:12",
    dimensions:[
      { k:"Availability",            score:0.62, evidence:18 },
      { k:"Focus consistency",       score:0.71, evidence:30 },
      { k:"Mock pressure response",  score:0.48, evidence:13 },
      { k:"Revision discipline",     score:0.55, evidence:22 },
      { k:"Concept-vs-practice mix", score:0.66, evidence:41 },
    ],
    policyOut:{
      maxTasks:7, sizePref:"Medium 30–75m",
      mix:{ concept:30, retrieval:25, revision:20, mock:25 },
      constraints:["No theory > 90m","Require mock review before next mock"],
    },
    events:[
      { at:"May 14 · 03:12", k:"snapshot.compiled", v:"v3.1 · 41 inputs" },
      { at:"May 13 · 23:58", k:"signal.mock", v:"Mock 13 unreviewed > 3d" },
      { at:"May 13 · 09:01", k:"signal.adherence", v:"adherence 91 → 82 (7d)" },
      { at:"May 12 · 09:14", k:"signal.update", v:"CSE 2026 notification verified" },
      { at:"May 11 · 21:40", k:"signal.consistency", v:"morning 4/5 days" },
    ],
    recomputeQueue:[
      { user:"usr_8a2…f31", reason:"adherence_drop", queuedAt:"03:11", state:"done" },
      { user:"usr_44b…9c1", reason:"mock_unreviewed", queuedAt:"03:09", state:"running" },
      { user:"usr_c12…d4e", reason:"availability_change", queuedAt:"03:07", state:"queued" },
      { user:"usr_91f…7aa", reason:"update_official", queuedAt:"03:04", state:"queued" },
    ],
  },
};

window.DATA = DATA;
