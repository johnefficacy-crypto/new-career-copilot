// Prototype mock data — ported verbatim from
// docs/reference/UI_claude-code/data.jsx (the prototype's `DATA` global).
// Used only by the read-only prototype screens under /prototype/*.

export const DATA = {
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
    planSource: "adapted-from-existing",
  },

  metrics: [
    { k: "Tasks done", v: "2 / 7", delta: "+1 vs yesterday", live: true, tone: "sage" },
    { k: "Adherence (7d)", v: "82%", delta: "+4pp", live: true, tone: "sage" },
    { k: "Backlog", v: "3 tasks", delta: "+2 carried", live: true, tone: "amber" },
    { k: "Mocks this week", v: "1 / 2", delta: "on track", live: true, tone: "sage" },
    { k: "Focus hours", v: "4.2h", delta: "−0.8h vs plan", live: true, tone: "clay" },
    { k: "Revision cov.", v: "56%", delta: "4 topics due", live: "partial", tone: "clay" },
  ],

  weekPlan: [
    { day: "Mon May 13", tasks: 6, hours: 5.5, focus: "Mock 13 + correction", status: "done", adherence: 0.84 },
    { day: "Tue May 14", tasks: 7, hours: 6.5, focus: "Federalism + Mock 14", status: "today", adherence: 0.28, isToday: true },
    { day: "Wed May 15", tasks: 6, hours: 6.0, focus: "Mock 14 review · GS-2 drill", status: "planned", adherence: 0 },
    { day: "Thu May 16", tasks: 5, hours: 5.0, focus: "Modern History deep · CA", status: "planned", adherence: 0 },
    { day: "Fri May 17", tasks: 6, hours: 6.0, focus: "Economy concepts + Mains", status: "planned", adherence: 0 },
    { day: "Sat May 18", tasks: 5, hours: 5.5, focus: "Weekend catchup + revision", status: "planned", adherence: 0 },
    { day: "Sun May 19", tasks: 4, hours: 4.0, focus: "Weekly review + Mock 15", status: "planned", adherence: 0 },
  ],

  tasks: [
    {
      id: "t1", time: "06:30", duration: "60m", type: "revision",
      title: "Polity · Federalism — concept revision",
      topic: "Polity ▸ Federalism ▸ Centre-State", planned: 60, status: "done",
      sub: "Spaced revision due · 3rd encounter · last 84% accuracy",
      sources: [{ layer: "user", label: "Weak topic" }, { layer: "engine", label: "Spaced due" }, { layer: "exam", label: "PYQ-heavy" }],
    },
    {
      id: "t3", time: "10:00", duration: "90m", type: "learn",
      title: "Modern History · Revolts of 1857 — deep read",
      topic: "Modern ▸ 1857", planned: 90, status: "in-progress", oneThing: true,
      sub: "Prerequisite for Governor-General sequence · scheduled before Mock 14",
      sources: [{ layer: "exam", label: "Prerequisite" }, { layer: "user", label: "Weak: Modern" }, { layer: "engine", label: "Pre-mock" }],
    },
    {
      id: "t6", time: "19:30", duration: "75m", type: "mock",
      title: "Full-length Mock 14 — Prelims · Paper I",
      topic: "Prelims ▸ Full mock", planned: 75, status: "todo",
      sub: "Engine-scheduled · last mock 7d ago · coverage 68%",
      sources: [{ layer: "user", label: "Mock cadence" }, { layer: "exam", label: "Prelims" }, { layer: "engine", label: "Cadence" }],
    },
  ],
};
