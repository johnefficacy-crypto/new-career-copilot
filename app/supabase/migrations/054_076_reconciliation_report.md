# Migration Reconciliation: 054 → 076

Scope: reconcile repository migrations with live schema where migration history only records through `053`.

## 1) Repo migration files in range

Missing in repo: `055`–`066`.

Present:
- `067_applications_tracker_fields.sql`
- `068_notification_next_action_dedupe.sql`
- `069_notification_preferences_governance.sql`
- `070_notification_generation_runs.sql`
- `071_trust_pipeline_hardening.sql`
- `072_field_evidence_alignment.sql`
- `073_scrape_queue_promoted_status.sql`
- `074_recruitment_slug_support.sql`
- `075_source_intelligence_policy.sql`
- `076_recruitment_events.sql`

## 2) Change inventory by migration

### 067_applications_tracker_fields
- **Tables created**: none
- **Columns added** (`public.user_recruitment_applications`):
  - `fee_amount numeric`
  - `documents_pending jsonb default '[]'::jsonb`
  - `clicked_apply_at timestamptz`
  - `application_number text`
  - `fee_paid boolean`
  - `notes text`
  - `submitted_at timestamptz`
- **Indexes added**: none
- **Constraints changed**: none
- **Functions/triggers/policies**: none

### 068_notification_next_action_dedupe
- **Tables created**: none
- **Columns added** (`notification_alerts`):
  - `dedupe_key text`
  - `title text`
  - `body text`
  - `source text`
  - `source_stage text`
  - `generated_at timestamptz`
- **Indexes added**:
  - `notification_alerts_dedupe_key_uidx` unique partial index on `(dedupe_key)` where not null
- **Constraints changed**: none
- **Functions/triggers/policies**: none

### 069_notification_preferences_governance
- **Tables created**: none
- **Columns added** (`public.notification_preferences`):
  - `in_app_types_disabled text[] not null default '{}'`
  - `email_types_disabled text[] not null default '{}'`
  - `digest_preference text not null default 'off'` with check in `('off','daily','weekly')`
  - `quiet_hours_start smallint`
  - `quiet_hours_end smallint`
  - `deadline_reminder_windows text[] not null default '{48h,24h,6h}'`
- **Indexes added**: none
- **Constraints changed**:
  - adds `notification_prefs_quiet_hours_bounds` check constraint
- **Functions/triggers/policies**: none

### 070_notification_generation_runs
- **Tables created**:
  - `public.notification_generation_runs`
- **Columns added**: n/a (new table)
- **Indexes added**:
  - `idx_notification_generation_runs_created_at` on `(created_at desc)`
- **Constraints changed**:
  - `status` check constraint (`running|success|failed`)
  - FK: `triggered_by_user_id -> auth.users(id)`
- **Functions/triggers/policies**:
  - enables RLS
  - policy `notification_generation_runs_admin_read` (select for admin/super_admin)
  - policy `notification_generation_runs_service_all` (all for service role)

### 071_trust_pipeline_hardening
- **Tables created**: none
- **Columns added**:
  - `public.source_registry`: `jurisdiction`, `state`, `verification_status`, `anti_bot_risk`, `notes`
  - `public.scrape_queue`: `source_id`, `raw_title`, `raw_url`, `raw_payload`, `extracted_fields`, `warnings`, `duplicate_candidates`, `error_message`, `reviewed_by`, `promoted_recruitment_id`
  - `public.organizations`: `official_website`, `verified_domain`, `verification_status`, `trust_score`, `notes`
  - `public.admin_audit_logs`: `admin_user_id`, `before_payload`, `after_payload`, `metadata`
- **Indexes added**:
  - `idx_source_registry_verification_status`
  - `idx_scrape_queue_status_created`
  - `idx_org_verification_status`
- **Constraints changed**: none
- **Functions/triggers/policies**: none

### 072_field_evidence_alignment
- **Tables created**: none
- **Columns added**:
  - `public.extracted_field_evidence.corrected_value jsonb`
  - `public.scrape_queue.promoted_recruitment_id uuid references public.recruitments(id) on delete set null`
- **Indexes added**:
  - `idx_scrape_queue_promoted_recruitment_id`
- **Constraints changed**:
  - FK introduced for `scrape_queue.promoted_recruitment_id`
- **Functions/triggers/policies**: none

### 073_scrape_queue_promoted_status
- **Tables created**: none
- **Columns added**: none
- **Indexes added**: none
- **Constraints changed**:
  - replaces `scrape_queue_status_check` with allowed statuses including `promoted`
- **Functions/triggers/policies**: none

### 074_recruitment_slug_support
- **Tables created**: none
- **Columns added**:
  - `public.recruitments.slug text`
- **Indexes added**:
  - `idx_recruitments_slug_unique` partial unique index on `(slug)` where not null
- **Constraints changed**: none
- **Functions/triggers/policies**: none

### 075_source_intelligence_policy
- **Tables created**: none
- **Columns added** (`public.source_registry`):
  - `is_official_source boolean not null default false`
  - `can_publish_directly boolean not null default true`
  - `discovery_only boolean not null default false`
- **Indexes added**: none
- **Constraints changed**: none
- **Functions/triggers/policies**: none
- **Data updates**:
  - updates rows where `source_type in ('aggregator','coaching_blog','social_signal')`

### 076_recruitment_events
- **Tables created**:
  - `public.recruitment_events`
- **Columns added**: n/a (new table)
- **Indexes added**:
  - `idx_recruitment_events_recruitment` on `(recruitment_id, event_type, created_at desc)`
- **Constraints changed**:
  - check on `event_type`
  - FK: `recruitment_id -> public.recruitments(id)`
  - FK: `source_id -> public.source_registry(id)`
  - FK: `scrape_queue_id -> public.scrape_queue(id)`
  - FK: `created_by -> auth.users(id)`
- **Functions/triggers/policies**: none

## 3) Live schema verification queries

Run read-only checks below in SQL editor before any migration application.

```sql
-- Migration ledger visibility (if using Supabase migrations table)
select *
from supabase_migrations.schema_migrations
where version between '054' and '076'
order by version;

-- 067
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='user_recruitment_applications'
  and column_name in ('fee_amount','documents_pending','clicked_apply_at','application_number','fee_paid','notes','submitted_at')
order by column_name;

-- 068 required columns + dedupe index
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='notification_alerts'
  and column_name in ('dedupe_key','title','body','source','source_stage','generated_at')
order by column_name;

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='notification_alerts'
  and indexname='notification_alerts_dedupe_key_uidx';

-- 069 governance columns + constraints
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='notification_preferences'
  and column_name in ('in_app_types_disabled','email_types_disabled','digest_preference','quiet_hours_start','quiet_hours_end','deadline_reminder_windows')
order by column_name;

select conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname='public' and t.relname='notification_preferences'
  and conname in ('notification_preferences_digest_preference_check','notification_prefs_quiet_hours_bounds');

-- 070 table, index, RLS, policies
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='notification_generation_runs'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='notification_generation_runs';

select relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='notification_generation_runs';

select policyname, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='notification_generation_runs'
order by policyname;

-- 071/072/073 scrape_queue + trust fields
select table_name, column_name, data_type
from information_schema.columns
where table_schema='public'
  and (
    (table_name='source_registry' and column_name in ('jurisdiction','state','verification_status','anti_bot_risk','notes','is_official_source','can_publish_directly','discovery_only'))
    or (table_name='scrape_queue' and column_name in ('source_id','raw_title','raw_url','raw_payload','extracted_fields','warnings','duplicate_candidates','error_message','reviewed_by','promoted_recruitment_id'))
    or (table_name='organizations' and column_name in ('official_website','verified_domain','verification_status','trust_score','notes'))
    or (table_name='admin_audit_logs' and column_name in ('admin_user_id','before_payload','after_payload','metadata'))
    or (table_name='extracted_field_evidence' and column_name='corrected_value')
  )
order by table_name, column_name;

select indexname, indexdef
from pg_indexes
where schemaname='public'
  and indexname in (
    'idx_source_registry_verification_status',
    'idx_scrape_queue_status_created',
    'idx_org_verification_status',
    'idx_scrape_queue_promoted_recruitment_id'
  )
order by indexname;

select conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname='public' and t.relname='scrape_queue'
  and conname='scrape_queue_status_check';

-- 074
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='recruitments' and column_name='slug';

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='recruitments' and indexname='idx_recruitments_slug_unique';

-- 075 data policy columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='source_registry'
  and column_name in ('is_official_source','can_publish_directly','discovery_only')
order by column_name;

-- 076 table + index
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='recruitment_events'
order by ordinal_position;

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='recruitment_events';
```

## 4) Status rubric (after running verification)

Because this repository environment has no live DB credentials, statuses below are **provisional** based on migration SQL idempotency risk:

- 067: **safe to apply as-is**
- 068: **safe to apply as-is**
- 069: **needs idempotent rewrite** (named check constraint added without `if not exists` guard)
- 070: **safe to apply as-is**
- 071: **partially applied risk** (overlaps with 072 on `promoted_recruitment_id`; no FK in 071)
- 072: **safe to apply as-is** (will backfill FK/index if 071 ran first)
- 073: **safe to apply as-is**
- 074: **safe to apply as-is**
- 075: **safe to apply as-is**
- 076: **safe to apply as-is**

Use this classifier query-by-query:
- All objects present, migration absent in history → **already applied manually**
- Some objects present, some missing → **partially applied**
- No objects present → **missing**

## 5) Missing-pieces-only SQL (idempotent reconciliation)

```sql
-- 069: robust quiet-hours constraint create
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname='public'
      AND t.relname='notification_preferences'
      AND c.conname='notification_prefs_quiet_hours_bounds'
  ) THEN
    ALTER TABLE public.notification_preferences
      ADD CONSTRAINT notification_prefs_quiet_hours_bounds
      CHECK (
        (quiet_hours_start IS NULL AND quiet_hours_end IS NULL)
        OR (quiet_hours_start BETWEEN 0 AND 23 AND quiet_hours_end BETWEEN 0 AND 23)
      );
  END IF;
END $$;

-- 072 FK backfill if column exists but FK missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema='public' AND table_name='scrape_queue' AND column_name='promoted_recruitment_id'
  )
  AND NOT EXISTS (
    SELECT 1 FROM pg_constraint c
    JOIN pg_class t ON t.oid=c.conrelid
    JOIN pg_namespace n ON n.oid=t.relnamespace
    WHERE n.nspname='public' AND t.relname='scrape_queue' AND c.contype='f'
      AND c.conname='scrape_queue_promoted_recruitment_id_fkey'
  ) THEN
    ALTER TABLE public.scrape_queue
      ADD CONSTRAINT scrape_queue_promoted_recruitment_id_fkey
      FOREIGN KEY (promoted_recruitment_id)
      REFERENCES public.recruitments(id) ON DELETE SET NULL;
  END IF;
END $$;

create index if not exists idx_scrape_queue_promoted_recruitment_id
  on public.scrape_queue(promoted_recruitment_id);
```

## 6) Recommendation on migration history repair

Recommended after schema parity is confirmed:
1. Do **not** re-run unsafe/non-idempotent migration blocks blindly.
2. Reconcile schema using missing-pieces-only SQL.
3. Insert/repair migration history entries (`054`–`076`) to match actual schema state so future deploys remain deterministic.
4. Store this reconciliation report in repo and attach verification query results as evidence.
