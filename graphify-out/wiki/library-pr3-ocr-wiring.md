# Library PR3 — OCR Wiring + `/pages` light listing

Builds on PR1 (#326), PR2 (#328), and the post-#328 hot-fix (#331).
Personal library only — no admin ingestion, no marketplace assets, no
RAG chunks.

## `GET /api/library/items/{item_id}/pages` — additive params

| param | type | default | behavior |
|---|---|---|---|
| `include_text` | `bool` | `True` | when `False`, the `text_content` key is *omitted* from each page object (not nulled). |
| `limit` | `int?` | `None` → 100 | optional cap on pages returned. Pydantic rejects out-of-range with 422; the hard ceiling is `LIBRARY_PAGES_MAX_LIMIT` (default 500). |
| `offset` | `int` | `0` | pagination offset, ≥ 0. |

Default-call response (no params) is byte-for-byte identical to the
pre-PR3 shape — the existing PR2 tests pin that contract.

`include_text=false` is intended for "did this page have content?"
style UIs (page-number badges, char-count chips, OCR-needed
indicators). Omitting the key rather than nulling it lets clients
distinguish "client opted out of text" from "extractor returned an
empty page" — the latter is already encoded via
`extraction_status='empty'`.

## `library_ocr_jobs` (migration 114)

Separate from `document_processing_jobs` (migration 111) because the
OCR state machine introduces three statuses that don't apply to the
generic text-extract / layout-parse / table-extract job types:
`pending`, `skipped`, `cancelled`.

```text
columns
  id, item_id, user_id, status, engine, engine_version,
  trigger_reason, pages_total, pages_processed,
  error_code, error_message,
  started_at, finished_at, created_at, updated_at
```

* `item_id` → `document_assets(id) on delete cascade`
* `user_id` → `profiles(id) on delete cascade`
* `status` ∈ `pending | queued | running | succeeded | failed | skipped | cancelled`
* `trigger_reason` ∈ `auto_likely_needs_ocr | manual_request | retry`
* `engine` defaults to `'none'` (matches `LIBRARY_OCR_ENGINE` env var)

Indexes:

* `(item_id, status)`, `(user_id, status)`, `(created_at desc)`
* **Partial unique** `library_ocr_jobs_active_unique_idx` on `(item_id)`
  where `status in ('pending','queued','running')` — guarantees at
  most one active job per item.

`updated_at` is maintained by the existing `public.tg_set_updated_at()`
trigger function from migration 014.

## RLS — `library_ocr_jobs`

```text
policy library_ocr_jobs_owner_select
  for select to authenticated using (user_id = auth.uid())
policy library_ocr_jobs_service_role_all
  for all to service_role using (true) with check (true)
```

No insert/update policy for end-user roles in PR3. Every write goes
through the service module so the state machine and engine='none'
auto-finalize stay enforceable from a single code path. Postgres
default-deny covers everything else.

## State machine

```text
                ┌────────────────────────────────┐
   POST /ocr ──▶│   pending                       │──▶ skipped*
                └────────────────────────────────┘     (engine='none')
                       │
                       ▼
                  queued ──▶ running ──▶ succeeded | failed
                       │       │
                       ▼       ▼
                    cancelled
```

`pending | queued | running` are active; `succeeded | failed | skipped
| cancelled` are terminal. A `retry` request on a terminal job creates
a *new* row — the partial unique index only covers active statuses.

## `LIBRARY_OCR_ENGINE='none'` behavior

When the engine setting is `none` (the default in `Settings`):

1. The new row is inserted with `status='pending'`.
2. The service module immediately calls `_finalize_skipped(...)`,
   transitioning the row to `status='skipped'` with
   `error_message='ocr_engine_disabled'` and matching
   `started_at` / `finished_at` timestamps.
3. The HTTP response carries the already-skipped row.

PR4 will replace the synchronous finalize with a real engine claim
loop. Until then, every OCR job lands in `skipped` so dashboards stay
correct and downstream code can build against the full lifecycle.

## Auto-enqueue trigger

The text-extract service (`app/library/text_extract.py`) checks
`metrics.likely_needs_ocr` on the success path. When true, it calls
`auto_enqueue_from_text_extract(sb, item_id=..., user_id=...)`. The
helper:

* never blocks or rewrites the text-extract outcome;
* swallows `OcrJobConflict` by returning the existing active row;
* swallows other `OcrJobError`s with a `logger.warning` and returns
  `None` (best-effort contract).

## Endpoints

| method | path | summary |
|---|---|---|
| POST | `/api/library/items/{item_id}/ocr` | Manually enqueue an OCR job. Body: `{trigger_reason: 'manual_request' | 'retry'}`. 404 if not owned. Returns existing job (with `enqueued=false`, `code='ocr_active_job_exists'`) when an active job is present. |
| GET  | `/api/library/items/{item_id}/ocr` | Latest job for an owned item; 404 when no job exists. |
| GET  | `/api/library/ocr/jobs/{job_id}` | Owner-scoped single-job read; 404 for non-owner. |

All three are also pinned by `tests/test_library_routes.py` so a future
reviewer can't accidentally redeclare any of them.

## Deferred to PR4

* The OCR engine plug-in (tesseract / vision API / whatever).
* Cancellation endpoint (`POST /api/library/ocr/jobs/{id}/cancel`).
* Retry-with-backoff worker semantics.
* Multi-engine selection per request.
* `pages_total` / `pages_processed` progress writes.
