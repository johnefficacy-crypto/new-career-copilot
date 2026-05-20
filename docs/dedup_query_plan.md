# Dedup query plan (PR: targeted dedup queries)

Pre-flight artifact (mandated). Read this before the semantic dedup
change. It pins, side-by-side, the exact filter chain + select list the
scraper used **before** this PR (full-table reads) and the **targeted**
queries it uses after.

The driving problem: every scrape run loaded the *entire* `recruitments`
table and *every* open `scrape_queue` row (with `extracted_data`) once
per run to build an in-memory dedup index. Two unbounded reads + a large
JSON transfer on every pass.

Neither `recruitments` nor `scrape_queue` has a `canonical_key` column
(verified against migrations), so dedup keys on `notification_number`,
`(organization_id, year)`, and `source_url` instead.

---

## recruitments dedup

### CURRENT (full table, no filter, no limit)

```
sb.table("recruitments")
  .select("id, name, year, organizations(name), official_notification_url, "
          "official_apply_url, notification_number")
  .execute()                       # ← every row, every run
```
Built once per run; `find_duplicate` then scans the whole list in memory
for each extraction (URL-exact, (org,notif_no), sim_key, fuzzy).

### PROPOSED (per-candidate, targeted, bounded)

**Pre-LLM** (key = normalized scrape target URL; raw URL used in the
filter, both sides normalized in Python after fetch):

```
sb.table("recruitments")
  .select("id, official_notification_url, official_apply_url")
  .or_(f"official_notification_url.eq.{raw_url},official_apply_url.eq.{raw_url}")
  .limit(20)
  .execute()
```
Match → skip the Anthropic call, `extraction_status='exact_url_duplicate'`,
no queue insert. Misses listing-page URLs (acceptable; post-extraction
catches them).

**Post-extraction** (first-match policy A→E, from `extracted_data`):

| Path | Condition | Query | In-Python check |
|---|---|---|---|
| A | canonical_key valid + notification_number present | `.eq("notification_number", v).limit(10)` | compare canonical_key; match→duplicate, mismatch→needs_review |
| B | notification_number present, canonical_key invalid | `.eq("notification_number", v).limit(10)` | any match→duplicate (notif numbers globally unique) |
| C | org_name→organization_id resolves + year present | resolve: `organizations.select(id).eq("name", org).limit(1)`; then `recruitments.eq("organization_id", id).eq("year", year).limit(20)` | compare canonical_key; canonical_key decisive |
| D | only canonical_key valid | **no query** | queue `needs_review`, log INFO |
| E | everything missing/invalid | **no query** | queue `needs_review`, log INFO |

Select list for A/B/C: `id, name, year, organizations(name),
official_notification_url, official_apply_url, notification_number`
(the fields `find_duplicate`/canonical comparison need).

---

## scrape_queue dedup (open-queue, cross-source)

### CURRENT (every open row, with extracted_data)

```
sb.table("scrape_queue")
  .select("id, extracted_data, status")
  .not_.in_("status", ["rejected", "duplicate"])
  .execute()                       # ← every open row + its JSON, every run
```

### PROPOSED (two-stage: lightweight pre-filter, then narrow re-fetch)

Same A→E key policy. ALWAYS `.not_.in_("status", ["rejected","duplicate"])`.
NEVER constrained by `source_id` (cross-source dupes are the target).
Lightweight pre-filter drops `extracted_data`:

```
# Stage 1 — narrow by indexed key, NO extracted_data
sb.table("scrape_queue")
  .select("id, status")
  .not_.in_("status", ["rejected", "duplicate"])
  .eq("extracted_data->>notification_number", v)   # path A/B
  .limit(10)
  .execute()

# Stage 2 — only if Stage 1 found ≤10 candidates: pull JSON to compare
sb.table("scrape_queue")
  .select("id, extracted_data")
  .in_("id", [stage1 ids])
  .limit(10)
  .execute()
```
Path C narrows by year (queue has no organization_id): stage-1
`.eq("extracted_data->>year", year)`. Paths D/E fire no query.

---

## Match handling (both tables)

- exactly 1 match → `status=duplicate`, `duplicate_of`/`duplicate_recruitment_id`=match
- 2+ matches → `status=needs_review`, `candidate_ids` recorded
  (`scrape_queue` has no `duplicate_candidate_ids` column → stored in
  `extracted_data._meta.duplicate_candidate_ids`)
- 0 matches → normal queue insert (`status=pending`)

**False-positive policy:** when in doubt → `needs_review`, never silent merge.
**False-negative policy:** accept missed dupes when keys are missing/invalid.
**Never** full-table scan as a fallback.

## Scenario 2 policy (notif_number match + canonical_key mismatch)

Chosen: **needs_review** (not auto-duplicate). A notification number that
matches but a canonical key that disagrees means org/year/title diverged —
worth a human look rather than a silent merge. Documented in dedup.py and
surfaced as a stakeholder question.
