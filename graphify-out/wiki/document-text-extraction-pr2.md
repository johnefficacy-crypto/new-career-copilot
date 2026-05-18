# Document Text Extraction — PR2

Per-page PDF text extraction for personal-library uploads. Continues PR1
(`document_assets`). No worker — extraction runs synchronously inside
`POST /library/items/{id}/process-text` (or lazily for PR1-era uploads
with no job row). Auto-enqueue is best-effort at `complete-upload` time
for PDFs only.

## Files touched

- `app/supabase/migrations/113_document_pages_text_extract.sql` (new)
- `app/backend/app/library/__init__.py` (new, empty package marker)
- `app/backend/app/library/text_extract.py` (new service)
- `app/backend/app/api/library.py` (auto-enqueue + 2 new endpoints)
- `app/backend/tests/test_library_text_extract.py` (new, 19 cases)

## Schema (migration `113`)

### `public.document_pages`

| column              | type        | notes                                                          |
| ------------------- | ----------- | -------------------------------------------------------------- |
| `id`                | uuid pk     |                                                                |
| `document_id`       | uuid        | FK → `document_assets(id)` ON DELETE CASCADE                   |
| `page_number`       | int         | unique with `document_id`                                      |
| `text_content`      | text        | default `''`                                                   |
| `char_count`        | int         | default `0`                                                    |
| `extraction_status` | text        | `extracted` / `empty` / `failed` (CHECK)                       |
| `parser_engine`     | text        | e.g. `pypdf`                                                   |
| `parser_version`    | text        | `app-library-text-extract-v1`                                  |
| `metadata`          | jsonb       | default `{}`                                                   |
| `created_at`        | timestamptz | default `now()`                                                |
| `updated_at`        | timestamptz | maintained by `tg_set_updated_at()` trigger (from migration 014) |

Composite CHECK `chk_document_pages_text_state` ensures
`(empty ∧ char=0) ∨ (extracted ∧ char>0) ∨ failed`.

### Active-job uniqueness

```sql
create unique index uq_document_processing_jobs_active_text_extract
  on document_processing_jobs(document_id, job_type)
  where job_type = 'text_extract' and status in ('queued','running');
```

Single in-flight text_extract job per document.

### `replace_document_pages()` RPC

`security definer` function — service-role only (revoked from public /
anon / authenticated). Deletes prior rows for the document and inserts
the new set in **one transaction**. Used by the service so a parser
crash mid-batch never leaves a half-populated table.

### RLS — `document_pages`

| policy                            | grant                                                       |
| --------------------------------- | ----------------------------------------------------------- |
| `document_pages_owner_select`     | end-users SELECT iff parent `document_assets.owner_user_id = auth.uid()` |
| `document_pages_service_role_all` | `service_role` FOR ALL                                      |

Postgres default-deny covers everything else.

## API

| endpoint                                       | method | behaviour                                                                                                                                                                                                                                  |
| ---------------------------------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `/api/library/complete-upload`                 | POST   | unchanged response; if `mime_type='application/pdf'` and `document_kind ∈ {note_pdf, other}`, auto-enqueue a `text_extract` job. Enqueue errors logged, never raised — upload success cannot regress.                                       |
| `/api/library/items/{id}/process-text`         | POST   | owner-only (non-owner → 404). archived → 409. non-PDF → 400. atomic-claim conflict → 409. blocks until extraction finishes (≤ `EXTRACT_TIMEOUT_SECONDS=30`). lazily enqueues if no active job exists (handles PR1-era uploads).               |
| `/api/library/items/{id}/pages`                | GET    | owner-only. `limit` default 100, capped at 200. `offset` ≥ 0. Returns `{pages, count, limit, offset}` ordered by `page_number asc`. Large `text_content` payloads — `include_text=false` is deferred to PR3.                                |
| `/api/library/items/{id}/jobs`                 | GET    | (PR1) unchanged. Now surfaces `text_extract` rows that PR2 writes.                                                                                                                                                                          |

`process-text` response:

```json
{
  "job": {
    "id": "…",
    "status": "succeeded",
    "job_type": "text_extract",
    "attempt_count": 1,
    "metrics": {
      "page_count": 5, "stored_page_count": 4, "extracted_page_count": 4,
      "empty_page_count": 1, "char_count": 1234, "bytes_processed": 5678,
      "duration_ms": 142, "likely_needs_ocr": false,
      "truncated": false, "page_cap": 500, "timed_out": false
    }
  },
  "document": {"id": "…", "status": "processed"}
}
```

## Service module — `app/library/text_extract.py`

Module constants:

```python
PARSER_ENGINE = "pypdf"
PARSER_VERSION = "app-library-text-extract-v1"
MAX_EXTRACT_PAGES = 500
EXTRACT_TIMEOUT_SECONDS = 30
```

Public functions:

- `enqueue_text_extract_job(sb, document_id) -> {"job": …, "enqueued": bool}`
  Idempotent: returns the existing queued/running job when one exists.
- `run_text_extract_job(sb, job_id, *, user_id) -> {"job": …, "document": …}`
  Atomically claims the job (UPDATE … WHERE status IN ('queued','failed')),
  re-verifies ownership, downloads bytes, parses, writes pages
  transactionally via `replace_document_pages`, flips
  `document_assets.status` from `processing` → `processed` / `failed`.
- `run_text_extract_for_document(sb, document_id, *, user_id)` —
  resolves an active queued job (or lazily enqueues one) and delegates.

State machine:

```
document_assets.status:    uploaded → processing → processed | failed
document_processing_jobs:  queued → running → succeeded | failed
```

Empty PDF (parser returns 0 pages, real `page_count > 0`):

- No `document_pages` rows inserted.
- Job `succeeded`, doc `processed`.
- `metrics.likely_needs_ocr = true` — PR3 OCR pipeline reads this.

Timeout (wall-clock > `EXTRACT_TIMEOUT_SECONDS`):

- Whatever pages were built so far are persisted via the RPC.
- Job `failed` with `error_code='extract_timeout'`,
  `metrics.timed_out=true`, doc `failed`.
- `duration_ms` always recorded.

Size recheck (`file_size_bytes > LIBRARY_MAX_UPLOAD_MB * 1024 * 1024`):

- Fail with `error_code='file_too_large_for_extract'` before download.

## Out of scope (PR3+)

- OCR for `likely_needs_ocr` documents.
- `include_text=false` flag on `/pages` for metadata-only pagination.
- Chunking / embeddings / domain extraction.
- Background worker / queue runner — extraction stays sync.
- Admin / cross-user access — PR1 RLS posture unchanged.

## Tests

`tests/test_library_text_extract.py` — 19 cases, all green:

1. PDF complete-upload enqueues exactly one job
2-3. Non-PDF (text/plain, image/png) does not enqueue
4. `document_kind='other'` + non-PDF MIME does not enqueue
5. Duplicate enqueue returns existing job, `enqueued=false`
6. Owner can POST `/process-text`
7. Non-owner gets 404
8. Archived doc → 409
9. Atomic claim race: second call returns no row (conflict signal)
10. Success path writes pages, job `succeeded`, doc `processed`
11. All-empty PDF → no rows, job `succeeded`, doc `processed`, `likely_needs_ocr=true`
12. Parser exception → job `failed`, doc `failed`
13. Rerun: old row ids gone, new ids present
14. `/pages` returns only owner pages
15. `/pages` pagination respects limit/offset
16. `/pages` `limit>200` rejected by FastAPI validator (422)
17. Page cap (monkeypatched `MAX_EXTRACT_PAGES=3`) stores 3, `truncated=true`
18. Size recheck rejects oversize with `error_code='file_too_large_for_extract'`
19. Lazy enqueue: PDF doc with no job + `/process-text` → job created, then run
20. Timeout marks `timed_out=true`, job `failed`, doc `failed`

PR1 `tests/test_library.py` (11 cases) all still pass.

## Run

```bash
cd app/backend && python -m pytest tests/test_library.py tests/test_library_text_extract.py -v
python -m py_compile app/api/library.py app/library/text_extract.py
```
