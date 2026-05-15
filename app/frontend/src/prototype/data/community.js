// Prototype mock data — community/groups/mentors/resources.
// Ported from docs/reference/UI_claude-code/data-community.jsx.

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

export const CHANNEL_RULES = {
  official: [
    "Admin-write only. Posts mirror /admin/exam-intelligence verified updates.",
    "Replies are locked. Use #form-help or #preparation for questions.",
    "Every post links to its official source with a verified signature.",
  ],
  prep: [
    "Strategy, resources, books, coaching opinions. No spam.",
    "Use flairs — Question, Strategy, Resource, Discussion, Mock report.",
    "Brigading and one-line gloats are removed.",
  ],
};

export const STUDY_GROUPS = [
  {
    id: "g1", name: "UPSC CSE 2026 — Morning Batch", exam: "UPSC CSE 2026",
    visibility: "open", status: "active", capacity: 8, members: 6,
    weeklyHoursGoal: 30, weeklyTasksGoal: 42, weeklyHoursDone: 24, weeklyTasksDone: 31,
    streakDays: 18, founder: "u_aarav",
    schedule: "Mon–Sat · 06:00–08:00 IST",
    nextSession: { title: "Polity · Federalism revision", at: "Tomorrow · 06:00", agenda: "Centre–State + Emergency provisions" },
    isMine: true,
  },
  {
    id: "g2", name: "UPSC CSE 2026 — Optional: Pub Ad", exam: "UPSC CSE 2026",
    visibility: "invite-only", status: "active", capacity: 6, members: 5,
    weeklyHoursGoal: 18, weeklyTasksGoal: 24, weeklyHoursDone: 14, weeklyTasksDone: 18,
    streakDays: 9, founder: "u_kavya",
    schedule: "Tue · Thu · Sat · 20:00 IST",
    nextSession: { title: "Section II.3 — digital governance addendum", at: "Today · 20:00", agenda: "e-Pramaan + DigiLocker" },
  },
  {
    id: "g3", name: "SSC CGL 2026 — Tier 1 Sprint", exam: "SSC CGL 2026",
    visibility: "open", status: "active", capacity: 8, members: 8,
    weeklyHoursGoal: 24, weeklyTasksGoal: 30, weeklyHoursDone: 22, weeklyTasksDone: 28,
    streakDays: 32, founder: "u_zaid",
    schedule: "Daily · 19:00–21:00 IST",
    nextSession: { title: "Quant revision — Percentage & Ratio", at: "Today · 19:00", agenda: "60 Qs in 50m + review" },
  },
  {
    id: "g4", name: "RBI Grade B — Phase 1 Final Lap", exam: "RBI Grade B 2026",
    visibility: "invite-only", status: "active", capacity: 5, members: 4,
    weeklyHoursGoal: 15, weeklyTasksGoal: 20, weeklyHoursDone: 11, weeklyTasksDone: 15,
    streakDays: 6, founder: "u_pooja",
    schedule: "Sun · 11:00 IST",
    nextSession: { title: "ESI Mock review", at: "Sun · 11:00", agenda: "Mock 6 walkthrough" },
  },
  {
    id: "g5", name: "UPSC CSE 2026 — Evening Mocks", exam: "UPSC CSE 2026",
    visibility: "open", status: "paused", capacity: 6, members: 3,
    weeklyHoursGoal: 12, weeklyTasksGoal: 18, weeklyHoursDone: 0, weeklyTasksDone: 0,
    streakDays: 0, founder: "u_anjali",
    schedule: "Sat · 18:00 IST", nextSession: null,
  },
];

export const STUDY_ROOM_SESSIONS = [
  { id: "sr1", groupId: "g1", title: "Polity · Federalism revision", at: "Tomorrow · 06:00", duration: "120m", platform: "Google Meet", platformLink: "meet.google.com/abc-xxxx", maxParticipants: 8, confirmed: 5, agenda: "Centre–State + Emergency provisions", status: "scheduled" },
  { id: "sr2", groupId: "g3", title: "Quant revision — % & Ratio", at: "Today · 19:00", duration: "120m", platform: "Zoom", platformLink: "zoom.us/j/yyyy", maxParticipants: 8, confirmed: 8, agenda: "60 Qs in 50m + review", status: "scheduled" },
  { id: "sr3", groupId: "g2", title: "Pub Ad addendum walk-through", at: "Today · 20:00", duration: "90m", platform: "Jitsi", platformLink: "meet.jit.si/pub-ad-2026", maxParticipants: 6, confirmed: 4, agenda: "e-Pramaan + DigiLocker", status: "scheduled" },
];

export const MENTORS = [
  { id: "u_kavya", name: "Kavya Iyer", badge: "AIR 42 · CSE 2024", price: [149, 249], rating: 4.8, sessions: 24, served: 412, topics: ["Prelims strategy", "Optional: Public Admin", "Mains GS-2"], blurb: "Verified Topper. 6 months of evening sessions on Prelims pacing.", color: "#54794E" },
  { id: "u_arjun", name: "Arjun S.", badge: "IPS · 2023 batch", price: [199, 299], rating: 4.9, sessions: 38, served: 740, topics: ["Mains answer-writing", "Interview prep", "Optional: Sociology"], blurb: "Serving Officer. Honest read on what the form actually looks like.", color: "#524864" },
  { id: "u_isha", name: "Isha Trivedi", badge: "AIR 8 · CSE 2022", price: [249, 299], rating: 4.7, sessions: 18, served: 286, topics: ["Optional: Pub Ad", "Test series strategy", "Burnout management"], blurb: "Cleared in attempt 4 after a full-time job. Practical, no romanticism.", color: "#94B28A" },
  { id: "u_neha", name: "Neha Verma", badge: "Mentor · 2024", price: [99, 199], rating: 4.6, sessions: 42, served: 920, topics: ["Time management", "Daily compiler", "Mock review"], blurb: "Career Copilot mentor. Spent 14 months optimizing daily study plans.", color: "#8A6846" },
  { id: "u_ritu", name: "Ritu Patel", badge: "AIR 117 · CSE 2023", price: [99, 199], rating: 4.5, sessions: 12, served: 188, topics: ["Polity deep", "Federalism workshop", "Notes-making"], blurb: "Verified Topper. Strong on Polity & Constitution.", color: "#41603D" },
];

export const MENTOR_SESSIONS = [
  { id: "ms1", mentorId: "u_kavya", title: "How I built a 108-day Prelims plan around weak topics", tags: ["UPSC CSE", "Prelims", "Strategy"], at: "Sat May 18 · 20:00 IST", duration: "90m", capacity: 50, booked: 32, price: 199, platform: "Daily.co", status: "booking_open" },
  { id: "ms2", mentorId: "u_arjun", title: "Honest Mains GS-2: what was actually scored in CSE 2023", tags: ["UPSC CSE", "Mains", "GS-2"], at: "Sun May 19 · 11:00 IST", duration: "60m", capacity: 50, booked: 48, price: 249, platform: "Daily.co", status: "booking_open" },
  { id: "ms3", mentorId: "u_neha", title: "Mock review workshop · turn 122/200 into 140/200", tags: ["UPSC CSE", "Mocks"], at: "Wed May 22 · 19:00 IST", duration: "90m", capacity: 50, booked: 14, price: 149, platform: "Jitsi", status: "booking_open" },
  { id: "ms4", mentorId: "u_isha", title: "Burnout: how I came back in attempt 4", tags: ["UPSC CSE", "Mental model"], at: "Fri May 24 · 20:00 IST", duration: "60m", capacity: 50, booked: 21, price: 99, platform: "Daily.co", status: "booking_open" },
];

export const MENTOR_EARNINGS = {
  total: 43050, pending: 8750, completed: 12, served: 287, avgRating: 4.7,
  payouts: [
    { at: "May 02 · 14:18", amount: 9450, ref: "PAY-2026-04-K42", status: "paid" },
    { at: "Apr 04 · 12:01", amount: 11200, ref: "PAY-2026-03-K42", status: "paid" },
    { at: "Mar 04 · 16:44", amount: 8400, ref: "PAY-2026-02-K42", status: "paid" },
    { at: "Feb 04 · 11:22", amount: 5250, ref: "PAY-2026-01-K42", status: "paid" },
  ],
  monthly: [{ m: "Dec", v: 5200 }, { m: "Jan", v: 5250 }, { m: "Feb", v: 8400 }, { m: "Mar", v: 11200 }, { m: "Apr", v: 9450 }, { m: "May", v: 8750, pending: true }],
};

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

export const ADMIN_COMM = {
  reports: [
    { id: "rp1", at: "15m ago", target: "thread", targetTitle: "Optional subject leak — 2026 paper", reportedBy: 3, reason: "Misinformation · no verified source", severity: "high", state: "open" },
    { id: "rp2", at: "42m ago", target: "reply", targetTitle: "reply on 'Mock 14 — 122/200'", reportedBy: 1, reason: "Personal attack", severity: "medium", state: "open" },
    { id: "rp3", at: "2h ago", target: "resource", targetTitle: "Laxmikanth · chapter map", reportedBy: 2, reason: "Possible DMCA / copyright", severity: "high", state: "open" },
    { id: "rp4", at: "6h ago", target: "thread", targetTitle: "Pirated test series link", reportedBy: 8, reason: "Piracy", severity: "high", state: "action-pending" },
  ],
  mentorApplications: [
    { id: "ma1", user: "u_ritu", at: "3h ago", rank: "AIR 117 · CSE 2023", proof: "scorecard + LinkedIn", topics: "Polity deep, Federalism workshop", status: "pending" },
    { id: "ma2", user: "u_isha", at: "1d ago", rank: "AIR 8 · CSE 2022", proof: "scorecard + DOPT page", topics: "Optional: Pub Ad, Burnout", status: "verified" },
    { id: "ma3", user: "u_arjun", at: "4d ago", rank: "IPS · 2023 batch", proof: "DOPT page", topics: "Mains, Interview", status: "verified" },
  ],
  badges: {
    pending: [
      { user: "u_kavya", kind: "topper", evidence: "AIR 42 · CSE 2024 · scorecard uploaded", at: "3h ago" },
      { user: "u_arjun", kind: "officer", evidence: "DOPT cadre allocation page", at: "1d ago" },
    ],
  },
  channelsConfig: [
    { id: "u-official", name: "#official-updates · UPSC CSE", lockedAdminWrite: true, admins: 4, autoSync: true },
    { id: "u-prep", name: "#preparation · UPSC CSE", lockedAdminWrite: false, admins: 6, autoSync: false },
    { id: "g-resources", name: "#resources · General", lockedAdminWrite: false, admins: 3, autoSync: false },
  ],
  metrics: { pendingReports: 4, dailyThreads: 142, hiddenThisWeek: 18, bansThisWeek: 2, mentorPendingPayouts: 8750 },
};
