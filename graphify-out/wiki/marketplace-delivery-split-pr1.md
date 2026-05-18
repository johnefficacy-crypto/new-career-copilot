# Marketplace Delivery Split — PR1

Foundational schema for separating **affiliate / external partner products**
from **on-platform courses** in the marketplace. PR1 lays the ground; PR2+
will layer assets / files / tokens / versions / tests / bundles and the
PR7 copyright-takedown work.

## Files touched

- `app/supabase/migrations/112_marketplace_delivery_split.sql` (new)
- `app/backend/app/api/admin_marketplace.py` (validation hook)
- `app/backend/tests/marketplace/test_admin_marketplace.py` (test diff)

## Schema additions

### `public.courses` — additive columns

| column                 | type      | notes                                                          |
| ---------------------- | --------- | -------------------------------------------------------------- |
| `delivery_model`       | text      | NOT NULL, default `platform_course`. CHECK constrains values.  |
| `affiliate_partner_id` | uuid      | FK → `affiliate_partners(id)`, ON DELETE RESTRICT.             |
| `external_product_url` | text      | Free text URL; host-allowlist is enforced in API, not DB.      |

Allowed `delivery_model` values:

```
affiliate_external | platform_course | platform_download | platform_test | platform_bundle
```

### `public.affiliate_partners` — new table

| column                | type        | notes                                            |
| --------------------- | ----------- | ------------------------------------------------ |
| `id`                  | uuid pk     |                                                  |
| `name`                | text        | Unique on `lower(name)`.                         |
| `status`              | text        | `active` / `suspended` / `archived`.             |
| `allowed_domains`     | text[]      | Hostnames that may appear in `external_product_url`. |
| `disclosure_template` | text        | Optional template surfaced to admins.            |
| `created_at`          | timestamptz | default `now()`                                  |
| `updated_at`          | timestamptz | maintained by `tg_set_updated_at()` trigger      |

### Backfill (idempotent)

```sql
update public.courses
   set delivery_model = 'affiliate_external'
 where is_affiliate is true
   and delivery_model = 'platform_course';
```

Existing non-affiliate rows keep `platform_course` (the default).

### View — `admin_courses_needing_delivery_review`

Triage list for ops: courses whose lessons still point at internal /
Supabase Storage URLs even though they may have been mis-classified.

```sql
create or replace view public.admin_courses_needing_delivery_review as
select c.id as course_id, c.title, c.delivery_model, c.status,
       count(l.id) as internal_lesson_count
  from public.courses c
  join public.course_sections s on s.course_id = c.id
  join public.lessons l         on l.section_id = s.id
 where l.content_url is not null
   and ( l.content_url ilike '%supabase.co/storage/%'
      or l.content_url ilike '%/storage/v1/object/%'
      or l.content_url ilike '/storage/%'
      or l.content_url ilike 'storage://%' )
 group by c.id, c.title, c.delivery_model, c.status;
```

## RLS — `affiliate_partners`

| policy                  | grant                                              |
| ----------------------- | -------------------------------------------------- |
| `ap_service_role_all`   | `service_role` FOR ALL                             |
| `ap_auth_select_active` | `authenticated` FOR SELECT WHERE `status='active'` |

Authenticated users may read partner metadata when the partner is active.
Column-level scoping (only `name`, `status`, `disclosure_template` exposed
publicly) is enforced in the API layer; no write access for non-admins.

## API enforcement (`POST/PUT /admin/marketplace/courses`)

On every create / update:

- `delivery_model='affiliate_external'` **requires**:
  - `is_affiliate=true`
  - `affiliate_disclosure` non-empty
  - `affiliate_partner_id` present
  - `external_product_url` present **and** its host appears in
    `partner.allowed_domains`
  - `partner.status='active'`
- Any other `delivery_model` **must** have
  - `external_product_url` null
  - `affiliate_partner_id` null

Update path merges the patch onto the current row before re-validating, so
partial patches can't bypass the rule by omitting fields.

## Sample output — `admin_courses_needing_delivery_review`

Fixture used (mirrors the test in `test_review_view_returns_courses_with_internal_content_url`):

```
courses
  c-internal  "Internal Storage Course"   delivery_model=platform_course   status=draft
  c-external  "External Storage Course"   delivery_model=platform_course   status=draft

course_sections
  s-int  course_id=c-internal
  s-ext  course_id=c-external

lessons
  l-int  section_id=s-int  content_url=https://abc.supabase.co/storage/v1/object/sign/courses/x.mp4
  l-ext  section_id=s-ext  content_url=https://youtube.com/watch?v=xyz
```

View output:

| course_id    | course_title              | delivery_model    | course_status | internal_lesson_count |
| ------------ | ------------------------- | ----------------- | ------------- | --------------------- |
| `c-internal` | Internal Storage Course   | `platform_course` | `draft`       | 1                     |

`c-external` is **not** listed — its only lesson lives on `youtube.com`.

## Out of scope (PR1)

- `marketplace_assets` / files / tokens / versions / test tables → PR2+
- `copyright_takedowns.apply_removal` changes → PR7
- Purchase / refund / payout flows untouched
- `enrollments.status` remains the single entitlement source
- No `seller_id` introduced; `courses.instructor_id` continues to anchor providers
- `lessons.content_url` semantics unchanged
