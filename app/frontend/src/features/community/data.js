// Community seed data. Mirrors the visual prototype's data-community.jsx
// (docs/reference/UI_claude-code/data-community.jsx) so the production UI
// can render the exact same spaces / channels / threads / users when the
// backend is empty or unreachable.

export const COMMUNITY_USERS = {
  u_aarav: { id: "u_aarav", name: "Aarav Mehra", handle: "@aarav.m", role: "aspirant", exam: "UPSC CSE 2026", joined: "Oct 2025", avatarColor: "#A68057" },
  u_kavya: { id: "u_kavya", name: "Kavya Iyer", handle: "@kavya_ias", role: "topper", badge: { kind: "topper", rank: "AIR 42", exam: "CSE 2024" }, avatarColor: "#54794E" },
  u_arjun: { id: "u_arjun", name: "Arjun S.", handle: "@arjun.s", role: "officer", badge: { kind: "officer", post: "IPS · 2023 batch" }, avatarColor: "#524864" },
  u_ritu: { id: "u_ritu", name: "Ritu Patel", handle: "@ritu.cse", role: "topper", badge: { kind: "topper", rank: "AIR 117", exam: "CSE 2023" }, avatarColor: "#41603D" },
  u_neha: { id: "u_neha", name: "Neha Verma", handle: "@neha.v", role: "mentor", badge: { kind: "mentor", since: "2024" }, avatarColor: "#8A6846" },
  u_zaid: { id: "u_zaid", name: "Zaid Khan", handle: "@zaid.ssc", role: "aspirant", exam: "SSC CGL 2026", avatarColor: "#6C5038" },
  u_pooja: { id: "u_pooja", name: "Pooja Iyer", handle: "@pooja.i", role: "aspirant", exam: "RBI Grade B 2026", avatarColor: "#8F86A1" },
  u_rohit: { id: "u_rohit", name: "Rohit Sen", handle: "@rohit.s", role: "aspirant", exam: "SSC CGL 2026", avatarColor: "#BE9C6B" },
  u_anjali: { id: "u_anjali", name: "Anjali D.", handle: "@anjali.d", role: "aspirant", exam: "UPSC CSE 2026", avatarColor: "#6D637F" },
  u_admin: { id: "u_admin", name: "CCP Team", handle: "@ccp", role: "admin", badge: { kind: "admin" }, avatarColor: "#2E2218" },
  u_aman: { id: "u_aman", name: "Aman R.", handle: "@aman.r", role: "aspirant", exam: "UPSC CSE 2026", avatarColor: "#94B28A" },
  u_isha: { id: "u_isha", name: "Isha Trivedi", handle: "@isha.ias", role: "topper", badge: { kind: "topper", rank: "AIR 8", exam: "CSE 2022" }, avatarColor: "#54794E" },
};

export const COMMUNITY_SPACES = [
  {
    id: "upsc-cse", name: "UPSC CSE", short: "UC", color: "#54794E", tone: "sage",
    members: 24180, online: 1842, verifiedToppers: 41, mentors: 28,
    pinNote: "Most active space · 5 channels · 12 active groups",
    channels: [
      { id: "u-official", name: "official-updates", purpose: "Admin-write only · official UPSC notifications", lockedAdminWrite: true, unread: 2, lastActiveAt: "2h", pinned: 1, members: 24180 },
      { id: "u-form", name: "form-help", purpose: "Questions about application, fee, documents", unread: 14, lastActiveAt: "6m", pinned: 2, members: 14206 },
      { id: "u-prep", name: "preparation", purpose: "Strategy · resources · books · coaching opinions", unread: 38, lastActiveAt: "now", pinned: 3, members: 21042 },
      { id: "u-pyq", name: "pyq-discussion", purpose: "Question-level discussion · answer verification", unread: 9, lastActiveAt: "22m", pinned: 2, members: 18774 },
      { id: "u-cutoff", name: "cutoffs-results", purpose: "Cutoff sharing · result reactions · ranks", unread: 0, lastActiveAt: "3h", pinned: 1, members: 12940 },
    ],
  },
  {
    id: "ssc-cgl", name: "SSC CGL", short: "SC", color: "#A68057", tone: "clay",
    members: 18420, online: 1206, verifiedToppers: 14, mentors: 9,
    pinNote: "Tier-1 prep peak season · check #form-help for new portal",
    channels: [
      { id: "s-official", name: "official-updates", purpose: "Admin-write only · official SSC notifications", lockedAdminWrite: true, unread: 1, lastActiveAt: "4h", pinned: 1, members: 18420 },
      { id: "s-form", name: "form-help", purpose: "Application portal issues, photo, signature, payments", unread: 22, lastActiveAt: "3m", pinned: 1, members: 11420 },
      { id: "s-prep", name: "preparation", purpose: "Strategy · books · drills · daily plans", unread: 11, lastActiveAt: "18m", pinned: 2, members: 14002 },
      { id: "s-pyq", name: "pyq-discussion", purpose: "Question-level discussion · answer verification", unread: 0, lastActiveAt: "1h", pinned: 1, members: 9210 },
      { id: "s-cutoff", name: "cutoffs-results", purpose: "Cutoff sharing · result reactions", unread: 0, lastActiveAt: "6h", pinned: 0, members: 7820 },
    ],
  },
  {
    id: "ibps-po", name: "IBPS PO", short: "IB", color: "#524864", tone: "dusk",
    members: 9740, online: 612, verifiedToppers: 6, mentors: 4,
    pinNote: "Prelims weeks — daily mock threads in #preparation",
    channels: [
      { id: "i-official", name: "official-updates", purpose: "Admin-write only · official IBPS notifications", lockedAdminWrite: true, unread: 0, lastActiveAt: "1d", pinned: 1, members: 9740 },
      { id: "i-form", name: "form-help", purpose: "Application portal · photo · signature · fee", unread: 3, lastActiveAt: "42m", pinned: 0, members: 5210 },
      { id: "i-prep", name: "preparation", purpose: "Strategy · daily mock threads · books", unread: 6, lastActiveAt: "12m", pinned: 1, members: 7320 },
      { id: "i-pyq", name: "pyq-discussion", purpose: "Question-level discussion · answer verification", unread: 0, lastActiveAt: "5h", pinned: 0, members: 4108 },
      { id: "i-cutoff", name: "cutoffs-results", purpose: "Cutoff sharing · result reactions", unread: 0, lastActiveAt: "2d", pinned: 0, members: 3220 },
    ],
  },
  {
    id: "rbi-grb", name: "RBI Grade B", short: "RB", color: "#41603D", tone: "sage",
    members: 4180, online: 240, verifiedToppers: 3, mentors: 2,
    pinNote: "Phase I window · 6 days",
    channels: [
      { id: "r-official", name: "official-updates", purpose: "Admin-write only · official RBI notifications", lockedAdminWrite: true, unread: 0, lastActiveAt: "2d", pinned: 1, members: 4180 },
      { id: "r-form", name: "form-help", purpose: "Application portal · uploads · payments", unread: 1, lastActiveAt: "5h", pinned: 0, members: 2110 },
      { id: "r-prep", name: "preparation", purpose: "Phase I + ESI/FM strategy · books · drills", unread: 0, lastActiveAt: "1h", pinned: 0, members: 3240 },
      { id: "r-pyq", name: "pyq-discussion", purpose: "Question-level discussion · answer verification", unread: 0, lastActiveAt: "3d", pinned: 0, members: 1880 },
      { id: "r-cutoff", name: "cutoffs-results", purpose: "Cutoff sharing · result reactions", unread: 0, lastActiveAt: "1w", pinned: 0, members: 1410 },
    ],
  },
  {
    id: "general", name: "General", short: "Gn", color: "#6C5038", tone: "clay", isGeneral: true,
    members: 38740, online: 2840, verifiedToppers: 0, mentors: 0,
    pinNote: "Cross-exam · everyone welcome · no exam-specific PYQ here",
    channels: [
      { id: "g-motivation", name: "motivation", purpose: "Wins · streaks · milestones · setbacks", unread: 5, lastActiveAt: "2m", pinned: 1, members: 30210 },
      { id: "g-groups", name: "study-groups", purpose: "Find partners and form groups", unread: 2, lastActiveAt: "14m", pinned: 0, members: 14020 },
      { id: "g-resources", name: "resources", purpose: "Free resource links · admin-curated", unread: 0, lastActiveAt: "1h", pinned: 2, members: 22418 },
    ],
  },
];

export const FLAIRS = {
  question: { label: "Question", tone: "dusk" },
  strategy: { label: "Strategy", tone: "sage" },
  resource: { label: "Resource", tone: "clay" },
  discussion: { label: "Discussion", tone: "outline" },
  "mock-report": { label: "Mock report", tone: "amber" },
  formhelp: { label: "Form help", tone: "amber" },
  cutoff: { label: "Cutoff", tone: "rose" },
  result: { label: "Result", tone: "sage" },
  notice: { label: "Notice", tone: "ink" },
  experience: { label: "Experience", tone: "dusk" },
  meta: { label: "Meta", tone: "outline" },
};

export const THREADS = {
  "u-prep": [
    { id: "t1", channelId: "u-prep", flair: "strategy", pinned: true,
      title: "108 days to Prelims — a calm 6-hour-a-day plan that actually works",
      body: "I've been at this for 14 months and finally have a stable rhythm. Sharing what changed for me in the last 8 weeks: spaced revision (not endless re-reading), one full mock every Sunday with a 90-min review block on Monday, and ruthless trimming of source list. Long post, ask anything below.",
      author: "u_kavya", upvotes: 842, downvotes: 14, replies: 127, createdAt: "4h", solved: false,
      planRelevant: { topic: "Plan strategy", reason: "Matches your Prelims phase" },
      topReplies: [
        { id: "r1", author: "u_isha", upvotes: 212, body: "Strong post. One addition — verified toppers under-emphasize the importance of mock review latency. If you take a mock and review > 48h later you may as well not have taken it." },
        { id: "r2", author: "u_arjun", upvotes: 154, body: "Officer here — second the spaced revision point. The first 6 months I revised once, the second 6 months I revised 4x. Result tells you which strategy worked." },
        { id: "r3", author: "u_aarav", upvotes: 38, body: "Saved this. Question — how did you handle Economy when monetary policy kept changing? My plan keeps adapting to news." },
      ],
    },
    { id: "t2", channelId: "u-prep", flair: "question",
      title: "Optional subject choice — Public Admin vs Sociology in 2026?",
      body: "I'm at the crossroads. Public Admin has the addendum (digital governance now in II.3) but the scoring is unpredictable. Sociology feels scorable but coaching options have shrunk. Anyone made this call recently?",
      author: "u_aman", upvotes: 208, downvotes: 6, replies: 64, createdAt: "7h", topReplies: [] },
    { id: "t3", channelId: "u-prep", flair: "resource",
      title: "Free: my 47-page Polity Federalism notes (Centre–State + Emergency)",
      body: "Drive link in comments. Covers Article 263 + recent commission reports. Reviewed by a verified topper, but please flag errors.",
      author: "u_ritu", upvotes: 1241, downvotes: 18, replies: 89, createdAt: "1d", saved: true,
      planRelevant: { topic: "Polity · Federalism", reason: "Your weak topic" }, topReplies: [] },
    { id: "t4", channelId: "u-prep", flair: "mock-report",
      title: "Mock 14 — 122/200. Sharing my full error breakdown.",
      body: "Concept gaps 6 · time pressure 4 · misread 2 · guess 1. Asking for feedback on whether to slow down or push harder.",
      author: "u_anjali", upvotes: 96, downvotes: 3, replies: 38, createdAt: "9h", topReplies: [] },
    { id: "t5", channelId: "u-prep", flair: "discussion",
      title: "Did anyone else feel the Prelims 2024 ethics-style question creep?",
      body: "Some questions felt more inferential, less factual. Wondering if this is a permanent pattern shift or one-cycle noise.",
      author: "u_aarav", upvotes: 48, downvotes: 11, replies: 22, createdAt: "3h", topReplies: [] },
    { id: "t6", channelId: "u-prep", flair: "strategy",
      title: "How I balance Current Affairs with deep Polity — without burning out",
      body: "15-min morning digest, no PDF dumps. Tagging back to syllabus topics inside Notion. Sharing template.",
      author: "u_neha", upvotes: 340, downvotes: 5, replies: 51, createdAt: "2d", topReplies: [] },
  ],
  "u-official": [
    { id: "o1", channelId: "u-official", flair: "notice", pinned: true,
      title: "CSE 2026 — Notification released",
      body: "Application window opens May 22, 2026. Prelims on Aug 30, 2026. Pre-exam training and addendum to Public Administration syllabus (Section II.3) are now live. Read full notification linked below.",
      author: "u_admin", upvotes: 3210, downvotes: 0, replies: 0,
      createdAt: "3d", verifiedSource: "upsc.gov.in/notifications/cse-2026", repliesLocked: true },
    { id: "o2", channelId: "u-official", flair: "notice",
      title: "Public Admin · syllabus addendum (4 µtopics added)",
      body: "Section II Topic 3 expanded to include digital governance frameworks, e-Pramaan, DigiLocker case studies, and Aadhaar legal architecture. Subject tree v2026.1 deployed.",
      author: "u_admin", upvotes: 1812, downvotes: 2, replies: 0,
      createdAt: "3d", verifiedSource: "upsc.gov.in/syllabus-2026-addendum.pdf", repliesLocked: true },
  ],
  "u-form": [
    { id: "f1", channelId: "u-form", flair: "formhelp", pinned: true,
      title: "Read first — common form errors (photo, sig, declaration)",
      body: "60% of rejected applications fail on photo dimensions, signature mismatch, or missing declaration check. Step-by-step checklist below.",
      author: "u_admin", upvotes: 980, downvotes: 0, replies: 42, createdAt: "5d", topReplies: [] },
    { id: "f2", channelId: "u-form", flair: "question",
      title: "OBC NCL — can I use a March 2026 dated certificate?",
      body: "Mine is dated March 12, 2026. Notification says \"valid as on date of application\". Confused about cut-off.",
      author: "u_zaid", upvotes: 34, downvotes: 1, replies: 9, createdAt: "38m", topReplies: [] },
    { id: "f3", channelId: "u-form", flair: "question",
      title: "EWS certificate from last year — accepted?",
      body: "Got it issued in Feb 2025. Reading conflicting threads. Anyone confirmed with their CSC?",
      author: "u_pooja", upvotes: 18, downvotes: 2, replies: 14, createdAt: "2h", topReplies: [] },
  ],
  "u-pyq": [
    { id: "p1", channelId: "u-pyq", flair: "question", pinned: true,
      title: "2022 Q41 — Article 263 question · official answer key clash",
      body: "Official key marks (C). UPSC ToL gives (B). Many coaching keys split. What's the verified read?",
      author: "u_kavya", upvotes: 642, downvotes: 6, replies: 48, createdAt: "1d", topReplies: [],
      planRelevant: { topic: "Polity · Federalism", reason: "Your weak topic" } },
    { id: "p2", channelId: "u-pyq", flair: "discussion",
      title: "2023 Q07 — economy + monetary policy combo. Which textbook covers this?",
      body: "Looking for a clean derivation rather than current-affairs notes.",
      author: "u_aarav", upvotes: 88, downvotes: 1, replies: 14, createdAt: "4h", topReplies: [] },
  ],
  "u-cutoff": [],
  "s-official": [],
  "s-form": [
    { id: "sf1", channelId: "s-form", flair: "formhelp", pinned: true,
      title: "New SSC portal: how to upload signature without 'invalid format' error",
      body: "PNG vs JPG, dimensions, background. Step-by-step.",
      author: "u_admin", upvotes: 520, downvotes: 2, replies: 30, createdAt: "3d", topReplies: [] },
    { id: "sf2", channelId: "s-form", flair: "question",
      title: "Fee not deducted but portal shows 'pending'. Is this normal?",
      body: "SBI net banking · transaction shows successful · CGL portal status: pending.",
      author: "u_rohit", upvotes: 38, downvotes: 0, replies: 21, createdAt: "12m", topReplies: [] },
  ],
  "s-prep": [], "s-pyq": [], "s-cutoff": [],
  "i-official": [], "i-form": [], "i-prep": [], "i-pyq": [], "i-cutoff": [],
  "r-official": [], "r-form": [], "r-prep": [], "r-pyq": [], "r-cutoff": [],
  "g-motivation": [
    { id: "m1", channelId: "g-motivation", flair: "experience", pinned: true,
      title: "Failed Prelims 3 times. Cleared CSE 2024. AMA.",
      body: "Posting this not for sympathy but in case someone is in attempt 3 thinking it's over. It isn't. Long story below.",
      author: "u_isha", upvotes: 4218, downvotes: 42, replies: 312, createdAt: "5d", topReplies: [] },
    { id: "m2", channelId: "g-motivation", flair: "discussion",
      title: "How do you handle the post-mock crash?",
      body: "After every mock I lose 2 days to a low. Anyone solved this?",
      author: "u_anjali", upvotes: 154, downvotes: 6, replies: 88, createdAt: "3h", topReplies: [] },
  ],
  "g-groups": [
    { id: "gg1", channelId: "g-groups", flair: "discussion",
      title: "UPSC CSE Morning Batch — 06:00–08:00 IST · 4 spots left (of 8)",
      body: "We do a 30-min Polity revision + 60-min focused block + 30-min answer-write. Daily. Need committed people only.",
      author: "u_aarav", upvotes: 62, downvotes: 1, replies: 24, createdAt: "6h", topReplies: [] },
  ],
  "g-resources": [
    { id: "gr1", channelId: "g-resources", flair: "resource", pinned: true,
      title: "Master list — free, admin-vetted study resources",
      body: "Sorted by exam and source. All links re-verified Apr 2026.",
      author: "u_admin", upvotes: 2840, downvotes: 6, replies: 42, createdAt: "2w", topReplies: [] },
  ],
};

export const CHANNEL_RULES = {
  official: [
    "Admin-write only. Posts mirror /admin/exam-intelligence verified updates.",
    "Replies are locked. Use #form-help or #preparation for questions.",
    "Every post links to its official source with a verified signature.",
  ],
  form: [
    "Application, fee, documents only. No strategy debates here.",
    "Cite the official notification when you assert a rule.",
    "Verified Topper / Officer answers are visually distinguished.",
  ],
  prep: [
    "Strategy, resources, books, coaching opinions. No spam.",
    "Use flairs — Question, Strategy, Resource, Discussion, Mock report.",
    "Brigading and one-line gloats are removed.",
  ],
  pyq: [
    "Question-level discussion. Cite year and question number.",
    "Verified Topper answers float to the top after admin review.",
    "Don't post answer keys without provenance.",
  ],
  cutoff: [
    "Verified marks/rank only. Use Verified Topper badge or scorecard upload.",
    "Speculation marked clearly with the 'speculation' flair.",
  ],
  motivation: [
    "No toxic comparison. No 'I studied 14h, you should too'.",
    "Setbacks welcome. Hostile pile-ons are removed.",
  ],
  groups: [
    "Post group invites only. No off-topic study questions.",
    "Use the Find a group page for richer match-making.",
  ],
  resources: [
    "Source trust: official / community / coaching / unknown. Tag every link.",
    "Pirated paid material is removed regardless of upvotes.",
  ],
};

export function rulesKeyFor(channel) {
  if (!channel) return "prep";
  if (channel.lockedAdminWrite) return "official";
  const n = channel.name || "";
  if (n.includes("form")) return "form";
  if (n.includes("pyq")) return "pyq";
  if (n.includes("cutoff")) return "cutoff";
  if (n.includes("motivation")) return "motivation";
  if (n.includes("group")) return "groups";
  if (n.includes("resource")) return "resources";
  return "prep";
}

/* ── Study groups (mirrors data-community.jsx STUDY_GROUPS) ───────────── */
export const STUDY_GROUPS = [
  { id: "g1", name: "UPSC CSE 2026 — Morning Batch", exam: "UPSC CSE 2026",
    visibility: "open", status: "active", capacity: 8, members: 6,
    weeklyHoursGoal: 30, weeklyTasksGoal: 42, weeklyHoursDone: 24, weeklyTasksDone: 31,
    streakDays: 18, founder: "u_aarav", schedule: "Mon–Sat · 06:00–08:00 IST",
    nextSession: { title: "Polity · Federalism revision", at: "Tomorrow · 06:00", agenda: "Centre–State + Emergency provisions" },
    isMine: true },
  { id: "g2", name: "UPSC CSE 2026 — Optional: Pub Ad", exam: "UPSC CSE 2026",
    visibility: "invite-only", status: "active", capacity: 6, members: 5,
    weeklyHoursGoal: 18, weeklyTasksGoal: 24, weeklyHoursDone: 14, weeklyTasksDone: 18,
    streakDays: 9, founder: "u_kavya", schedule: "Tue · Thu · Sat · 20:00 IST",
    nextSession: { title: "Section II.3 — digital governance addendum", at: "Today · 20:00", agenda: "e-Pramaan + DigiLocker" } },
  { id: "g3", name: "SSC CGL 2026 — Tier 1 Sprint", exam: "SSC CGL 2026",
    visibility: "open", status: "active", capacity: 8, members: 8,
    weeklyHoursGoal: 24, weeklyTasksGoal: 30, weeklyHoursDone: 22, weeklyTasksDone: 28,
    streakDays: 32, founder: "u_zaid", schedule: "Daily · 19:00–21:00 IST",
    nextSession: { title: "Quant revision — Percentage & Ratio", at: "Today · 19:00", agenda: "60 Qs in 50m + review" } },
  { id: "g4", name: "RBI Grade B — Phase 1 Final Lap", exam: "RBI Grade B 2026",
    visibility: "invite-only", status: "active", capacity: 5, members: 4,
    weeklyHoursGoal: 15, weeklyTasksGoal: 20, weeklyHoursDone: 11, weeklyTasksDone: 15,
    streakDays: 6, founder: "u_pooja", schedule: "Sun · 11:00 IST",
    nextSession: { title: "ESI Mock review", at: "Sun · 11:00", agenda: "Mock 6 walkthrough" } },
  { id: "g5", name: "UPSC CSE 2026 — Evening Mocks", exam: "UPSC CSE 2026",
    visibility: "open", status: "paused", capacity: 6, members: 3,
    weeklyHoursGoal: 12, weeklyTasksGoal: 18, weeklyHoursDone: 0, weeklyTasksDone: 0,
    streakDays: 0, founder: "u_anjali", schedule: "Sat · 18:00 IST", nextSession: null },
];

export const STUDY_ROOM_SESSIONS = [
  { id: "sr1", groupId: "g1", title: "Polity · Federalism revision", at: "Tomorrow · 06:00", duration: "120m", platform: "Google Meet", platformLink: "meet.google.com/abc-xxxx", maxParticipants: 8, confirmed: 5, agenda: "Centre–State + Emergency provisions", status: "scheduled" },
  { id: "sr2", groupId: "g3", title: "Quant revision — % & Ratio", at: "Today · 19:00", duration: "120m", platform: "Zoom", platformLink: "zoom.us/j/yyyy", maxParticipants: 8, confirmed: 8, agenda: "60 Qs in 50m + review", status: "scheduled" },
  { id: "sr3", groupId: "g2", title: "Pub Ad addendum walk-through", at: "Today · 20:00", duration: "90m", platform: "Jitsi", platformLink: "meet.jit.si/pub-ad-2026", maxParticipants: 6, confirmed: 4, agenda: "e-Pramaan + DigiLocker", status: "scheduled" },
];

/* ── Accountability partner ───────────────────────────────────────────── */
export const ACCOUNTABILITY = {
  partner: { userId: "u_aman", since: "Mar 11, 2026", streakDays: 34, exam: "UPSC CSE 2026" },
  selfCommitment: { hoursPerWeek: 42, tasksPerWeek: 50, mocksPerWeek: 2 },
  partnerCommitment: { hoursPerWeek: 38, tasksPerWeek: 46, mocksPerWeek: 2 },
  thisWeek: {
    self: { hours: 38.5, tasks: 41, mocks: 1, checkedInDays: [true, true, true, true, true, false, false] },
    partner: { hours: 36.2, tasks: 39, mocks: 1, checkedInDays: [true, true, true, true, false, false, false] },
  },
  recentCheckIns: [
    { date: "May 14", self: "Did it · 6h focus · Mock 14 tonight", partner: "Did it · 5.5h · Mock 14 prep" },
    { date: "May 13", self: "Did it · 5h · M13 review delayed", partner: "Skipped · sick day" },
    { date: "May 12", self: "Did it · 7h · Polity Ch.1–4 done", partner: "Did it · 6.5h · Polity Ch.1–4 done" },
    { date: "May 11", self: "Did it · 6h", partner: "Did it · 6h" },
    { date: "May 10", self: "Did it · 5h", partner: "Did it · 5.5h" },
  ],
  weeklyReviewQ: [
    "Did your plan match your reality this week?",
    "Which task did you avoid most? Why?",
    "What will be different next week?",
  ],
  candidates: [
    { id: "u_pooja", match: 0.78, why: "Same phase · similar mock cadence · morning person" },
    { id: "u_rohit", match: 0.62, why: "Different exam but overlapping subjects (Quant, English)" },
  ],
};

/* ── Mentors ──────────────────────────────────────────────────────────── */
export const MENTORS = [
  { id: "u_kavya", name: "Kavya Iyer", badge: "AIR 42 · CSE 2024", price: [149, 249], rating: 4.8, sessions: 24, served: 412, topics: ["Prelims strategy", "Optional: Public Admin", "Mains GS-2"], blurb: "Verified Topper. 6 months of evening sessions on Prelims pacing.", color: "#54794E" },
  { id: "u_arjun", name: "Arjun S.", badge: "IPS · 2023 batch", price: [199, 299], rating: 4.9, sessions: 38, served: 740, topics: ["Mains answer-writing", "Interview prep", "Optional: Sociology"], blurb: "Serving Officer. Honest read on what the form actually looks like.", color: "#524864" },
  { id: "u_isha", name: "Isha Trivedi", badge: "AIR 8 · CSE 2022", price: [249, 299], rating: 4.7, sessions: 18, served: 286, topics: ["Optional: Pub Ad", "Test series strategy", "Burnout management"], blurb: "Cleared in attempt 4 after a full-time job. Practical, no romanticism.", color: "#94B28A" },
  { id: "u_neha", name: "Neha Verma", badge: "Mentor · 2024", price: [99, 199], rating: 4.6, sessions: 42, served: 920, topics: ["Time management", "Daily compiler", "Mock review"], blurb: "Career Copilot mentor. Spent 14 months optimizing daily study plans.", color: "#8A6846" },
  { id: "u_ritu", name: "Ritu Patel", badge: "AIR 117 · CSE 2023", price: [99, 199], rating: 4.5, sessions: 12, served: 188, topics: ["Polity deep", "Federalism workshop", "Notes-making"], blurb: "Verified Topper. Strong on Polity & Constitution.", color: "#41603D" },
];

export const MENTOR_SESSIONS = [
  { id: "ms1", mentorId: "u_kavya", title: "How I built a 108-day Prelims plan around weak topics",
    tags: ["UPSC CSE", "Prelims", "Strategy"], at: "Sat May 18 · 20:00 IST", duration: "90m",
    capacity: 50, booked: 32, price: 199, platform: "Daily.co", status: "booking_open" },
  { id: "ms2", mentorId: "u_arjun", title: "Honest Mains GS-2: what was actually scored in CSE 2023",
    tags: ["UPSC CSE", "Mains", "GS-2"], at: "Sun May 19 · 11:00 IST", duration: "60m",
    capacity: 50, booked: 48, price: 249, platform: "Daily.co", status: "booking_open" },
  { id: "ms3", mentorId: "u_neha", title: "Mock review workshop · turn 122/200 into 140/200",
    tags: ["UPSC CSE", "Mocks"], at: "Wed May 22 · 19:00 IST", duration: "90m",
    capacity: 50, booked: 14, price: 149, platform: "Jitsi", status: "booking_open" },
  { id: "ms4", mentorId: "u_isha", title: "Burnout: how I came back in attempt 4",
    tags: ["UPSC CSE", "Mental model"], at: "Fri May 24 · 20:00 IST", duration: "60m",
    capacity: 50, booked: 21, price: 99, platform: "Daily.co", status: "booking_open" },
];

export const MENTOR_EARNINGS = {
  total: 43050, pending: 8750, completed: 12, served: 287, avgRating: 4.7,
  payouts: [
    { at: "May 02 · 14:18", amount: 9450, ref: "PAY-2026-04-K42", status: "paid" },
    { at: "Apr 04 · 12:01", amount: 11200, ref: "PAY-2026-03-K42", status: "paid" },
    { at: "Mar 04 · 16:44", amount: 8400, ref: "PAY-2026-02-K42", status: "paid" },
    { at: "Feb 04 · 11:22", amount: 5250, ref: "PAY-2026-01-K42", status: "paid" },
  ],
  monthly: [
    { m: "Dec", v: 5200 }, { m: "Jan", v: 5250 }, { m: "Feb", v: 8400 },
    { m: "Mar", v: 11200 }, { m: "Apr", v: 9450 }, { m: "May", v: 8750, pending: true },
  ],
};

/* ── Resource library ─────────────────────────────────────────────────── */
export const RESOURCES = [
  { id: "res1", title: "UPSC CSE 2026 Notification (PDF)", type: "strategy_guide", exam: "UPSC CSE", subject: "Meta", sourceTrust: "official", contributedBy: "u_admin", upvotes: 3210, verifiedByTopper: false, createdAt: "3d", size: "4.2 MB" },
  { id: "res2", title: "Federalism · 47-page notes", type: "notes", exam: "UPSC CSE", subject: "Polity", sourceTrust: "community", contributedBy: "u_ritu", upvotes: 1241, verifiedByTopper: true, createdAt: "1d", size: "2.1 MB" },
  { id: "res3", title: "PYQ archive · Polity 2018–2024", type: "pyq_paper", exam: "UPSC CSE", subject: "Polity", sourceTrust: "official", contributedBy: "u_admin", upvotes: 2842, verifiedByTopper: false, createdAt: "2w", size: "12.6 MB" },
  { id: "res4", title: "Economy · Monetary policy summary", type: "notes", exam: "UPSC CSE", subject: "Economy", sourceTrust: "coaching", contributedBy: "u_neha", upvotes: 412, verifiedByTopper: false, createdAt: "5d", size: "880 KB" },
  { id: "res5", title: "Daily compiler template (Notion)", type: "video_link", exam: "UPSC CSE", subject: "Meta", sourceTrust: "community", contributedBy: "u_aarav", upvotes: 208, verifiedByTopper: false, createdAt: "1w", size: "link" },
  { id: "res6", title: "SSC CGL Quant — Percentage shortcuts", type: "notes", exam: "SSC CGL", subject: "Quant", sourceTrust: "community", contributedBy: "u_zaid", upvotes: 312, verifiedByTopper: false, createdAt: "4d", size: "1.4 MB" },
  { id: "res7", title: "Laxmikanth · chapter map (handwritten)", type: "book", exam: "UPSC CSE", subject: "Polity", sourceTrust: "unknown", contributedBy: "u_anjali", upvotes: 88, verifiedByTopper: false, createdAt: "3d", size: "3.1 MB", flagged: true },
  { id: "res8", title: "IPS interview transcript · 2023 batch", type: "strategy_guide", exam: "UPSC CSE", subject: "Interview", sourceTrust: "community", contributedBy: "u_arjun", upvotes: 914, verifiedByTopper: true, createdAt: "2w", size: "640 KB" },
];
