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

# Known Gaps

## In-flight

- **AI chat persistence** (PR #264, draft) — `/api/ai/{guidance,chat,history}` still served by the in-memory `_ai_history` dict in `placeholders.py`. Migration `098_ai_chat.sql` and the real router are queued in PR #264.
- **Admin overview / users / audit** (PR #264, draft) — same PR replaces the hardcoded admin stubs with real Supabase reads against `profiles`, `recruitments`, `forum_posts`, `moderation_items`, `scrape_runs`, `copyright_claims`, `admin_audit_logs`.

## Real but rough

- **Real LLM provider behind `/api/ai/chat`** — scripted replies today; contract is stable so the swap is mechanical once PR #264 lands.
- **Marketplace mentor catalogue** still pulled from the seed `MENTORS` list in `placeholders.py`. `mentor_bookings` now supports both slug (catalogue) and UUID (profile) mentors; migrating the catalogue itself to `profiles WHERE role='mentor'` is the next step.
- **Downloadable Reports** — PDF generation still queued only; CSV/JSON work inline. Needs a worker.
- **Leadership KPIs** — recompute is admin-triggered today; nightly snapshot job not yet scheduled.
- **Supabase Auth invite delivery** — `/admin/users/create` writes an audit log but doesn't yet send the email invite. Hook this into the existing notifications dispatcher.

## Operational

- Admin governance gap list requires periodic refresh against implementation evidence.
- Scraper operations need a dedicated day-2 runbook and incident handling playbook.
- Notification templates + retries are partially scoped.
- Once PR #264 merges, `router_acc` and `router_admin` in `placeholders.py` can be deleted — they are dead-code-only after the new routers register first.
