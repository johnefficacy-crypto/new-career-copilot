Below is the converted step-by-step guide. Use it as `docs/engineering/scraper-improvement-guide.md`.

Based on the uploaded scraper pipeline analysis , the existing engineering runbook’s implementation order and quality gates , the queue query analysis for admin queue performance , and the current scraper implementation in `runner.py` and `extractor.py`  .

# Step-by-step guide to improve the scraper function

## Objective

Improve the scraper-to-eligibility data flow without breaking the trust-gate design.

The pipeline must remain:

`sources → scrape_runs → scrape_queue → admin review → recruitments/posts/criteria → eligibility recompute → alerts`

Do not introduce auto-approval. New scraped items must stay `pending`. Duplicates must stay `duplicate`. Canonical recruitment data must only be created after admin promotion.

---

## Step 1: Clean the current scraper runner

Target file:

`app/backend/app/scraping/runner.py`

Fix obvious maintainability issues first.

Tasks:

1. Remove duplicate `import re`.
2. Remove duplicate `_slugify()` definition. Keep one version only.
3. Move generic helpers out of `runner.py`:

   * `_now()`
   * `_slugify()`
   * Supabase execution helper
   * source normalization helper
4. Create:

`app/backend/app/common/time.py`

```python
from datetime import datetime, timezone

def utc_now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()
```

5. Create:

`app/backend/app/common/strings.py`

```python
import re

def slugify(value: str | None, fallback: str = "recruitment", max_len: int = 80) -> str:
    base = re.sub(r"[^a-z0-9]+", "-", (value or "").lower()).strip("-")
    return (base[:max_len] or fallback)
```

6. Replace local helper usage in `runner.py`.

Exit criteria:

* No duplicate helper definitions.
* `runner.py` only contains scraper orchestration logic.
* Existing scraper behavior remains unchanged.

---

## Step 2: Replace silent Supabase failures

Current risk:

`_exec()` logs Supabase failures and returns defaults. This can hide failed queue inserts, failed run updates, or failed source-health writes.

Create:

`app/backend/app/db/errors.py`

```python
class DatabaseOperationError(RuntimeError):
    def __init__(self, operation: str, original: Exception):
        super().__init__(f"{operation} failed: {original}")
        self.operation = operation
        self.original = original
```

Create:

`app/backend/app/db/utils.py`

```python
import logging
from typing import Callable, TypeVar

from app.db.errors import DatabaseOperationError

T = TypeVar("T")
logger = logging.getLogger("career_copilot.db")

def execute_or_raise(operation: str, call: Callable[[], T]) -> T:
    try:
        return call()
    except Exception as exc:
        logger.exception("Database operation failed", extra={"operation": operation})
        raise DatabaseOperationError(operation, exc) from exc

def execute_or_default(operation: str, call: Callable[[], T], default: T) -> T:
    try:
        return call()
    except Exception as exc:
        logger.warning("Database operation failed", extra={"operation": operation, "error": str(exc)})
        return default
```

Use `execute_or_raise()` for critical writes:

* create `scrape_runs`
* insert `scrape_queue`
* final update to `scrape_runs`
* promotion writes into canonical tables
* queue status update after promotion

Use `execute_or_default()` only for non-critical reads where fallback is safe.

Exit criteria:

* Failed queue insert cannot silently pass.
* Failed promotion cannot mark queue item as approved.
* Logs identify operation name and failure source.

---

## Step 3: Add `normalizer.py`

Missing module:

`app/backend/app/scraping/normalizer.py`

Purpose:

Clean extracted AI data before inserting into `scrape_queue`.

Create a normalizer that accepts `ExtractedRecruitment` and returns:

* normalized recruitment data
* quality score
* warnings
* field-level cleanup metadata

Example structure:

```python
from dataclasses import dataclass, field
from typing import Any

from .schemas import ExtractedRecruitment

@dataclass
class NormalizedRecruitment:
    data: ExtractedRecruitment
    data_quality_score: float
    warnings: list[str] = field(default_factory=list)
    normalized_fields: dict[str, Any] = field(default_factory=dict)
```

Implement:

```python
def normalize_recruitment(data: ExtractedRecruitment) -> NormalizedRecruitment:
    warnings: list[str] = []
    score = 1.0

    if not data.title:
        warnings.append("missing_title")
        score -= 0.2

    if not data.organization_name:
        warnings.append("missing_organization")
        score -= 0.2

    if not data.apply_end_date:
        warnings.append("missing_apply_end_date")
        score -= 0.15

    if not data.posts:
        warnings.append("missing_posts")
        score -= 0.25

    for post in data.posts or []:
        if not post.education_required:
            warnings.append(f"missing_education:{post.post_name}")
            score -= 0.05
        if post.min_age is None or post.max_age is None:
            warnings.append(f"missing_age:{post.post_name}")
            score -= 0.05

    score = max(0.0, min(1.0, score))

    return NormalizedRecruitment(
        data=data,
        data_quality_score=score,
        warnings=warnings,
        normalized_fields={}
    )
```

Then update `runner.py`:

```python
from .normalizer import normalize_recruitment

normalized = normalize_recruitment(data)

queue_payload = {
    ...
    "extracted_data": to_json_safe(normalized.data),
    "confidence_score": confidence,
    "data_quality_score": normalized.data_quality_score,
    "extraction_status": "needs_review" if normalized.warnings else "clean",
    "evidence_required": normalized.warnings,
}
```

Exit criteria:

* Queue rows include quality score.
* Admin can prioritize low-quality extractions.
* Normalization does not publish or approve anything.

---

## Step 4: Improve extractor prompt accuracy

Target file:

`app/backend/app/scraping/extractor.py`

Current extractor is strict, but it needs stronger recruitment-specific heuristics.

Add guidance to `SYSTEM_PROMPT`:

```text
AGE EXTRACTION HINTS:
- Search for "Age Limit", "Upper Age Limit", "Minimum Age", "Maximum Age",
  "as on", "cut-off date", "born not earlier than".
- Always extract GENERAL / UR age only.
- Do not apply OBC/SC/ST/PwBD relaxations here.

EDUCATION EXTRACTION HINTS:
- Search for "Educational Qualification", "Essential Qualification",
  "Eligibility", "Minimum Qualification", "Degree", "Diploma",
  "10th", "12th", "Graduate", "Post Graduate".
- Preserve the raw phrase in education_required.
- Put disciplines like Civil, Mechanical, CS, IT, Law, Commerce, Economics
  into disciplines.

POST SPLITTING HINTS:
- If one notification has multiple posts, create one post object per post.
- Do not merge different posts into one generic post.
- If vacancy breakup is category-wise, sum only when total is clear.
```

Also add prompt versioning:

```python
PROMPT_VERSION = "scraper-extractor-v2"
```

Store it in queue payload:

```python
"extractor_version": PROMPT_VERSION,
```

If the DB column does not exist, add a migration first or keep this inside `extracted_data["_meta"]`.

Exit criteria:

* Prompt handles age, education, and multi-post notifications better.
* Extraction output remains JSON-only.
* Confidence score is still review-priority only, not approval logic.

---

## Step 5: Add JSON validation and repair path

Current risk:

If Claude returns malformed JSON, the extraction is discarded.

Add a small JSON cleanup path before returning `None`.

Tasks:

1. Keep strict `json.loads()` as first attempt.
2. If parsing fails, attempt:

   * remove markdown fences
   * trim text before first `{`
   * trim text after last `}`
3. If still invalid, return `None` and log `invalid_json`.

Example:

````python
def _extract_json_object(text: str) -> str:
    clean = re.sub(r"^```json\s*", "", text.strip())
    clean = re.sub(r"\s*```$", "", clean).strip()

    start = clean.find("{")
    end = clean.rfind("}")

    if start >= 0 and end > start:
        return clean[start:end + 1]

    return clean
````

Exit criteria:

* Minor model formatting errors do not kill extraction.
* Invalid model output is still safely rejected.
* No guessed data is introduced.

---

## Step 6: Add source normalization

Current runner reads from legacy `scrape_sources`, while the product also has `source_registry`.

First add a local normalization layer without migrating tables immediately.

Create:

`app/backend/app/scraping/sources.py`

```python
from dataclasses import dataclass

@dataclass
class ScrapeSource:
    id: str
    name: str
    target_url: str
    trust_score: float = 0.5
    consecutive_fails: int = 0
    is_healthy: bool = True

def normalize_legacy_source(row: dict) -> ScrapeSource:
    base = row.get("base_url") or ""
    path = row.get("notification_path") or ""

    return ScrapeSource(
        id=row["id"],
        name=row.get("name") or "Unknown Source",
        target_url=base + path,
        trust_score=float(row.get("trust_score") or 0.5),
        consecutive_fails=int(row.get("consecutive_fails") or 0),
        is_healthy=bool(row.get("is_healthy", True)),
    )
```

Update `runner.py` to use `source.target_url`, not manual string construction.

Exit criteria:

* Null DB values do not leak into runner logic.
* Future `source_registry` migration becomes easier.
* Runner can support both source tables later.

---

## Step 7: Improve deduplication

Current dedupe uses similarity keys. Keep it, but add fuzzy duplicate detection.

Add dependency if acceptable:

```bash
pip install rapidfuzz
```

Create:

`app/backend/app/scraping/dedup.py`

```python
from rapidfuzz import fuzz

def is_probable_duplicate(new_title: str, new_org: str, existing_title: str, existing_org: str) -> bool:
    title_score = fuzz.token_set_ratio(new_title or "", existing_title or "")
    org_score = fuzz.token_set_ratio(new_org or "", existing_org or "")
    return title_score >= 88 and org_score >= 85
```

Use in runner after exact similarity-key check.

Queue behavior:

* exact match → `duplicate`
* fuzzy match → `duplicate`
* no match → `pending`

Store duplicate reason:

```python
"duplicate_reason": "similarity_key" | "fuzzy_match"
```

If column does not exist, store inside metadata.

Exit criteria:

* Slight title variations do not create repeated admin workload.
* Duplicates are still visible to admin.
* No duplicate is auto-approved or deleted.

---

## Step 8: Strengthen promotion safety

Target:

`promote_to_recruitments()`

Current issue:

Post insert failures are logged and skipped. This can create a recruitment without complete criteria.

Change behavior:

1. Organization insert must raise on failure.
2. Recruitment insert must raise on failure.
3. Post insert must raise on failure.
4. Age/education insert failures should either:

   * raise and keep queue item pending, or
   * mark promoted recruitment as incomplete and `publish_status='needs_review'`.

Recommended safer approach:

* Raise on post insert failure.
* Raise on criteria insert failure if the extracted post had that data.
* Leave queue item `pending` if any canonical write fails.

Exit criteria:

* Queue row is marked `approved` only after full promotion succeeds.
* Partial canonical data does not silently enter product flow.
* Failed promotion can be retried.

---

## Step 9: Trigger eligibility recompute after promotion

After successful promotion, enqueue eligibility recompute for relevant users.

Flow:

`promote_run()`
→ `promote_to_recruitments()`
→ canonical recruitment/post/criteria created
→ enqueue recompute
→ eligibility worker processes
→ alerts read `eligibility_results`

Add:

```python
from app.eligibility.recompute_queue import enqueue_eligibility_recompute
```

Preferred design:

* Create a helper:

`app/backend/app/eligibility/enqueue_for_recruitment.py`

```python
def enqueue_recompute_for_new_recruitment(supabase, recruitment_id: str) -> int:
    users = supabase.table("profiles").select("id").execute().data or []
    count = 0

    for user in users:
        enqueue_eligibility_recompute(
            supabase,
            user_id=user["id"],
            recruitment_id=recruitment_id,
            reason="new_recruitment_promoted",
        )
        count += 1

    return count
```

Call it only after promotion success.

Exit criteria:

* New recruitment automatically enters eligibility pipeline.
* Alerts remain downstream of eligibility.
* Scraper does not decide eligibility.

---

## Step 10: Improve admin queue sorting

Use confidence and quality scores for review order.

Admin queue default order should be:

1. `status = pending`
2. lowest `data_quality_score` first, or newest first depending UI need
3. show confidence, warnings, source, scraped date
4. keep limit capped at 50

Example query:

```sql
SELECT id, source_name, source_url, extracted_data, confidence_score,
       data_quality_score, evidence_required, scraped_at
FROM public.scrape_queue
WHERE status = 'pending'
ORDER BY data_quality_score ASC NULLS FIRST, scraped_at DESC
LIMIT 50;
```

Add indexes:

```sql
CREATE INDEX IF NOT EXISTS idx_scrape_queue_status_scraped_at
ON public.scrape_queue(status, scraped_at DESC);

CREATE INDEX IF NOT EXISTS idx_scrape_queue_status_quality
ON public.scrape_queue(status, data_quality_score);
```

Exit criteria:

* Admin sees the riskiest items clearly.
* Queue remains fast at scale.
* Review priority does not bypass human approval.

---

## Step 11: Add scraper tests

Create:

`app/backend/tests/scraping/test_normalizer.py`

Test cases:

* missing title reduces score
* missing post education adds warning
* missing age adds warning
* valid extraction gets high score

Create:

`app/backend/tests/scraping/test_dedup.py`

Test cases:

* exact duplicate
* fuzzy duplicate title
* different organization not duplicate
* same org/year but different exam not duplicate

Create:

`app/backend/tests/scraping/test_runner.py`

Use mocked Supabase.

Test cases:

* new extraction inserts `pending`
* duplicate extraction inserts `duplicate`
* fetch failure bumps source failure
* extraction failure records error
* failed queue insert raises
* failed promotion does not mark queue approved
* successful promotion marks queue approved

Exit criteria:

* Scraper safety behavior is locked by tests.
* No future refactor can accidentally auto-approve.
* Failure paths are covered.

---

## Step 12: Add observability

Log these fields for every source:

* `run_id`
* `source_id`
* `source_name`
* `target_url`
* `fetch_status`
* `extraction_status`
* `confidence_score`
* `data_quality_score`
* `duplicate_status`
* `error_type`

Example:

```python
logger.info(
    "scrape_source_processed",
    extra={
        "run_id": run_id,
        "source_id": source.id,
        "source_name": source.name,
        "confidence_score": confidence,
        "data_quality_score": normalized.data_quality_score,
        "is_duplicate": is_dup,
    },
)
```

Exit criteria:

* Failed runs can be debugged without manually inspecting DB rows.
* Source-level health becomes visible.
* Production incidents are traceable.

---

## Step 13: Migrate from `scrape_sources` to `source_registry`

Do this after the scraper is stable.

Phase 1:

* Keep reading from `scrape_sources`.
* Add source normalization layer.

Phase 2:

* Add feature flag:

```env
SCRAPER_SOURCE_TABLE=source_registry
```

Phase 3:

* Implement loader:

```python
def load_active_sources(supabase, table_name: str):
    if table_name == "source_registry":
        ...
    return legacy_sources
```

Phase 4:

* Run both loaders in dry-run and compare:

  * source count
  * generated URLs
  * trust score
  * health fields

Phase 5:

* Switch scheduled scraper to `source_registry`.
* Keep fallback to `scrape_sources` for one release.

Exit criteria:

* Source metadata becomes richer.
* Trust score and health fields are usable.
* Migration does not break existing scraper runs.

---

## Step 14: Introduce async fetching only after tests pass

Do not start with async. First fix safety, errors, tests, and normalization.

Then convert only the fetch stage.

Use:

```python
import httpx
import asyncio
```

Add:

```python
async def fetch_page_text_async(client: httpx.AsyncClient, url: str, timeout: float = 15.0) -> str | None:
    try:
        resp = await client.get(url, timeout=timeout, follow_redirects=True)
        resp.raise_for_status()
        return _strip_html(resp.text)
    except Exception:
        logger.exception("async fetch failed", extra={"url": url})
        return None
```

Run sources with bounded concurrency:

```python
semaphore = asyncio.Semaphore(5)
```

Exit criteria:

* Throughput improves in benchmark.
* Source failures remain isolated.
* Supabase writes remain safe and ordered.

---

## Recommended implementation order

1. Clean `runner.py`.
2. Replace `_exec()` with structured DB helpers.
3. Add `normalizer.py`.
4. Improve extractor prompt and JSON parsing.
5. Add source normalization.
6. Improve deduplication.
7. Strengthen promotion safety.
8. Enqueue eligibility recompute after promotion.
9. Improve admin queue query and indexes.
10. Add scraper unit/integration tests.
11. Add observability logs.
12. Migrate gradually to `source_registry`.
13. Add async fetching only after benchmarks prove value.

## Final success criteria

The scraper improvement is complete when:

* Scraped data enters only `scrape_queue`.
* Nothing is auto-approved.
* Admin promotion is the only path into canonical `recruitments`.
* Failed DB writes are visible and do not silently pass.
* Normalized data has quality score and warnings.
* Duplicate detection reduces admin workload.
* Eligibility recompute is triggered after successful promotion.
* Alerts remain downstream of eligibility results.
* Queue queries remain fast under production-like volume.
* Tests cover new, duplicate, failed, and promoted flows.
