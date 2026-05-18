# Marketplace Hosted Assets — PR2

Admin-only review shell for hostable course assets. Builds on the
delivery split (PR1, migration 112) without touching purchase, refund,
payout, enrollment, or lesson flow. Storage is metadata-only — no bucket
reads, no env vars, no signed URLs in PR2.

## Files touched

- `app/supabase/migrations/114_marketplace_assets_schema.sql` (new)
- `app/backend/app/api/admin_marketplace.py` (appended PR2 section)
- `app/backend/tests/marketplace/test_admin_marketplace.py` (32 new cases)

## Schema (migration `114`)

### `public.marketplace_assets`

| column                            | type        | notes                                                          |
| --------------------------------- | ----------- | -------------------------------------------------------------- |
| `id`                              | uuid pk     |                                                                |
| `course_id`                       | uuid        | FK → `courses(id)` ON DELETE CASCADE                           |
| `asset_type`                      | text        | `notes_pdf` / `test_session` / `video` / `zip` / `bundle` / `other` |
| `title`, `description`            | text        |                                                                |
| `status`                          | text        | see state machine below                                        |
| `copyright_risk_status`           | text        | `unchecked` / `clear` / `flagged` / `rejected` / `known_infringing` |
| `protection_policy`               | jsonb       | default: standard / no download / no print / watermark / 3 dl / 50 view-per-day |
| `ownership_attestation_signed_at` | timestamptz | populated by seller upload PR                                  |
| `ownership_attestation_text`      | text        |                                                                |
| `approved_by` / `approved_at` / `approval_reason` |     | filled by `/approve`                                           |
| `rejected_by` / `rejected_at` / `rejection_reason` |     | filled by `/reject`                                            |
| `metadata`                        | jsonb       | extension point                                                |
| `created_at` / `updated_at`       | timestamptz | `tg_set_updated_at()` trigger                                  |

### `public.marketplace_asset_files`

| column                | type        | notes                                                                |
| --------------------- | ----------- | -------------------------------------------------------------------- |
| `id`                  | uuid pk     |                                                                      |
| `asset_id`            | uuid        | FK → `marketplace_assets(id)` ON DELETE CASCADE                      |
| `file_role`           | text        | `source` / `preview` / `watermark` / `attachment`                    |
| `storage_bucket`      | text        | unique with `storage_path`                                           |
| `storage_path`        | text        |                                                                      |
| `original_filename`   | text        |                                                                      |
| `mime_type`           | text        | allowlist deferred to a later PR                                     |
| `file_size_bytes`     | bigint      |                                                                      |
| `content_hash`        | text        | **sha256 hex, lowercase** (column comment pins format)               |
| `metadata`            | jsonb       |                                                                      |
| `created_at` / `updated_at` | timestamptz | trigger                                                        |

Same `content_hash` across different assets is intentionally allowed.

### `public.marketplace_infringing_hashes`

| column         | type | notes                                                |
| -------------- | ---- | ---------------------------------------------------- |
| `id`           | uuid |                                                      |
| `content_hash` | text | unique. sha256 hex, lowercase                        |
| `reason`       | text |                                                      |
| `claim_id`     | uuid | standalone — FK to `copyright_claims` lands in DMCA PR |
| `added_by`     | uuid | FK → `profiles(id)` ON DELETE SET NULL               |

### RLS

| table                              | policy                                       | grant                                                         |
| ---------------------------------- | -------------------------------------------- | ------------------------------------------------------------- |
| `marketplace_assets`               | `marketplace_assets_service_role_all`        | `service_role` FOR ALL                                        |
| `marketplace_assets`               | `marketplace_assets_public_select`           | `authenticated` SELECT WHERE `status='published'` AND course is published |
| `marketplace_asset_files`          | `marketplace_asset_files_service_role_all`   | `service_role` FOR ALL (no authenticated policy)              |
| `marketplace_infringing_hashes`    | `marketplace_infringing_hashes_service_role_all` | `service_role` FOR ALL (no authenticated policy)          |

Default-deny covers everything else.

## State machine (reachable via PR2 API)

```
draft ──submit-review──▶ pending_review ──approve──▶ approved ──publish──▶ published
  ▲                            │                         │
  └─submit-review── rejected ◀─┴────────reject──────────┘
                              (also approved→rejected via reject)
```

Any other transition → 409 `invalid_state_transition`. `suspended` /
`dmca_removed` are reserved values with **no PR2 API path**.

## API (`/api/admin/marketplace/...`)

| method | path                                       | description                                                                                           |
| ------ | ------------------------------------------ | ----------------------------------------------------------------------------------------------------- |
| GET    | `/courses/{course_id}/assets`              | List assets for a course. Each item carries `file_count` and `primary_file` (first `source` by created_at asc, or null). |
| POST   | `/courses/{course_id}/assets`              | Create asset (`status='draft'`). Validates course exists, delivery_model is hostable, asset_type×delivery_model matrix. |
| PUT    | `/assets/{asset_id}`                       | Patch `title`, `description`, `asset_type`, `protection_policy`, `copyright_risk_status`, `metadata`. **`status` in body → 400 `status_not_patchable_use_transition_endpoint`.** |
| POST   | `/assets/{asset_id}/submit-review`         | `draft|rejected` → `pending_review`.                                                                  |
| POST   | `/assets/{asset_id}/approve`               | `pending_review` → `approved`. Sets `approved_by/at`, optional `approval_reason`. Lifts `copyright_risk_status='unchecked'` to `clear`. |
| POST   | `/assets/{asset_id}/reject`                | `pending_review|approved` → `rejected`. Sets `rejected_by/at`, optional `rejection_reason`.           |
| POST   | `/assets/{asset_id}/publish`               | `approved` → `published`. Blocks on `copyright_risk_status ∈ {flagged, rejected, known_infringing}` with `copyright_block`. Requires ≥1 `source|preview` file unless `asset_type='test_session'` (bundle NOT exempt). |
| GET    | `/assets/{asset_id}/files`                 | List files. Includes `storage_path` (admin-only surface).                                             |
| POST   | `/assets/{asset_id}/files`                 | Add file row. Validates `content_hash` is sha256 hex lowercase (`invalid_hash_format`), not in infringing list (`infringing_hash_blocked`), `(bucket,path)` not taken (`storage_path_conflict`). MIME allowlist deferred. |

### asset_type × delivery_model matrix

| asset_type     | allowed delivery_model                                                  |
| -------------- | ----------------------------------------------------------------------- |
| `notes_pdf`    | `platform_download`, `platform_course`, `platform_bundle`               |
| `test_session` | `platform_test`, `platform_bundle`                                      |
| `video`        | `platform_course`, `platform_download`, `platform_bundle`               |
| `zip`          | `platform_download`, `platform_bundle`                                  |
| `bundle`       | `platform_bundle`                                                       |
| `other`        | `platform_course`, `platform_download`, `platform_test`, `platform_bundle` |

Mismatch → 422 `asset_type_delivery_mismatch`. Course with
`delivery_model='affiliate_external'` → 422 `delivery_model_not_hostable`.

## Out of scope (later PRs)

- Protected delivery tokens, signed URLs, server streaming, buyer file access
- Public seller upload UI, frontend
- Test-session delivery, watermarking, DMCA cascade, payout escrow
- Cart / checkout / enrollment entitlement
- `ownership_attestation_*` field population (seller upload PR fills these)
- MIME allowlist on file uploads
- `suspended` / `dmca_removed` transitions
- Separate audit log table — PR2 uses on-row `approved_by/at/reason` and
  `rejected_by/at/reason` plus the shared `admin_audit_logs` row written
  by `_audit`.
- Env vars for marketplace storage bucket

## Tests

`tests/marketplace/test_admin_marketplace.py` — **32 new cases** (PR1 still
green, 47 total). Highlights:

- delivery_model gating: `affiliate_external` → 422; matrix mismatches → 422
- state machine: every documented transition + every documented 409
- publish guards: source-file requirement, `test_session` exempt, `bundle`
  NOT exempt, `copyright_risk_status ∈ {flagged, rejected, known_infringing}` → 409
- hash gates: sha256 regex 400, infringing-hash blocklist 409,
  `(bucket,path)` collision 409, same hash across two assets OK
- pagination: limit/offset honoured, `limit>200` → 422
- **public leak test**: `marketplace.py` `/resources/{id}` response never
  contains `storage_path`, `storage_bucket`, or file rows
- **reserved-state test**: no PR2 path can set `suspended` or `dmca_removed`

## Run

```bash
cd app/backend
python -m pytest tests/marketplace/test_admin_marketplace.py -v
python -m py_compile app/api/admin_marketplace.py
```
