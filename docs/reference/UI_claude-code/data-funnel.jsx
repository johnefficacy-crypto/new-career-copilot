/* Funnel + onboarding data */

/* Question bank — modeled after persona_question_bank + recruitment_question_requirements */
const QUESTION_BANK = {
  /* COLD path · S2 INTENT */
  intent: {
    id:"intent", key:"intent", kind:"chips_single", required:true,
    botText:"Welcome. Before anything else — what brings you here?",
    why:"This shapes which 5–7 questions we ask next. We don't want to make you fill a 20-field form.",
    chips:[
      { v:"check_eligibility",  label:"Find exams I'm eligible for",   icon:"◐" },
      { v:"plan_prep",          label:"Plan my prep for a specific exam", icon:"▤" },
      { v:"todays_matches",     label:"See what's matching today",      icon:"✦" },
      { v:"browsing",           label:"Just browsing",                  icon:"◌" },
    ],
    writes:["funnel_sessions.intent","onboarding_answers"],
  },

  /* exam family */
  exam_family: {
    id:"exam_family", key:"exam_family", kind:"chips_single", required:true,
    botText:"Got it. Which exam family are you looking at?",
    why:"This is how we route you to a verified syllabus tree and a sane eligibility check. Not used for ads.",
    chips:[
      { v:"upsc",   label:"UPSC · Civil Services" },
      { v:"ssc",    label:"SSC · staff selection" },
      { v:"banking",label:"Banking · IBPS / SBI / RBI" },
      { v:"state",  label:"State PSC" },
      { v:"defense",label:"Defense · CDS / NDA / AFCAT" },
      { v:"none",   label:"Not sure yet" },
    ],
    appliesWhen:(a) => a.intent !== "browsing",
    writes:["onboarding_answers"],
  },

  /* specific exam */
  exam_specific: {
    id:"exam_specific", key:"exam_specific", kind:"chips_single", required:true,
    botText:"Which exam specifically?",
    why:"Some recruitments share a family but differ on eligibility (age, attempts, domicile). We need this to be precise.",
    chipsByFamily:{
      upsc:[{v:"cse",label:"Civil Services (CSE)"},{v:"cds",label:"CDS"},{v:"nda",label:"NDA"},{v:"epfo",label:"EPFO EO"},{v:"ese",label:"Engineering Services"}],
      ssc:[{v:"cgl",label:"CGL"},{v:"chsl",label:"CHSL"},{v:"je",label:"Junior Engineer"},{v:"mts",label:"MTS"}],
      banking:[{v:"ibps_po",label:"IBPS PO"},{v:"ibps_clerk",label:"IBPS Clerk"},{v:"sbi_po",label:"SBI PO"},{v:"rbi_grb",label:"RBI Grade B"}],
      state:[{v:"uppsc",label:"UPPSC"},{v:"mpsc",label:"MPSC"},{v:"bpsc",label:"BPSC"},{v:"hpsc",label:"HPSC"}],
      defense:[{v:"cds",label:"CDS"},{v:"nda",label:"NDA"},{v:"afcat",label:"AFCAT"}],
    },
    appliesWhen:(a) => a.exam_family && a.exam_family !== "none",
    writes:["onboarding_answers"],
  },

  /* phase */
  phase: {
    id:"phase", key:"phase", kind:"chips_single", required:true,
    botText:"Where are you in your prep?",
    why:"A foundation aspirant gets a different daily plan than someone in the final 90-day sprint. Same engine, different tuning.",
    chips:[
      { v:"foundation", label:"Foundation · still building basics" },
      { v:"prelims",    label:"Prelims phase · core prep" },
      { v:"mains",      label:"Mains phase · writing practice" },
      { v:"revision",   label:"Final-month revision" },
      { v:"unsure",     label:"Honestly not sure yet" },
    ],
    appliesWhen:(a) => a.exam_specific,
    writes:["onboarding_answers"],
  },

  /* hours/day */
  hours_per_day: {
    id:"hours_per_day", key:"hours_per_day", kind:"slider", required:true,
    botText:"On a typical day, how many hours can you study?",
    why:"This determines daily plan size. We will never push you to study more than this — but we'll surface backlog if you under-deliver.",
    slider:{ min:1, max:12, step:0.5, default:5, suffix:"h" },
    writes:["onboarding_answers"],
  },

  /* education level */
  education: {
    id:"education", key:"education", kind:"chips_single", required:true,
    botText:"What's your education level?",
    why:"Eligibility check. Different exams require Class 12 / Graduate / Postgrad. We never use this for anything else.",
    chips:[
      { v:"hs",       label:"Class 12 / 10+2" },
      { v:"diploma",  label:"Diploma" },
      { v:"grad",     label:"Graduate" },
      { v:"pg",       label:"Postgrad" },
      { v:"appearing",label:"Currently studying (will appear in final year)" },
    ],
    writes:["onboarding_answers","aspirant_education(at S7)"],
  },

  /* graduation year */
  grad_year: {
    id:"grad_year", key:"grad_year", kind:"text_parsed", required:true,
    botText:"In what year did you graduate (or will you)?",
    why:"Some exams have age + experience cut-offs measured from graduation year.",
    parser:{ regex:"^(19[89]\\d|20[0-3]\\d)$", error:"Enter a 4-digit year between 1980 and 2039" },
    appliesWhen:(a) => a.education === "grad" || a.education === "pg" || a.education === "appearing",
    writes:["onboarding_answers","aspirant_education(at S7)"],
  },

  /* state */
  state_domicile: {
    id:"state_domicile", key:"state_domicile", kind:"chips_single", required:true,
    botText:"Which state are you applying from?",
    why:"Used for State PSC eligibility. Central exams don't need this — but we still need it for cohort matching.",
    chips:[
      { v:"UP", label:"Uttar Pradesh" }, { v:"MH", label:"Maharashtra" },
      { v:"BR", label:"Bihar" }, { v:"KA", label:"Karnataka" },
      { v:"TN", label:"Tamil Nadu" }, { v:"WB", label:"West Bengal" },
      { v:"DL", label:"Delhi" }, { v:"RJ", label:"Rajasthan" },
      { v:"OTHER", label:"Other" },
    ],
    writes:["onboarding_answers","aspirant_profile(at S7)"],
  },

  /* mock cadence */
  mock_cadence: {
    id:"mock_cadence", key:"mock_cadence", kind:"chips_single", required:false,
    botText:"How often have you been taking mock tests?",
    why:"Helps us schedule mocks at your sharpest 90-min window — and avoid scheduling two mocks back to back.",
    chips:[
      { v:"none",     label:"Haven't started yet" },
      { v:"weekly",   label:"Once a week" },
      { v:"biweekly", label:"Every 2 weeks" },
      { v:"monthly",  label:"Once a month" },
    ],
    appliesWhen:(a) => a.phase && a.phase !== "foundation" && a.phase !== "unsure",
    writes:["onboarding_answers"],
  },

  /* sharpness window */
  sharpest_window: {
    id:"sharpest_window", key:"sharpest_window", kind:"chips_single", required:false,
    botText:"When in the day do you feel sharpest?",
    why:"For scheduling concept-heavy blocks. If you're sharper at 6am, no plan we generate will put deep reading at 10pm.",
    chips:[
      { v:"early_morning", label:"Early morning · 5–8" },
      { v:"late_morning",  label:"Late morning · 9–12" },
      { v:"afternoon",     label:"Afternoon · 1–5" },
      { v:"evening",       label:"Evening · 6–9" },
      { v:"night",         label:"Late night · 10pm+" },
    ],
    writes:["onboarding_answers"],
  },

  /* name + email (post-Google: prefilled) */
  name: {
    id:"name", key:"name", kind:"text_simple", required:true,
    botText:"What should we call you?",
    why:"Used only inside Career Copilot. Visible to your study partners and accountability partner — not on public discovery.",
    placeholder:"Your name",
    writes:["aspirant_profile(at S7)"],
  },
};

/* Pre-built scripts (for demo we hand-curate the queue per intent) */
const QUEUE_BY_INTENT = {
  check_eligibility: ["exam_family","exam_specific","education","grad_year","state_domicile","hours_per_day"],
  plan_prep:         ["exam_family","exam_specific","phase","hours_per_day","mock_cadence","sharpest_window","education"],
  todays_matches:    ["exam_family","phase","hours_per_day","sharpest_window"],
  browsing:          ["exam_family","hours_per_day"],
};

/* CTA-branch queue (recruitment_question_requirements) — exam already known */
const QUEUE_CTA_EXAMPLE = ["education","grad_year","state_domicile","hours_per_day","mock_cadence"];

/* Simulated session for state inspector */
const SAMPLE_SESSION = {
  id:"fs_8a2f1c…",
  anonymous_id:"anon_8a2f1c9d",
  user_id:null,
  started_at:"03:12:08 IST",
  intent:null,
  state:"S0 ENTRY",
  recruitment_id:null,
  questions_answered:0,
  questions_remaining:0,
  localstorage_keys:["ccp.anon", "ccp.onb.queue", "ccp.onb.answers"],
  last_write:null,
  next_async:null,
  match_preview:0,
};

/* Funnel analytics */
const FUNNEL_ANALYTICS = {
  today:{
    sessions_started: 4218,
    sessions_completed_s7: 1184,
    completion_rate: 0.281,
    avg_time_to_s7: "3m 42s",
    median_questions_answered: 6,
    anon_to_signed_rate: 0.622,  // S6 conversion among anon
    s5_peek_lift: 0.34,           // login conversion lift when peek fired
    day3_email_clickthrough: 0.18,
  },

  conversion:[
    { stage:"S1 ANON_INIT",  count:4218, label:"Anon session created" },
    { stage:"S2 INTENT",     count:3940, label:"Intent picked / inferred" },
    { stage:"S3 LOAD_PLAN",  count:3892, label:"Question queue built" },
    { stage:"S4 ASK · Q1",   count:3742, label:"Answered Q1" },
    { stage:"S4 ASK · Q3",   count:2924, label:"Answered Q3" },
    { stage:"S5 PEEK fired", count:2410, label:"Match preview shown" },
    { stage:"S6 GATE",       count:2188, label:"Login prompt seen" },
    { stage:"S6 success",    count:1362, label:"Google sign-in done" },
    { stage:"S7 DONE",       count:1184, label:"Canonical written, confetti" },
  ],

  drop_off_by_question:[
    { q:"intent",         drop:0.07 },
    { q:"exam_family",    drop:0.04 },
    { q:"exam_specific",  drop:0.03 },
    { q:"phase",          drop:0.08 },
    { q:"hours_per_day",  drop:0.05 },
    { q:"education",      drop:0.06 },
    { q:"grad_year",      drop:0.14, note:"Parser rejection rate 4.2% — improve hint copy" },
    { q:"state_domicile", drop:0.05 },
    { q:"mock_cadence",   drop:0.09 },
  ],

  intents:[
    { id:"check_eligibility", pct:42, color:"#54794E" },
    { id:"plan_prep",         pct:31, color:"#A68057" },
    { id:"todays_matches",    pct:16, color:"#524864" },
    { id:"browsing",          pct:11, color:"#8F86A1" },
  ],

  source:[
    { id:"Blog · 'How to prepare for SSC CGL'", visits:1840, conv:0.34, intent:"check_eligibility" },
    { id:"Google · 'upsc 2026 notification'",    visits:1240, conv:0.28, intent:"plan_prep" },
    { id:"Direct · ccp.in",                       visits:620,  conv:0.22, intent:"todays_matches" },
    { id:"Twitter share · @ccp",                  visits:340,  conv:0.18, intent:"browsing" },
    { id:"Aff · VajiramPrep",                     visits:178,  conv:0.41, intent:"check_eligibility" },
  ],

  time_histogram:[
    { range:"<1m", pct:6 },
    { range:"1-2m", pct:14 },
    { range:"2-3m", pct:28 },
    { range:"3-4m", pct:24 },
    { range:"4-5m", pct:14 },
    { range:"5-7m", pct:9 },
    { range:">7m", pct:5 },
  ],

  stitch_audit:[
    { id:"fs_8a2f1c", anon:"anon_8a2f1c", stitched_user:"usr_8a2…f31", t_anon:"03:12:08", t_login:"03:15:18", t_done:"03:16:48", state:"S7", source:"google" },
    { id:"fs_d44e2a", anon:"anon_d44e2a", stitched_user:"usr_44b…9c1", t_anon:"02:58:42", t_login:"03:02:11", t_done:"03:03:55", state:"S7", source:"google" },
    { id:"fs_91f7aa", anon:"anon_91f7aa", stitched_user:null,          t_anon:"03:01:09", t_login:null,        t_done:null,        state:"S4 (Q4)", source:null, paused:true },
    { id:"fs_c12d4e", anon:"anon_c12d4e", stitched_user:"usr_c12…d4e", t_anon:"02:44:01", t_login:"02:46:33", t_done:"02:48:12", state:"S7", source:"google" },
    { id:"fs_67e1bb", anon:"anon_67e1bb", stitched_user:null,          t_anon:"03:11:55", t_login:null,        t_done:null,        state:"S5 → abandoned", source:null, paused:false },
  ],
};

window.QUESTION_BANK = QUESTION_BANK;
window.QUEUE_BY_INTENT = QUEUE_BY_INTENT;
window.QUEUE_CTA_EXAMPLE = QUEUE_CTA_EXAMPLE;
window.SAMPLE_SESSION = SAMPLE_SESSION;
window.FUNNEL_ANALYTICS = FUNNEL_ANALYTICS;
