# Career Copilot — Phase 3C Implementation Report
**April 2026 · Email Notifications**

---

## 1. Objective
Wire up email delivery for notification_alerts using Resend.
Users who opt in receive exam updates via email on their chosen cadence (instant / daily / weekly).
DPDP Act compliance: email and WhatsApp default to false — users must explicitly opt in.

---

## 2. What Was Built

| Artifact | Purpose |
|---|---|
| `supabase/migrations/014_notification_preferences.sql` | Creates `notification_preferences` table; backfills existing users; RLS |
| `supabase/migrations/015_notification_alerts_email_sent.sql` | Adds `email_sent` flag to `notification_alerts` |
| `supabase/functions/email-dispatcher/index.ts` | Deno Edge Function — dispatches emails via Resend |
| `lib/db/notifications.ts` | `getUserNotifPrefs()` / `upsertUserNotifPrefs()` stubs → real queries |

---

## 3. Email Dispatcher — How It Works

```
pg_cron → email-dispatcher Edge Function
  → fetch notification_preferences WHERE email_enabled = true
  → for each user: fetch notification_alerts WHERE email_sent = false
  → filter by min_priority_email
  → Resend API POST /emails
  → UPDATE notification_alerts SET email_sent = true
```

**Dispatch modes** (passed as `{ "mode": "instant"|"daily"|"weekly"|"all" }` in the POST body):

| Mode | Targets | Recommended cron |
|---|---|---|
| `instant` | users with `email_digest_frequency = 'instant'` | every 5 min |
| `daily` | users with `email_digest_frequency = 'daily'` | daily 8am IST (02:30 UTC) |
| `weekly` | users with `email_digest_frequency = 'weekly'` | Monday 8am IST |
| `all` | all opted-in users | ad-hoc / testing only |

---

## 4. Runbook

### 4.1 Apply migrations (Supabase SQL Editor)

```sql
-- Run in order:
-- 1. Paste supabase/migrations/014_notification_preferences.sql
-- 2. Paste supabase/migrations/015_notification_alerts_email_sent.sql
```

### 4.2 Set Edge Function secrets

In Supabase Dashboard → Edge Functions → Secrets, add:

| Key | Value |
|---|---|
| `RESEND_API_KEY` | Get from resend.com |
| `APP_URL` | `https://your-domain.vercel.app` |

`SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are injected automatically.

### 4.3 Deploy the function

```bash
supabase functions deploy email-dispatcher
```

### 4.4 Add pg_cron jobs (Supabase Dashboard → Database → Cron Jobs)

```sql
-- Instant digest: every 5 minutes
SELECT cron.schedule(
  'email-dispatcher-instant',
  '*/5 * * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/email-dispatcher',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{"mode":"instant"}'::jsonb
    );
  $$
);

-- Daily digest: 8am IST = 02:30 UTC
SELECT cron.schedule(
  'email-dispatcher-daily',
  '30 2 * * *',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/email-dispatcher',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{"mode":"daily"}'::jsonb
    );
  $$
);

-- Weekly digest: Monday 8am IST = Monday 02:30 UTC
SELECT cron.schedule(
  'email-dispatcher-weekly',
  '30 2 * * 1',
  $$
    SELECT net.http_post(
      url     := current_setting('app.supabase_url') || '/functions/v1/email-dispatcher',
      headers := jsonb_build_object(
        'Authorization', 'Bearer ' || current_setting('app.service_role_key'),
        'Content-Type',  'application/json'
      ),
      body    := '{"mode":"weekly"}'::jsonb
    );
  $$
);
```

### 4.5 Verify end-to-end

1. In `notification_preferences`, set `email_enabled = true`, `email_digest_frequency = 'instant'` for a test user.
2. Insert a row into `notification_alerts` for that user with `email_sent = false`.
3. Trigger the function manually:
   ```bash
   supabase functions invoke email-dispatcher --body '{"mode":"instant"}'
   ```
4. Confirm the email arrives in the test inbox.
5. Confirm `notification_alerts.email_sent = true` for that row.

---

## 5. DPDP Act Compliance Notes

- `email_enabled` and `whatsapp_enabled` default to `false` in the DB.
- New users get a preferences row auto-created by `trg_create_notification_prefs` (defaults apply).
- Every email includes an unsubscribe link pointing to `/dashboard/notifications/preferences`.
- Stale alerts (> 72 hours old) are never emailed — prevents spam on backlog.

---

## 6. What's Next (Phase 3D)

- UI: notification preferences page at `/dashboard/notifications/preferences`
- UI: email opt-in toggle in onboarding step 5
- Remove proxy.ts (adds 15–48s dev latency)
- Add error boundaries
- Sentry / LogSnag integration
