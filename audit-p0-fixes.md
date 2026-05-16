# Community layer — P0 verification + fix pass

## Phase 1 — Verification results

| Claim | Audit said | Verdict | Notes |
|---|---|---|---|
| A. Duplicate routers cause shadowing | Yes | **Partially verified** | `community_runtime_router` is mounted *before* `community_people_router` (server.py:185-187). Of 28 routes in `community_people`, 26 are fully shadowed by `community_runtime` and only two are reachable: (1) `POST /community/channels/{c}/threads/{t}/replies/{r}/vote` (drives Claim B), (2) `POST /community/spaces/{s}/channels`. The "shadowing" itself is benign on the 26 paths — but those handlers are seed-only dead code under risk of being silently revived if the include order ever flips. |
| B. Reply vote broken for DB replies | Yes | **Verified** | `community_runtime.py` defined no `…/replies/{reply_id}/vote` endpoint. The request falls through to `community_people.vote_reply` (line 711), which scans `COMMUNITY_THREADS["topReplies"]` in seed memory and stores votes in a module-level `defaultdict`. DB replies created via `community_runtime.create_thread_reply` → `community_replies` table can never be voted because they aren't in seed. |
| C. Admin "Hide thread" only updates report row | Yes | **Verified** | `admin_resolve_community_flag` only mutated `forum_reports` / `community_reports` / `community_resource_reports` rows. The target `community_threads`, `community_replies`, `forum_posts`, `forum_comments`, `community_resources` were never touched. Frontend button is labelled "Hide thread" in `app/frontend/src/pages/admin/Community.jsx:61`. (`prototype/screens/AdminCommunity.jsx` is dead prototype HTML.) |
| D. Mentor contract mismatch | Yes | **Verified — crash risk** | `MentorsScreen.jsx` calls `mentor.badge.includes("AIR")` (line 107) and `.split(" · ")`. Backend `_shape_mentor_profile` does not return `badge`. The screen replaces seed data with backend data as soon as `/api/community/mentors` returns ≥1 row → `MentorTopBadge` throws `TypeError`. Other missing fields (`color`, `blurb`, `served`) only cause visual gaps. |
| E. Counter race conditions | Yes | **Verified** | Four read-modify-write call sites: `community_threads.reply_count` (line 308), `community_threads.vote_count` (335-336), `community_resources.upvote_count` (844-850), `community_resources.report_count` (865-866). No `sb.rpc()` calls in the file, no DB-side trigger maintaining these counters. |

## Phase 2 — Fixes applied

### Claim A — Deprecation marker on `community_people` (no router move)
- `app/backend/app/api/community_people.py`: router now constructed with `deprecated=True` and a router-level dependency that logs `warning("community_people deprecated route served %s %s …")` on every request. No routes removed, mount untouched, response shapes untouched.

### Claim B — DB-backed reply vote
- `app/backend/app/api/community_runtime.py`: new route `POST /community/channels/{channel_id}/threads/{thread_id}/replies/{reply_id}/vote`.
  - Looks up the thread in `community_threads` (404 if missing or channel mismatch).
  - Looks up the reply in `community_replies` (404 if missing or thread mismatch).
  - Stores the vote on `community_votes.reply_id` (column already exists in migration 018, line 126).
  - Atomically updates `community_replies.vote_count` via the new RPC `community_inc_reply_vote_count`.
  - Same toggle / direction-flip semantics as the thread vote.
- Because `community_runtime_router` is mounted before `community_people_router`, this route now shadows the seed-only handler in `community_people.vote_reply`.

### Claim C — "Hide" actually hides
- `app/backend/app/api/community_runtime.py:admin_resolve_community_flag`:
  - For `action="hide"`, calls the new helper `_hide_report_target(sb, table, report)` which flips `status="hidden"` on the *target entity* (`community_threads`, `community_replies`, `forum_posts`, `forum_comments`, `community_resources`) before updating the report row.
  - The Supabase Python client doesn't expose a true SQL transaction, so the two writes are sequential. Documented in code: idempotent and the target update happens *first*, so a crash between calls leaves the entity hidden but the report still pending — preferable to the inverse.
  - Audit log now records the `hidden` map (entity_type → entity_id) so the action is reconstructable.
  - Response now includes `hidden`: a map of what was actually hidden.
- Response *shape* was widened (added `hidden` field). No existing fields changed. Frontend `Community.jsx` ignores the response body, so this is non-breaking.

### Claim D — Frontend mentor adapter
- `app/frontend/src/features/community/MentorsScreen.jsx`: new `adaptMentor(m, idx)` adapter applied to both `/api/community/mentors` items and the nested `s.mentor` in `/api/community/mentor-sessions`. Fills `badge` (defaults to `Mentor · <first exam>` or `Mentor`), `color` (deterministic palette pick), `blurb` (falls back to `headline` / `bio`), `served` (falls back to `sessions`), and defensively coerces `topics`, `price`, `rating`, `sessions`.
- Backend response shape unchanged.

### Claim E — Atomic counters
- **New migration** `app/supabase/migrations/089_community_counter_rpcs.sql` defines five `security definer` functions, each performing `UPDATE … SET col = col + p_delta` and returning the post-update value:
  - `community_inc_thread_reply_count`
  - `community_inc_thread_vote_count`
  - `community_inc_reply_vote_count`
  - `community_inc_resource_upvote_count`
  - `community_inc_resource_report_count`
- Counters using `greatest(0, col + delta)` for reply/resource upvote/report; thread vote_count is allowed to go negative because the existing endpoint exposes net direction.
- `community_runtime.py` now has a `_rpc_inc(...)` helper that calls the RPC and, only if `sb.rpc()` fails (older deployments without the migration), falls back to the old RMW — explicitly documented as racy. All four pre-existing RMW sites plus the new reply-vote site now route through `_rpc_inc`.
- Test stub `app/backend/tests/persona_questions/_stub.py` extended with `SBStub.rpc(...)` that emulates each function against the in-memory DB so the new tests don't need a live Postgres.

## Files changed

- `app/backend/app/api/community_runtime.py` — atomic counter helper, reply-vote endpoint, hide-target helper, moderation rewrite.
- `app/backend/app/api/community_people.py` — deprecation logging + `deprecated=True` on router.
- `app/backend/tests/test_community_runtime.py` — three new tests, existing test extended with vote_count atomicity assertion.
- `app/backend/tests/persona_questions/_stub.py` — `SBStub.rpc()` support.
- `app/supabase/migrations/089_community_counter_rpcs.sql` — new migration with five increment functions.
- `app/frontend/src/features/community/MentorsScreen.jsx` — `adaptMentor` adapter.

## Tests added

In `app/backend/tests/test_community_runtime.py`:

1. `test_reply_vote_is_db_backed_and_atomic`
   - Happy path: upvote a DB-backed reply → 200, `netVotes=1`, `community_votes.reply_id` set, `community_replies.vote_count == 1`.
   - Toggle-off: same direction clears vote and decrements counter atomically.
   - Failure mode: vote against non-existent reply id → 404.
2. `test_admin_hide_thread_flips_target_status_in_same_action`
   - Happy path: report → admin hide → `community_threads.status == "hidden"` AND `community_reports.status == "resolved"`, response includes `hidden.community_thread`.
   - Failure mode (idempotency): re-hiding an already-hidden thread succeeds and leaves status hidden.
3. `test_thread_reply_count_uses_atomic_increment`
   - Race-shape coverage: three sequential reply creates → `reply_count == 3` via RPC path (regression test that we no longer compute `old + 1` client-side).
4. `test_channel_thread_reply_vote_report_are_db_backed` (existing) now also asserts `community_threads.vote_count == 1` after the thread vote, confirming the RPC mutated the counter.

All 712 backend tests pass (5 in this file + 707 elsewhere).

## Open questions / things I refused to do

- **`POST /community/spaces/{space_id}/channels` is also seed-only.** Discovered during Claim A verification but not on the audit's P0 list. It's admin-gated but writes to in-memory `COMMUNITY_SPACES`. Not fixed — flagging.
- **Counter back-reconciliation.** Migration 089 doesn't include a one-shot `UPDATE community_threads SET reply_count = (SELECT count(*) FROM community_replies …)` to repair pre-fix drift. Holding off because the drift, if present, is small and a reconcile job is more naturally a separate migration with admin-triggered execution. Suggested as a P1 follow-up.
- **Not a true transaction in moderation.** `_hide_report_target` and the report-status update are sequential PostgREST calls, not one SQL `BEGIN…COMMIT`. supabase-py doesn't expose transactions; making them truly atomic would require another RPC. Documented in code and audit. The order (target first, report second) ensures the worst failure mode leaves the entity hidden and the report re-triable.
- **No migration to add `community_votes (reply_id, user_id)` unique index.** The new reply-vote handler depends on at most one row per `(reply_id, user_id)` but the existing schema only enforces this via application logic. If you want enforcement at DB level, that's an additional migration. Out of scope for this pass.
- **No automatic mode-rollback when an RPC is missing.** The `_rpc_inc` fallback to RMW exists so an out-of-date deployment doesn't 500; it's racy by construction. Once 089 is deployed, the fallback should never fire.

## Suggested next pass (P1 items in priority order)

1. **Migrate `POST /community/spaces/{space_id}/channels` to DB.** Same class of bug as the reply vote, just admin-only so the blast radius is smaller. Should land alongside the social layer move (P0 #2 in the original audit).
2. **Admin client / RLS rework.** The admin moderation endpoint uses `get_supabase_admin()` (service role) and trusts `_require_admin`. Push the same checks into RLS so we no longer bypass it.
3. **Unique constraint on `community_votes (thread_id, user_id)` and `(reply_id, user_id)`.** Currently enforced only by application logic; a duplicate insert from a retry would skew the counter even with atomic RPCs.
4. **Counter reconcile job.** One-shot SQL to repair `community_threads.reply_count` / `vote_count` / `community_replies.vote_count` / `community_resources.upvote_count` / `report_count` from source tables, idempotent, admin-triggerable.
5. **Sunset `community_people.py`.** Audit the deprecation-log signal for a week, confirm no surviving callers, then delete (out of scope for this pass per task constraint, but it's the right end state once nothing hits the warning).
6. **Trust-claim schema split (P1 #10).** Untouched.
7. **Social layer migration to `/api/study/social/*`** (P0 #2 in the original audit, deferred per task scope).
8. **`StudyGroupsScreen.jsx` / `PartnersScreen.jsx` seed cleanup** (P1 #11).
