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

Success. No rows returned


----------------------------------------------------
-- 067
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='user_recruitment_applications'
  and column_name in ('fee_amount','documents_pending','clicked_apply_at','application_number','fee_paid','notes','submitted_at')
order by column_name;
[
  {
    "column_name": "application_number",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "documents_pending",
    "data_type": "jsonb",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "fee_amount",
    "data_type": "numeric",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "fee_paid",
    "data_type": "boolean",
    "is_nullable": "YES",
    "column_default": "false"
  },
  {
    "column_name": "notes",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "submitted_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "YES",
    "column_default": null
  }
]
--------------------------------------------------------

-- 068 required columns + dedupe index
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='notification_alerts'
  and column_name in ('dedupe_key','title','body','source','source_stage','generated_at')
order by column_name;
Success. No rows returned
-----------------------------------------------

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='notification_alerts'
  and indexname='notification_alerts_dedupe_key_uidx';
Success. No rows returned
---------------------------------------------


-- 069 governance columns + constraints
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='notification_preferences'
  and column_name in ('in_app_types_disabled','email_types_disabled','digest_preference','quiet_hours_start','quiet_hours_end','deadline_reminder_windows')
order by column_name;
Success. No rows returned



select conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname='public' and t.relname='notification_preferences'
  and conname in ('notification_preferences_digest_preference_check','notification_prefs_quiet_hours_bounds');
Success. No rows returned



-- 070 table, index, RLS, policies
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='notification_generation_runs'
order by ordinal_position;
Success. No rows returned




select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='notification_generation_runs';
Success. No rows returned




select relrowsecurity
from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname='notification_generation_runs';
Success. No rows returned




select policyname, cmd, qual, with_check
from pg_policies
where schemaname='public' and tablename='notification_generation_runs'
order by policyname;
Success. No rows returned



---------------------------------------------
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
[
  {
    "table_name": "source_registry",
    "column_name": "anti_bot_risk",
    "data_type": "text"
  },
  {
    "table_name": "source_registry",
    "column_name": "can_publish_directly",
    "data_type": "boolean"
  },
  {
    "table_name": "source_registry",
    "column_name": "discovery_only",
    "data_type": "boolean"
  },
  {
    "table_name": "source_registry",
    "column_name": "is_official_source",
    "data_type": "boolean"
  },
  {
    "table_name": "source_registry",
    "column_name": "jurisdiction",
    "data_type": "text"
  },
  {
    "table_name": "source_registry",
    "column_name": "notes",
    "data_type": "text"
  },
  {
    "table_name": "source_registry",
    "column_name": "state",
    "data_type": "text"
  }
]
------------------------------------------------

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
Success. No rows returned



-----------------------------------------
select conname, pg_get_constraintdef(c.oid) as def
from pg_constraint c
join pg_class t on t.oid = c.conrelid
join pg_namespace n on n.oid = t.relnamespace
where n.nspname='public' and t.relname='scrape_queue'
  and conname='scrape_queue_status_check';
  [
  {
    "conname": "scrape_queue_status_check",
    "def": "CHECK ((status = ANY (ARRAY['pending'::text, 'reviewing'::text, 'approved'::text, 'rejected'::text, 'duplicate'::text, 'promoted'::text])))"
  }
]
-------------------------------------------

-- 074
select column_name, data_type
from information_schema.columns
where table_schema='public' and table_name='recruitments' and column_name='slug';
[
  {
    "column_name": "slug",
    "data_type": "text"
  }
]
---------------------------------

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='recruitments' and indexname='idx_recruitments_slug_unique';
[
  {
    "indexname": "idx_recruitments_slug_unique",
    "indexdef": "CREATE UNIQUE INDEX idx_recruitments_slug_unique ON public.recruitments USING btree (slug) WHERE (slug IS NOT NULL)"
  }
]
---------------------------------------

-- 075 data policy columns
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='source_registry'
  and column_name in ('is_official_source','can_publish_directly','discovery_only')
order by column_name;
[
  {
    "column_name": "can_publish_directly",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "column_name": "discovery_only",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  },
  {
    "column_name": "is_official_source",
    "data_type": "boolean",
    "is_nullable": "NO",
    "column_default": "false"
  }
]
---------------------------------------
-- 076 table + index
select column_name, data_type, is_nullable, column_default
from information_schema.columns
where table_schema='public' and table_name='recruitment_events'
order by ordinal_position;
[
  {
    "column_name": "id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": "gen_random_uuid()"
  },
  {
    "column_name": "recruitment_id",
    "data_type": "uuid",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "column_name": "event_type",
    "data_type": "text",
    "is_nullable": "NO",
    "column_default": null
  },
  {
    "column_name": "title",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "official_url",
    "data_type": "text",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "source_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "scrape_queue_id",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "event_date",
    "data_type": "date",
    "is_nullable": "YES",
    "column_default": null
  },
  {
    "column_name": "metadata",
    "data_type": "jsonb",
    "is_nullable": "NO",
    "column_default": "'{}'::jsonb"
  },
  {
    "column_name": "created_at",
    "data_type": "timestamp with time zone",
    "is_nullable": "NO",
    "column_default": "now()"
  },
  {
    "column_name": "created_by",
    "data_type": "uuid",
    "is_nullable": "YES",
    "column_default": null
  }
]
------------------------------

select indexname, indexdef
from pg_indexes
where schemaname='public' and tablename='recruitment_events';

[
  {
    "indexname": "recruitment_events_pkey",
    "indexdef": "CREATE UNIQUE INDEX recruitment_events_pkey ON public.recruitment_events USING btree (id)"
  },
  {
    "indexname": "idx_recruitment_events_recruitment_id",
    "indexdef": "CREATE INDEX idx_recruitment_events_recruitment_id ON public.recruitment_events USING btree (recruitment_id)"
  },
  {
    "indexname": "idx_recruitment_events_event_type",
    "indexdef": "CREATE INDEX idx_recruitment_events_event_type ON public.recruitment_events USING btree (event_type)"
  },
  {
    "indexname": "idx_recruitment_events_event_date",
    "indexdef": "CREATE INDEX idx_recruitment_events_event_date ON public.recruitment_events USING btree (event_date)"
  },
  {
    "indexname": "idx_recruitment_events_source_id",
    "indexdef": "CREATE INDEX idx_recruitment_events_source_id ON public.recruitment_events USING btree (source_id)"
  },
  {
    "indexname": "idx_recruitment_events_scrape_queue_id",
    "indexdef": "CREATE INDEX idx_recruitment_events_scrape_queue_id ON public.recruitment_events USING btree (scrape_queue_id)"
  }
]
------------------------------------
```

## 4) Live status (from executed verification SQL)

> Latest update note: the command output payload was referenced as `[paste results]` but not included in this repo commit context.
> Until the concrete result rows are pasted into this document, the live state classification remains `unknown`.

### 4.1 Migration-by-migration status (067–076)

Live-output parsing block (fill this from pasted SQL outputs):

```text
067 => <applied in live schema|missing|partially applied|unknown>
068 => <applied in live schema|missing|partially applied|unknown>
069 => <applied in live schema|missing|partially applied|unknown>
070 => <applied in live schema|missing|partially applied|unknown>
071 => <applied in live schema|missing|partially applied|unknown>
072 => <applied in live schema|missing|partially applied|unknown>
073 => <applied in live schema|missing|partially applied|unknown>
074 => <applied in live schema|missing|partially applied|unknown>
075 => <applied in live schema|missing|partially applied|unknown>
076 => <applied in live schema|missing|partially applied|unknown>
```

| Migration | Live status | Evidence from verification queries |
|---|---|---|
| 067_applications_tracker_fields | **unknown** | Pending pasted result set for `information_schema.columns` check. |
| 068_notification_next_action_dedupe | **unknown** | Pending pasted result set for `notification_alerts` columns + `notification_alerts_dedupe_key_uidx`. |
| 069_notification_preferences_governance | **unknown** | Pending pasted result set for governance columns + check constraints. |
| 070_notification_generation_runs | **unknown** | Pending pasted result set for table columns + index + RLS + policies. |
| 071_trust_pipeline_hardening | **unknown** | Pending pasted result set for trust-pipeline columns + indexes. |
| 072_field_evidence_alignment | **unknown** | Pending pasted result set for `corrected_value`, FK, and promoted index. |
| 073_scrape_queue_promoted_status | **unknown** | Pending pasted result set for `scrape_queue_status_check` includes `promoted`. |
| 074_recruitment_slug_support | **unknown** | Pending pasted result set for `recruitments.slug` + unique index. |
| 075_source_intelligence_policy | **unknown** | Pending pasted result set for policy-governance columns in `source_registry`. |
| 076_recruitment_events | **unknown** | Pending pasted result set for `recruitment_events` table + index. |

Classification definitions used:
- **applied in live schema**: all expected objects found.
- **partially applied**: at least one expected object found and at least one missing.
- **missing**: none of expected objects found.
- **unknown**: verification output unavailable/insufficient to classify.

## 5) Exact idempotent SQL for missing pieces only

Do **not** run these automatically. Execute only after confirming a specific migration is `missing` or `partially applied` from live verification output, and only execute the specific block that corresponds to the missing object(s).
Do **not** run these automatically. Execute only after confirming a specific migration is `missing` or `partially applied` from live verification output.

```sql
-- 069: add quiet-hours bounds constraint only if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'notification_preferences'
      AND c.conname = 'notification_prefs_quiet_hours_bounds'
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

-- 072: add FK only if promoted_recruitment_id exists and FK is missing
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'scrape_queue'
      AND column_name = 'promoted_recruitment_id'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM pg_constraint c
    JOIN pg_class t ON t.oid = c.conrelid
    JOIN pg_namespace n ON n.oid = t.relnamespace
    WHERE n.nspname = 'public'
      AND t.relname = 'scrape_queue'
      AND c.conname = 'scrape_queue_promoted_recruitment_id_fkey'
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
      REFERENCES public.recruitments(id)
      ON DELETE SET NULL;
  END IF;
END $$;

-- 072: add promoted index only if missing
CREATE INDEX IF NOT EXISTS idx_scrape_queue_promoted_recruitment_id
  ON public.scrape_queue(promoted_recruitment_id);
```

## 6) Final safe-to-repair migration history table

Per instruction, migration history repair is **not** recommended yet until schema parity is confirmed with concrete live results.

| Migration | Current status | Safe to repair migration history now? | Condition to become safe |
|---|---|---|---|
| 067 | unknown | **No** | Provide and validate live query evidence. |
| 068 | unknown | **No** | Provide and validate live query evidence. |
| 069 | unknown | **No** | Confirm constraints/columns parity; apply missing-piece SQL only if needed. |
| 070 | unknown | **No** | Confirm table/index/RLS/policy parity. |
| 071 | unknown | **No** | Confirm all trust-pipeline columns/indexes parity. |
| 072 | unknown | **No** | Confirm `corrected_value` + FK/index parity. |
| 073 | unknown | **No** | Confirm status check constraint includes `promoted`. |
| 074 | unknown | **No** | Confirm slug column + unique index parity. |
| 075 | unknown | **No** | Confirm three governance columns parity. |
| 076 | unknown | **No** | Confirm table + index parity. |

Once every row is either `applied in live schema` or remediated to parity via missing-piece SQL, then and only then mark `Safe to repair migration history now? = Yes`.
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
