---
owner: ops
status: live
last_verified_against_code: 2026-05-16
last_modified: 2026-05-16
source_of_truth: code
related_code:
  - app/backend
related_migrations:
  - app/supabase/migrations
review_cadence: per-sprint
---

# Implementation Status

| surface | status | evidence | next action |
|---|---|---|---|
| auth | partial | app/backend routes + frontend auth flows | close test gaps |
| profile | implemented | `canonical.py` profile/certifications/experience/exam-attempts endpoints | normalize profile events |
| scraper | implemented | scraping runner + queue + admin workflows | improve observability |
| source registry | partial | source tables + admin controls | enforce stricter source SLAs |
| admin review | implemented | admin review endpoints and consoles | tighten SOPs |
| promotion | implemented | deterministic promotion gate | expand edge-case tests |
| eligibility | implemented | deterministic eligibility engine | continue migration hardening |
| notifications | partial | `notifications` router with APScheduler + kill switch; templates + retries open | unify templates + retries |
| payments | implemented | `app/backend/app/api/payments.py` Razorpay integration (orders, signature verify, signed webhook, plans, subscriptions, mentor billing) | plan upgrade UX polish + GST/refund edge cases |
| dashboard | partial | mission-control and analytics surfaces | consolidate KPIs |
| community / forum | implemented | `community_runtime.py` + `canonical.py` over `forum_posts/forum_comments/forum_post_upvotes`; moderation queue wired | wire report buttons across all forum surfaces |
| marketplace | partial | `canonical.py` + `community_people.py` over `courses` + `community_resources`; mentor bookings durable | productionise course provider supply pipeline |
| mentor bookings | implemented | migration 099 + `app/backend/app/api/accountability.py`; unified slug + UUID handler, RLS, payment FK | port marketplace mentor catalogue to real profiles |
| accountability (partners + groups) | implemented | `app/backend/app/api/accountability.py` → `app.study_os.social_sessions` (real Supabase) | UX for partner-request lifecycle |
| PYQ | partial | study surfaces + docs | add ingestion pipeline |
| persona | partial | persona controls + question flow | close policy automation gaps |
| exam intel | partial | contracts + admin intelligence docs | productionize end-to-end |
| study OS | partial | mission control + comparison specs | complete planner phases |
| focus timer | implemented | `canonical.py` `/study/focus/{start,stop,summary}` over `study_sessions` | richer per-subject analytics |
| personal notes | implemented | migration 090, /api/notes, /app/notes UI | add rich-text + attachments |
| flashcards | implemented | migration 091, /api/flashcards + SM-2-lite, /app/flashcards UI | add deck sharing/import |
| mistake book | implemented | migration 092, /api/mistakes + promote-to-card, /app/study/mistakes UI | auto-capture from mocks |
| revision calendar | implemented | migration 093, /api/revision, /app/study/revision UI | per-source auto-scheduling hooks |
| downloadable reports | partial | migration 094, /api/reports inline CSV/JSON, /app/reports UI | PDF worker + signed-URL storage |
| moderation queue | implemented | migration 095, /api/moderation + /admin/moderation, severity rubric v1 | wire report buttons across surfaces |
| leadership KPIs | partial | migration 096, /admin/kpis + recompute, four families seeded | nightly snapshot job |
| copyright/takedown | implemented | migration 097, public /dmca + /admin/copyright | DMCA agent contact + counter-notice flow |
| admin marketplace / AI policy / invite | implemented | `app/backend/app/api/admin_ops.py` real Supabase counts, AI-policy telemetry, audit-logged invites | Supabase Auth invite delivery |
| AI chat | placeholder | in-memory `_ai_history` in `placeholders.py`; **PR 264 (open)** persists to `ai_conversations` + `ai_messages` | merge PR 264, then wire real LLM provider |
| admin overview / users / audit | placeholder | hardcoded stubs in `placeholders.py`; **PR 264 (open)** reads real Supabase counts + `admin_audit_logs` | merge PR 264 |

---

## Placeholder removal arc (May 2026)

`docs/strategy/aspirant-platform-strategy.md` flagged a handful of surfaces still
served by `api/placeholders.py`. They have been retired in three PRs:

1. **PR #263 (merged)** — `claude/placeholder-dead-code-purge`. Deleted the
   six unmounted placeholder routers (recruitments / profile / tracker /
   community / marketplace / study) that `canonical.py` had been silently
   shadowing for some time. `-483` lines, zero behaviour change.
2. **PR #266 (merged)** — `claude/mentor-booking-admin-payments-port`.
   Migration `099_mentor_bookings_commercial.sql` extends `mentor_bookings`
   with `mentor_slug`, `duration_minutes`, `price_inr`, `payment_id`,
   `payment_status`, `metadata`, lifecycle states, RLS. New
   `app/backend/app/api/accountability.py` and `admin_ops.py` supersede the
   placeholder accountability + `/admin/marketplace|/ai-policy|/users/create`
   endpoints with real Supabase impls. `MentorDetail.jsx` switched to the
   new response shape.
3. **PR #264 (draft, open)** — `claude/ai-chat-admin-overview-port`.
   Migration `098_ai_chat.sql` adds `ai_conversations` + `ai_messages`. New
   `app/backend/app/api/ai.py` and `admin_overview.py` swap the in-memory
   `_ai_history` and hardcoded admin overview stubs for real Supabase reads.
   Flagged AI responses cross-file a `moderation_items` row so trust ops
   sees them in the queue from PR #257.

After PR 264 merges the only routes still mounted from `placeholders.py`
will be `router_acc` and `router_admin` whose paths are already shadowed by
real routers registered earlier in `server.py`. A follow-up cleanup PR can
delete both for good.
