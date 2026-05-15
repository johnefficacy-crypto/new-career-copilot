"""Community layer reference snapshot.

Mirrors `docs/reference/UI_claude-code/data-community.jsx`. Until canonical
``forum_spaces`` / ``forum_channels`` tables land, the ``/api/community/spaces``
endpoint serves this static map so the React Community screen has a working
data spine. The frontend at `features/community/data.js` carries the same
shape and falls back to it when the API call fails — so this module is the
single source of truth on the server side.
"""
from __future__ import annotations

COMMUNITY_USERS: dict[str, dict] = {
    "u_aarav":  {"id": "u_aarav",  "name": "Aarav Mehra",   "handle": "@aarav.m",   "role": "aspirant", "exam": "UPSC CSE 2026",     "joined": "Oct 2025", "avatarColor": "#A68057"},
    "u_kavya":  {"id": "u_kavya",  "name": "Kavya Iyer",    "handle": "@kavya_ias", "role": "topper",   "badge": {"kind": "topper",  "rank": "AIR 42",  "exam": "CSE 2024"}, "avatarColor": "#54794E"},
    "u_arjun":  {"id": "u_arjun",  "name": "Arjun S.",      "handle": "@arjun.s",   "role": "officer",  "badge": {"kind": "officer", "post": "IPS · 2023 batch"}, "avatarColor": "#524864"},
    "u_ritu":   {"id": "u_ritu",   "name": "Ritu Patel",    "handle": "@ritu.cse",  "role": "topper",   "badge": {"kind": "topper",  "rank": "AIR 117", "exam": "CSE 2023"}, "avatarColor": "#41603D"},
    "u_neha":   {"id": "u_neha",   "name": "Neha Verma",    "handle": "@neha.v",    "role": "mentor",   "badge": {"kind": "mentor",  "since": "2024"}, "avatarColor": "#8A6846"},
    "u_zaid":   {"id": "u_zaid",   "name": "Zaid Khan",     "handle": "@zaid.ssc",  "role": "aspirant", "exam": "SSC CGL 2026",      "avatarColor": "#6C5038"},
    "u_pooja":  {"id": "u_pooja",  "name": "Pooja Iyer",    "handle": "@pooja.i",   "role": "aspirant", "exam": "RBI Grade B 2026",  "avatarColor": "#8F86A1"},
    "u_rohit":  {"id": "u_rohit",  "name": "Rohit Sen",     "handle": "@rohit.s",   "role": "aspirant", "exam": "SSC CGL 2026",      "avatarColor": "#BE9C6B"},
    "u_anjali": {"id": "u_anjali", "name": "Anjali D.",     "handle": "@anjali.d",  "role": "aspirant", "exam": "UPSC CSE 2026",     "avatarColor": "#6D637F"},
    "u_admin":  {"id": "u_admin",  "name": "CCP Team",      "handle": "@ccp",       "role": "admin",    "badge": {"kind": "admin"}, "avatarColor": "#2E2218"},
    "u_aman":   {"id": "u_aman",   "name": "Aman R.",       "handle": "@aman.r",    "role": "aspirant", "exam": "UPSC CSE 2026",     "avatarColor": "#94B28A"},
    "u_isha":   {"id": "u_isha",   "name": "Isha Trivedi",  "handle": "@isha.ias",  "role": "topper",   "badge": {"kind": "topper",  "rank": "AIR 8", "exam": "CSE 2022"}, "avatarColor": "#54794E"},
}

COMMUNITY_SPACES: list[dict] = [
    {
        "id": "upsc-cse", "name": "UPSC CSE", "short": "UC", "color": "#54794E", "tone": "sage",
        "members": 24180, "online": 1842, "verifiedToppers": 41, "mentors": 28,
        "pinNote": "Most active space · 5 channels · 12 active groups",
        "channels": [
            {"id": "u-official", "name": "official-updates", "purpose": "Admin-write only · official UPSC notifications", "lockedAdminWrite": True, "unread": 2, "lastActiveAt": "2h", "pinned": 1, "members": 24180},
            {"id": "u-form", "name": "form-help", "purpose": "Questions about application, fee, documents", "unread": 14, "lastActiveAt": "6m", "pinned": 2, "members": 14206},
            {"id": "u-prep", "name": "preparation", "purpose": "Strategy · resources · books · coaching opinions", "unread": 38, "lastActiveAt": "now", "pinned": 3, "members": 21042},
            {"id": "u-pyq", "name": "pyq-discussion", "purpose": "Question-level discussion · answer verification", "unread": 9, "lastActiveAt": "22m", "pinned": 2, "members": 18774},
            {"id": "u-cutoff", "name": "cutoffs-results", "purpose": "Cutoff sharing · result reactions · ranks", "unread": 0, "lastActiveAt": "3h", "pinned": 1, "members": 12940},
        ],
    },
    {
        "id": "ssc-cgl", "name": "SSC CGL", "short": "SC", "color": "#A68057", "tone": "clay",
        "members": 18420, "online": 1206, "verifiedToppers": 14, "mentors": 9,
        "pinNote": "Tier-1 prep peak season · check #form-help for new portal",
        "channels": [
            {"id": "s-official", "name": "official-updates", "purpose": "Admin-write only · official SSC notifications", "lockedAdminWrite": True, "unread": 1, "lastActiveAt": "4h", "pinned": 1, "members": 18420},
            {"id": "s-form", "name": "form-help", "purpose": "Application portal issues, photo, signature, payments", "unread": 22, "lastActiveAt": "3m", "pinned": 1, "members": 11420},
            {"id": "s-prep", "name": "preparation", "purpose": "Strategy · books · drills · daily plans", "unread": 11, "lastActiveAt": "18m", "pinned": 2, "members": 14002},
            {"id": "s-pyq", "name": "pyq-discussion", "purpose": "Question-level discussion · answer verification", "unread": 0, "lastActiveAt": "1h", "pinned": 1, "members": 9210},
            {"id": "s-cutoff", "name": "cutoffs-results", "purpose": "Cutoff sharing · result reactions", "unread": 0, "lastActiveAt": "6h", "pinned": 0, "members": 7820},
        ],
    },
    {
        "id": "ibps-po", "name": "IBPS PO", "short": "IB", "color": "#524864", "tone": "dusk",
        "members": 9740, "online": 612, "verifiedToppers": 6, "mentors": 4,
        "pinNote": "Prelims weeks — daily mock threads in #preparation",
        "channels": [
            {"id": "i-official", "name": "official-updates", "purpose": "Admin-write only · official IBPS notifications", "lockedAdminWrite": True, "unread": 0, "lastActiveAt": "1d", "pinned": 1, "members": 9740},
            {"id": "i-form", "name": "form-help", "purpose": "Application portal · photo · signature · fee", "unread": 3, "lastActiveAt": "42m", "pinned": 0, "members": 5210},
            {"id": "i-prep", "name": "preparation", "purpose": "Strategy · daily mock threads · books", "unread": 6, "lastActiveAt": "12m", "pinned": 1, "members": 7320},
            {"id": "i-pyq", "name": "pyq-discussion", "purpose": "Question-level discussion · answer verification", "unread": 0, "lastActiveAt": "5h", "pinned": 0, "members": 4108},
            {"id": "i-cutoff", "name": "cutoffs-results", "purpose": "Cutoff sharing · result reactions", "unread": 0, "lastActiveAt": "2d", "pinned": 0, "members": 3220},
        ],
    },
    {
        "id": "rbi-grb", "name": "RBI Grade B", "short": "RB", "color": "#41603D", "tone": "sage",
        "members": 4180, "online": 240, "verifiedToppers": 3, "mentors": 2,
        "pinNote": "Phase I window · 6 days",
        "channels": [
            {"id": "r-official", "name": "official-updates", "purpose": "Admin-write only · official RBI notifications", "lockedAdminWrite": True, "unread": 0, "lastActiveAt": "2d", "pinned": 1, "members": 4180},
            {"id": "r-form", "name": "form-help", "purpose": "Application portal · uploads · payments", "unread": 1, "lastActiveAt": "5h", "pinned": 0, "members": 2110},
            {"id": "r-prep", "name": "preparation", "purpose": "Phase I + ESI/FM strategy · books · drills", "unread": 0, "lastActiveAt": "1h", "pinned": 0, "members": 3240},
            {"id": "r-pyq", "name": "pyq-discussion", "purpose": "Question-level discussion · answer verification", "unread": 0, "lastActiveAt": "3d", "pinned": 0, "members": 1880},
            {"id": "r-cutoff", "name": "cutoffs-results", "purpose": "Cutoff sharing · result reactions", "unread": 0, "lastActiveAt": "1w", "pinned": 0, "members": 1410},
        ],
    },
    {
        "id": "general", "name": "General", "short": "Gn", "color": "#6C5038", "tone": "clay", "isGeneral": True,
        "members": 38740, "online": 2840, "verifiedToppers": 0, "mentors": 0,
        "pinNote": "Cross-exam · everyone welcome · no exam-specific PYQ here",
        "channels": [
            {"id": "g-motivation", "name": "motivation", "purpose": "Wins · streaks · milestones · setbacks", "unread": 5, "lastActiveAt": "2m", "pinned": 1, "members": 30210},
            {"id": "g-groups", "name": "study-groups", "purpose": "Find partners and form groups", "unread": 2, "lastActiveAt": "14m", "pinned": 0, "members": 14020},
            {"id": "g-resources", "name": "resources", "purpose": "Free resource links · admin-curated", "unread": 0, "lastActiveAt": "1h", "pinned": 2, "members": 22418},
        ],
    },
]

COMMUNITY_FLAIRS: dict[str, dict] = {
    "question":     {"label": "Question",     "tone": "dusk"},
    "strategy":     {"label": "Strategy",     "tone": "sage"},
    "resource":     {"label": "Resource",     "tone": "clay"},
    "discussion":   {"label": "Discussion",   "tone": "outline"},
    "mock-report":  {"label": "Mock report",  "tone": "amber"},
    "formhelp":     {"label": "Form help",    "tone": "amber"},
    "cutoff":       {"label": "Cutoff",       "tone": "rose"},
    "result":       {"label": "Result",       "tone": "sage"},
    "notice":       {"label": "Notice",       "tone": "ink"},
    "experience":   {"label": "Experience",   "tone": "dusk"},
    "meta":         {"label": "Meta",         "tone": "outline"},
}

COMMUNITY_THREADS: dict[str, list[dict]] = {
    "u-prep": [
        {"id": "t1", "channelId": "u-prep", "flair": "strategy", "pinned": True,
         "title": "108 days to Prelims — a calm 6-hour-a-day plan that actually works",
         "body": "I've been at this for 14 months and finally have a stable rhythm. Sharing what changed for me in the last 8 weeks: spaced revision (not endless re-reading), one full mock every Sunday with a 90-min review block on Monday, and ruthless trimming of source list. Long post, ask anything below.",
         "author": "u_kavya", "upvotes": 842, "downvotes": 14, "replies": 127, "createdAt": "4h", "solved": False,
         "planRelevant": {"topic": "Plan strategy", "reason": "Matches your Prelims phase"},
         "topReplies": [
             {"id": "r1", "author": "u_isha", "upvotes": 212, "body": "Strong post. One addition — verified toppers under-emphasize the importance of mock review latency. If you take a mock and review > 48h later you may as well not have taken it."},
             {"id": "r2", "author": "u_arjun", "upvotes": 154, "body": "Officer here — second the spaced revision point. The first 6 months I revised once, the second 6 months I revised 4x. Result tells you which strategy worked."},
             {"id": "r3", "author": "u_aarav", "upvotes": 38, "body": "Saved this. Question — how did you handle Economy when monetary policy kept changing? My plan keeps adapting to news."},
         ]},
        {"id": "t2", "channelId": "u-prep", "flair": "question",
         "title": "Optional subject choice — Public Admin vs Sociology in 2026?",
         "body": "I'm at the crossroads. Public Admin has the addendum (digital governance now in II.3) but the scoring is unpredictable. Sociology feels scorable but coaching options have shrunk. Anyone made this call recently?",
         "author": "u_aman", "upvotes": 208, "downvotes": 6, "replies": 64, "createdAt": "7h", "topReplies": []},
        {"id": "t3", "channelId": "u-prep", "flair": "resource",
         "title": "Free: my 47-page Polity Federalism notes (Centre–State + Emergency)",
         "body": "Drive link in comments. Covers Article 263 + recent commission reports. Reviewed by a verified topper, but please flag errors.",
         "author": "u_ritu", "upvotes": 1241, "downvotes": 18, "replies": 89, "createdAt": "1d", "saved": True,
         "planRelevant": {"topic": "Polity · Federalism", "reason": "Your weak topic"}, "topReplies": []},
        {"id": "t4", "channelId": "u-prep", "flair": "mock-report",
         "title": "Mock 14 — 122/200. Sharing my full error breakdown.",
         "body": "Concept gaps 6 · time pressure 4 · misread 2 · guess 1. Asking for feedback on whether to slow down or push harder.",
         "author": "u_anjali", "upvotes": 96, "downvotes": 3, "replies": 38, "createdAt": "9h", "topReplies": []},
        {"id": "t5", "channelId": "u-prep", "flair": "discussion",
         "title": "Did anyone else feel the Prelims 2024 ethics-style question creep?",
         "body": "Some questions felt more inferential, less factual. Wondering if this is a permanent pattern shift or one-cycle noise.",
         "author": "u_aarav", "upvotes": 48, "downvotes": 11, "replies": 22, "createdAt": "3h", "topReplies": []},
        {"id": "t6", "channelId": "u-prep", "flair": "strategy",
         "title": "How I balance Current Affairs with deep Polity — without burning out",
         "body": "15-min morning digest, no PDF dumps. Tagging back to syllabus topics inside Notion. Sharing template.",
         "author": "u_neha", "upvotes": 340, "downvotes": 5, "replies": 51, "createdAt": "2d", "topReplies": []},
    ],
    "u-official": [
        {"id": "o1", "channelId": "u-official", "flair": "notice", "pinned": True,
         "title": "CSE 2026 — Notification released",
         "body": "Application window opens May 22, 2026. Prelims on Aug 30, 2026. Pre-exam training and addendum to Public Administration syllabus (Section II.3) are now live. Read full notification linked below.",
         "author": "u_admin", "upvotes": 3210, "downvotes": 0, "replies": 0,
         "createdAt": "3d", "verifiedSource": "upsc.gov.in/notifications/cse-2026", "repliesLocked": True},
        {"id": "o2", "channelId": "u-official", "flair": "notice",
         "title": "Public Admin · syllabus addendum (4 µtopics added)",
         "body": "Section II Topic 3 expanded to include digital governance frameworks, e-Pramaan, DigiLocker case studies, and Aadhaar legal architecture. Subject tree v2026.1 deployed.",
         "author": "u_admin", "upvotes": 1812, "downvotes": 2, "replies": 0,
         "createdAt": "3d", "verifiedSource": "upsc.gov.in/syllabus-2026-addendum.pdf", "repliesLocked": True},
    ],
    "u-form": [
        {"id": "f1", "channelId": "u-form", "flair": "formhelp", "pinned": True,
         "title": "Read first — common form errors (photo, sig, declaration)",
         "body": "60% of rejected applications fail on photo dimensions, signature mismatch, or missing declaration check. Step-by-step checklist below.",
         "author": "u_admin", "upvotes": 980, "downvotes": 0, "replies": 42, "createdAt": "5d", "topReplies": []},
        {"id": "f2", "channelId": "u-form", "flair": "question",
         "title": "OBC NCL — can I use a March 2026 dated certificate?",
         "body": "Mine is dated March 12, 2026. Notification says \"valid as on date of application\". Confused about cut-off.",
         "author": "u_zaid", "upvotes": 34, "downvotes": 1, "replies": 9, "createdAt": "38m", "topReplies": []},
        {"id": "f3", "channelId": "u-form", "flair": "question",
         "title": "EWS certificate from last year — accepted?",
         "body": "Got it issued in Feb 2025. Reading conflicting threads. Anyone confirmed with their CSC?",
         "author": "u_pooja", "upvotes": 18, "downvotes": 2, "replies": 14, "createdAt": "2h", "topReplies": []},
    ],
    "u-pyq": [
        {"id": "p1", "channelId": "u-pyq", "flair": "question", "pinned": True,
         "title": "2022 Q41 — Article 263 question · official answer key clash",
         "body": "Official key marks (C). UPSC ToL gives (B). Many coaching keys split. What's the verified read?",
         "author": "u_kavya", "upvotes": 642, "downvotes": 6, "replies": 48, "createdAt": "1d", "topReplies": [],
         "planRelevant": {"topic": "Polity · Federalism", "reason": "Your weak topic"}},
        {"id": "p2", "channelId": "u-pyq", "flair": "discussion",
         "title": "2023 Q07 — economy + monetary policy combo. Which textbook covers this?",
         "body": "Looking for a clean derivation rather than current-affairs notes.",
         "author": "u_aarav", "upvotes": 88, "downvotes": 1, "replies": 14, "createdAt": "4h", "topReplies": []},
    ],
    "u-cutoff": [],
    "s-official": [], "s-prep": [], "s-pyq": [], "s-cutoff": [],
    "s-form": [
        {"id": "sf1", "channelId": "s-form", "flair": "formhelp", "pinned": True,
         "title": "New SSC portal: how to upload signature without 'invalid format' error",
         "body": "PNG vs JPG, dimensions, background. Step-by-step.",
         "author": "u_admin", "upvotes": 520, "downvotes": 2, "replies": 30, "createdAt": "3d", "topReplies": []},
        {"id": "sf2", "channelId": "s-form", "flair": "question",
         "title": "Fee not deducted but portal shows 'pending'. Is this normal?",
         "body": "SBI net banking · transaction shows successful · CGL portal status: pending.",
         "author": "u_rohit", "upvotes": 38, "downvotes": 0, "replies": 21, "createdAt": "12m", "topReplies": []},
    ],
    "i-official": [], "i-form": [], "i-prep": [], "i-pyq": [], "i-cutoff": [],
    "r-official": [], "r-form": [], "r-prep": [], "r-pyq": [], "r-cutoff": [],
    "g-motivation": [
        {"id": "m1", "channelId": "g-motivation", "flair": "experience", "pinned": True,
         "title": "Failed Prelims 3 times. Cleared CSE 2024. AMA.",
         "body": "Posting this not for sympathy but in case someone is in attempt 3 thinking it's over. It isn't. Long story below.",
         "author": "u_isha", "upvotes": 4218, "downvotes": 42, "replies": 312, "createdAt": "5d", "topReplies": []},
        {"id": "m2", "channelId": "g-motivation", "flair": "discussion",
         "title": "How do you handle the post-mock crash?",
         "body": "After every mock I lose 2 days to a low. Anyone solved this?",
         "author": "u_anjali", "upvotes": 154, "downvotes": 6, "replies": 88, "createdAt": "3h", "topReplies": []},
    ],
    "g-groups": [
        {"id": "gg1", "channelId": "g-groups", "flair": "discussion",
         "title": "UPSC CSE Morning Batch — 06:00–08:00 IST · 4 spots left (of 8)",
         "body": "We do a 30-min Polity revision + 60-min focused block + 30-min answer-write. Daily. Need committed people only.",
         "author": "u_aarav", "upvotes": 62, "downvotes": 1, "replies": 24, "createdAt": "6h", "topReplies": []},
    ],
    "g-resources": [
        {"id": "gr1", "channelId": "g-resources", "flair": "resource", "pinned": True,
         "title": "Master list — free, admin-vetted study resources",
         "body": "Sorted by exam and source. All links re-verified Apr 2026.",
         "author": "u_admin", "upvotes": 2840, "downvotes": 6, "replies": 42, "createdAt": "2w", "topReplies": []},
    ],
}

COMMUNITY_CHANNEL_RULES: dict[str, list[str]] = {
    "official": [
        "Admin-write only. Posts mirror /admin/exam-intelligence verified updates.",
        "Replies are locked. Use #form-help or #preparation for questions.",
        "Every post links to its official source with a verified signature.",
    ],
    "form": [
        "Application, fee, documents only. No strategy debates here.",
        "Cite the official notification when you assert a rule.",
        "Verified Topper / Officer answers are visually distinguished.",
    ],
    "prep": [
        "Strategy, resources, books, coaching opinions. No spam.",
        "Use flairs — Question, Strategy, Resource, Discussion, Mock report.",
        "Brigading and one-line gloats are removed.",
    ],
    "pyq": [
        "Question-level discussion. Cite year and question number.",
        "Verified Topper answers float to the top after admin review.",
        "Don't post answer keys without provenance.",
    ],
    "cutoff": [
        "Verified marks/rank only. Use Verified Topper badge or scorecard upload.",
        "Speculation marked clearly with the 'speculation' flair.",
    ],
    "motivation": [
        "No toxic comparison. No 'I studied 14h, you should too'.",
        "Setbacks welcome. Hostile pile-ons are removed.",
    ],
    "groups": [
        "Post group invites only. No off-topic study questions.",
        "Use the Find a group page for richer match-making.",
    ],
    "resources": [
        "Source trust: official / community / coaching / unknown. Tag every link.",
        "Pirated paid material is removed regardless of upvotes.",
    ],
}
