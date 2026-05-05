# Career Copilot — Operational Runbook

_Last updated: 2026-04-29_

This runbook is for local development, Supabase operations, scraper/eligibility operations, notification rollout, and admin governance checks.

## 1. Core operating principles

Career Copilot is an eligibility-first, recruitment-canonical system with human-supervised automation.

Operational rules:

- `public.recruitments` is canonical.
- `exam` is UI language only.
- `recruitment_id`, `organization_id`, and `post_id` are the operational identifiers.
- Eligibility verdicts must come from deterministic logic.
- AI can propose, summarize, score, and explain. AI cannot become authority for publishing, eligibility, or official verification.
- Admin tooling is operational infrastructure, not a convenience layer.

## 2. Local verification commands

Run before every release or PR merge:

```bash
npm run lint
npm run typecheck
npm test -- --run
npm run build
```

Also search for domain and governance regressions:

```bash
# public.exams must not become canonical
grep -R "public.exams\|from(\"exams\"\|from('exams'" app actions lib supabase --exclude-dir=node_modules || true

# Admin auth should not rely on direct is_admin checks
grep -R "is_admin\|profile?.is_admin" app actions lib components --exclude-dir=node_modules || true
```

Any remaining `is_admin` references must be migration/backfill compatibility only, not live admin authorization.

## 3. Migration order

The mission-control and exam-summary stack depends on telemetry existing first.

Required order:

```text
027_user_events_and_form_submissions.sql
028_user_recruitment_state.sql
029_exam_summary_support.sql
```

Reason:

1. `user_recruitment_state` depends on `public.user_events`.
2. `user_exam_summary` depends on `public.user_recruitment_state`.
3. Database joins must use `public.recruitments` and `recruitment_id`.

Do not create `public.exams` to satisfy old code.

## 4. Materialized view refresh

`public.user_recruitment_state` is a materialized view. Refresh it after large imports, eligibility recompute waves, or telemetry backfills.

```sql
refresh materialized view concurrently public.user_recruitment_state;
```

If concurrent refresh fails because the unique index is missing, confirm this index exists:

```sql
create unique index if not exists user_recruitment_state_uidx
  on public.user_recruitment_state(user_id, recruitment_id);
```

Then retry the concurrent refresh.

## 5. Scraper operations

### 5.1 Trigger scheduled scraper

Deploy or invoke through Supabase Edge Functions depending on environment:

```bash
supabase functions deploy scheduled-scraper
supabase functions invoke scheduled-scraper --body '{}'
```

### 5.2 Check recent scrape runs

```sql
select
  id,
  status,
  triggered_by,
  started_at,
  finished_at,
  sources_checked,
  items_found,
  items_new,
  items_duplicate,
  error_log
from scrape_runs
order by started_at desc
limit 10;
```

### 5.3 Clear stuck scrape run

Use only when a previous run is stuck and blocking new work.

```sql
update scrape_runs
set
  status = 'failed',
  finished_at = now(),
  error_log = coalesce(error_log, '[]'::jsonb) || jsonb_build_array(
    jsonb_build_object(
      'source', 'system',
      'error', 'Marked failed by runbook stuck-run cleanup',
      'at', now()
    )
  )
where status = 'running'
  and started_at < now() - interval '15 minutes';
```

## 6. Scrape queue review

Use the admin scrape dashboard for normal review.

Before approving a scrape item, verify:

- Official source URL exists.
- Organization is correct.
- At least one post exists.
- Apply dates are sane.
- Vacancies are present or explicitly unknown.
- Eligibility-critical fields have evidence or are explicitly unavailable.
- Extraction status is verified or manual override is justified.

Promotion should use the transactional `admin_promote_recruitment_payload` RPC when available.

## 7. Eligibility operations

### 7.1 Check eligibility queue

```sql
select
  id,
  user_id,
  recruitment_id,
  status,
  retry_count,
  last_error,
  created_at,
  started_at,
  finished_at
from eligibility_recompute_queue
order by created_at desc
limit 50;
```

### 7.2 Retry failed jobs

Until `/admin/eligibility-queue` is implemented, retry manually only when the failure cause is understood.

```sql
update eligibility_recompute_queue
set
  status = 'pending',
  started_at = null,
  finished_at = null,
  last_error = null
where status = 'failed'
  and retry_count < 5;
```

### 7.3 Manual recompute

Preferred route is the app/API path that calls the canonical `runEligibilityForUser` implementation. Do not create a second eligibility engine in an Edge Function or SQL procedure.

Operational rule:

```text
One deterministic eligibility engine. Many callers.
```

## 8. Notification rollout

Before enabling broad email dispatch:

- Confirm `notification_preferences` defaults email off.
- Confirm `/dashboard/notifications/preferences` works.
- Confirm email dispatcher reads from `v_notification_feed`.
- Confirm unsubscribe/preference link points to `/dashboard/notifications/preferences`.
- Confirm stale alerts are not sent.
- Confirm `upsertNotificationAlerts` is wired into eligibility recompute.

### 8.1 Deploy email dispatcher

```bash
supabase functions deploy email-dispatcher
```

Required secrets:

```text
RESEND_API_KEY
APP_URL
```

### 8.2 Emergency email kill switch

Until a formal `notification_kill_switches` table exists, disable cron jobs or set all test users to `email_enabled = false`.

```sql
update notification_preferences
set email_enabled = false
where email_enabled = true;
```

Use only for emergency rollback. A role-restricted kill-switch console is required before large-scale notification rollout.

## 9. Admin governance checks

Before expanding automation, verify:

```text
1. Full RBAC enforcement exists.
2. /admin/audit exists and works.
3. /admin/eligibility-queue exists and works.
```

Do not scale AI automation until these are operational.

## 10. Common error fixes

### 10.1 `relation public.user_events does not exist`

Cause: `028_user_recruitment_state` was run before telemetry migration.

Fix: run telemetry migration first, then recreate/refresh the materialized view.

### 10.2 `relation public.user_recruitment_state does not exist`

Cause: exam summary migration ran before user state view.

Fix: run migrations in correct order:

```text
027 -> 028 -> 029
```

### 10.3 `relation public.exams does not exist`

Cause: old code or migration assumed `public.exams` exists.

Fix: do not create `public.exams`. Update code to use `public.recruitments` and `recruitment_id`.

### 10.4 Dashboard empty despite eligible results

Check:

- `eligibility_results` has rows for the user.
- `user_recruitment_state` was refreshed.
- `user_exam_summary` exists.
- `lib/db/mission-control.ts` queries real view columns.

### 10.5 Email not sent

Check:

- User has `email_enabled = true`.
- Alert has not already been sent.
- Alert is not stale.
- Dispatcher secrets are configured.
- Dispatcher logs show provider response.

### 10.6 Scraper finds zero items

Check:

- Source is active.
- Source URL still resolves.
- Anti-bot/captcha risk.
- Provider secrets.
- LLM provider health.
- Content type is supported.
- Source is not lifecycle-only content like result/admit card/cutoff.

### 10.7 Approved scrape item did not create recruitment

Check:

- Promotion used `admin_promote_recruitment_payload` or equivalent transactional path.
- Queue row has valid `extracted_data`.
- Organization insert/upsert succeeded.
- Posts array is non-empty.
- Reviewer notes / error log.

### 10.8 Admin user can see page but action fails

Likely route-level and action-level permissions are inconsistent. Server actions must enforce permissions independently of UI visibility.

## 11. Release checklist

Before marking a release as safe:

- [ ] lint passes
- [ ] typecheck passes
- [ ] tests pass
- [ ] production build passes
- [ ] migrations run cleanly on fresh DB
- [ ] no canonical `public.exams` references
- [ ] no direct admin `is_admin` authorization paths
- [ ] mission-control dashboard loads real data
- [ ] exam summary route returns real cards
- [ ] notification preferences page works
- [ ] audit actions are written for admin mutations
- [ ] eligibility queue failures are visible or documented as a known gap

## 12. Automation expansion gate

Automation expansion is blocked until:

```text
RBAC enforcement complete
Audit viewer operational
Eligibility queue monitor operational
```

Strategic rule:

```text
Trust > Speed
Control > Automation
Determinism > Heuristics
```


## 13. Stakeholder control-support minimums

Use this checklist before enabling broader automation or community scale-up.

### Aspirant-facing controls

- Eligibility explanations must remain deterministic-source-derived (AI may explain, not decide).
- Application tracker states should map to explicit next actions.
- Official-link integrity must be preserved in all user-facing recruitment surfaces.

### Manager / operations controls

- Daily review: eligibility queue age buckets, failure/retry distribution, notification send failures, scraper approval backlog.
- Weekly review: unresolved audit anomalies and policy exceptions.
- Incident mode: ensure emergency notification kill switch and queue triage playbook are executable without ad-hoc SQL where possible.

### Governance admin controls

- No publish action should bypass org verification, provenance checks, and required-field completeness gates.
- Source trust checks must include redirect and domain verification before canonical URL acceptance.
- Admin mutations must remain audit-visible and permission-guarded at server action level.

### Community moderation controls (Phase 8+)

- Keep `official_updates` channels admin-write only.
- Enforce human-review moderation for AI-flagged content at launch.
- Require mentor verification and copyright moderation before marketplace/resource expansion.


## 11. Admin audit alerting drill (P0+)

Configure `ADMIN_ALERT_WEBHOOK_URL` in each environment that runs admin actions.

Forced drill (safe):
1. Temporarily set invalid DB permission for `admin_audit_logs` write in staging, or point app to a staging role lacking insert rights.
2. Execute a critical admin action (e.g. publish/withdraw recruitment).
3. Verify:
   - primary action completes,
   - app logs `[audit-failure] ...`,
   - webhook endpoint receives payload with `source=admin_action_audit`.
4. Restore normal DB permissions and repeat once to confirm no false alerts.
