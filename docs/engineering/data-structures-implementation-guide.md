# Data Structures Implementation Guide

## Purpose

This guide explains where and how to apply core data structures across `ccp-mainbuild-v1`.

The goal is not to force academic data structures into the product. The goal is to improve correctness, runtime performance, explainability, personalization, admin review speed, marketplace matching, community discovery, and future Study OS intelligence while keeping Supabase/Postgres as the canonical source of truth.

Use this guide as the implementation reference for future development tasks.

## Current application baseline

The current system is primarily:

```text
Supabase relational tables
  -> FastAPI services
  -> deterministic eligibility engine
  -> React frontend pages
```

The most important existing product flow is:

```text
sources / source_registry
  -> scraper
  -> scrape_queue
  -> admin review
  -> recruitments / posts / criteria
  -> eligibility recompute
  -> eligibility_results
  -> dashboard / notifications / recommendations
```

Existing frontend routes already cover:

- onboarding
- exams and exam detail
- saved recruitments
- tracker
- study plan and study pages
- community
- marketplace
- mentors
- AI chat
- notifications
- pricing
- admin surfaces

The codebase already uses basic data structures informally:

- arrays/lists for recruitments, posts, checks, resources, threads
- dictionaries/objects for profile payloads and API responses
- `Set` in frontend ranking and placeholder backend state
- sorted arrays for dashboard and recommendation ranking
- queue tables for eligibility recompute and scraper review

However, it does not yet formalize graph, tree, trie, DAG, state-machine, or inverted-index structures as reusable application models.

## Core principle

Keep relational tables as the source of truth.

Build data structures as derived runtime models inside service modules.

Do not introduce a graph database, search cluster, or complex queue system before the canonical schema and trust-gated data pipeline are stable.

Recommended pattern:

```text
Supabase tables
  -> repository/service query
  -> runtime data structure builder
  -> deterministic business logic
  -> DTO returned to frontend or result persisted
```

## Recommended data structures by domain

| Domain | Primary data structures | Main purpose |
|---|---|---|
| Eligibility | HashMap, Set, Graph DTO, Decision Tree | Fast rule matching and explainability |
| Scraper/admin review | Queue, Priority Queue, HashMap, Set, DAG, State Machine | Trust-gated review, dedupe, provenance |
| Onboarding | Decision Tree, State Machine, HashMap, Graph DTO | Intent-aware profile collection |
| Dashboard/recommendations | HashMap, Set, Sorted List, Priority Queue | Personalized ranking and next actions |
| Notifications | Queue, Priority Queue, Dedup HashMap, Time Buckets | Urgency ordering and spam control |
| Study OS | Tree, DAG, Priority Queue, Spaced Repetition Queue | Syllabus hierarchy and learning path |
| Marketplace | Inverted Index, Bipartite Graph, HashMap, Priority Queue | Resource/provider/mentor matching |
| Community | Graph, Priority Queue, HashMap, Set, Inverted Index | Thread ranking, moderation, discovery |
| Search/blog funnel | Trie, Inverted Index, Graph, HashMap | SEO-to-action routing |

---

# 1. HashMap / Dictionary

## Why this matters

HashMap/dictionary structures give constant-time lookup by stable identifiers such as:

- `user_id`
- `recruitment_id`
- `post_id`
- `source_id`
- `queue_id`
- `exam_key`
- `resource_id`
- `thread_slug`

This avoids repeated list scanning and reduces accidental O(n²) behavior in ranking, eligibility recompute, marketplace matching, and admin review.

## Current signs in the repo

The frontend already uses this pattern in dashboard ranking by converting application records into an object keyed by `recruitment_id` before scoring recruitments.

This pattern should move into backend services as reusable utilities.

## Recommended backend utility

Create:

```text
app/backend/app/common/indexing.py
```

Implementation:

```python
from collections import defaultdict
from typing import Any, Iterable


def index_by(rows: Iterable[dict[str, Any]], key: str) -> dict[Any, dict[str, Any]]:
    return {row[key]: row for row in rows if row.get(key) is not None}


def group_by(rows: Iterable[dict[str, Any]], key: str) -> dict[Any, list[dict[str, Any]]]:
    grouped: dict[Any, list[dict[str, Any]]] = defaultdict(list)
    for row in rows:
        grouped[row.get(key)].append(row)
    return dict(grouped)
```

## Usage examples

Eligibility:

```python
criteria_by_post_id = index_by(criteria_rows, "post_id")
posts_by_id = index_by(posts, "id")
results_by_recruitment_id = index_by(eligibility_rows, "recruitment_id")
```

Marketplace:

```python
resources_by_id = index_by(resources, "id")
resources_by_exam = group_by(resource_exam_links, "exam_key")
providers_by_id = index_by(providers, "id")
```

Community:

```python
threads_by_slug = index_by(threads, "slug")
posts_by_thread_id = group_by(posts, "thread_id")
```

## Impact

- Faster API shaping.
- Cleaner service code.
- Less repeated filtering in frontend pages.
- Easier implementation of recommendation and graph builders.

## Implementation priority

High. This should be implemented first because it is low-risk and helps almost every domain.

---

# 2. Set

## Why this matters

Sets are ideal for membership checks and difference operations.

Use sets for:

- required exam credentials vs user credentials
- user target exams
- preferred states and sectors
- known languages
- certifications
- saved/tracked recruitments
- voted threads
- duplicate keys
- scraped content hashes
- marketplace enrolled resources

## Recommended runtime context object

Create:

```text
app/backend/app/recommendations/context.py
```

Example:

```python
from dataclasses import dataclass


@dataclass(frozen=True)
class UserRuntimeContext:
    user_id: str
    target_exams: set[str]
    preferred_states: set[str]
    preferred_sectors: set[str]
    certificates: set[str]
    languages: set[str]
    saved_recruitment_ids: set[str]
```

Normalize values at construction time:

```python
def normalize_token(value: str | None) -> str:
    return (value or "").strip().lower().replace("-", "_").replace(" ", "_")
```

## Eligibility usage

```python
required_exam_keys = {normalize_token(x) for x in criteria.required_exam_keys}
user_exam_keys = {normalize_token(x.exam_key) for x in exam_credentials}
missing = required_exam_keys - user_exam_keys
```

## Marketplace usage

```python
resource_exams = {normalize_token(x) for x in resource["exams"]}
user_targets = context.target_exams
exam_overlap = resource_exams & user_targets
```

## Community usage

```python
already_voted = user_id in thread_voter_ids
watched_categories = user_category_subscriptions & thread_categories
```

## Impact

- Faster rule checks.
- Cleaner eligibility logic.
- Easier dedupe and personalization.
- Useful foundation for marketplace/community recommendations.

## Implementation priority

High. Implement alongside HashMap utilities.

---

# 3. Queue and Priority Queue

## Why this matters

The project already depends on queues:

- scraper review queue
- eligibility recompute queue
- notification dispatch queue
- future community moderation queue
- future marketplace payout/order queues
- future Study OS task queues

A basic queue is FIFO. The project needs priority queues because not all work has equal urgency.

## Recommended priority fields

Add later via additive migrations where needed:

```sql
alter table public.eligibility_recompute_queue
add column if not exists priority_score integer default 0,
add column if not exists priority_reason jsonb default '{}'::jsonb,
add column if not exists locked_at timestamptz,
add column if not exists locked_by text;
```

Apply similar fields to future notification, moderation, and study task queues.

## Shared priority service

Create:

```text
app/backend/app/queues/priority.py
app/backend/app/queues/retry_policy.py
app/backend/app/queues/locking.py
```

Example:

```python
def deadline_priority(days_left: int | None) -> int:
    if days_left is None:
        return 0
    if days_left < 0:
        return -100
    if days_left <= 1:
        return 100
    if days_left <= 3:
        return 80
    if days_left <= 7:
        return 50
    return 10
```

## Priority formulas

Eligibility recompute:

```text
priority_score =
  +100 if deadline <= 1 day
  +80  if deadline <= 3 days
  +70  if new recruitment promoted
  +60  if user profile changed
  +40  if recruitment is saved/tracked
  -10  per failed attempt
```

Admin scraper review:

```text
priority_score =
  +100 if official source unresolved
  +90  if apply deadline <= 3 days
  +80  if low data_quality_score
  +70  if duplicate conflict exists
  +50  if high vacancy count
```

Notifications:

```text
priority_score =
  +100 if deadline <= 24 hours
  +80  if documents are missing
  +70  if eligibility changed
  +40  if study backlog is high
```

Community moderation:

```text
priority_score =
  +100 if unsafe/spam signal high
  +80  if many reports
  +60  if official-update category
  +40  if thread is high traffic
```

## Worker query pattern

```sql
select *
from public.eligibility_recompute_queue
where status = 'pending'
  and (next_attempt_at is null or next_attempt_at <= now())
order by priority_score desc, queued_at asc
limit 50;
```

## Impact

- Admins review highest-risk scraped items first.
- Users get urgent recommendations and notifications first.
- Worker throughput becomes predictable.
- Retry behavior becomes safer.

## Implementation priority

High for scraper and eligibility recompute. Medium for community/marketplace until those schemas are stable.

---

# 4. State Machine

## Why this matters

Many project entities move through controlled lifecycle states. Without state machines, invalid transitions become easy.

Use state machines for:

- application tracker
- scraper review
- recruitment publication
- marketplace orders/enrollments
- community moderation
- study task lifecycle
- notification dispatch

## Application lifecycle

```text
discovered
  -> eligibility_checked
  -> eligible | conditional | not_eligible
  -> saved
  -> apply_started
  -> documents_pending
  -> submitted
  -> admit_card_available
  -> exam_taken
  -> result_declared
  -> selected | not_selected
```

## Scraper review lifecycle

```text
pending
  -> needs_review
  -> duplicate
  -> rejected
  -> approved
  -> promoted
```

Hard rule:

```text
scrape_queue item must not become promoted unless canonical recruitment/post/criteria writes succeed.
```

## Marketplace order lifecycle

```text
viewed
  -> clicked
  -> payment_started
  -> payment_success
  -> enrolled
  -> completed
  -> reviewed

payment_started
  -> payment_failed
  -> abandoned
```

## Community moderation lifecycle

```text
visible
  -> flagged
  -> under_review
  -> approved | hidden | locked | deleted
```

## Suggested shared module

Create:

```text
app/backend/app/common/state_machine.py
```

Example:

```python
class InvalidTransition(ValueError):
    pass


def transition(current: str, event: str, transitions: dict[str, dict[str, str]]) -> str:
    try:
        return transitions[current][event]
    except KeyError as exc:
        raise InvalidTransition(f"Invalid transition: {current} + {event}") from exc
```

Then domain-specific files:

```text
app/backend/app/state_machines/application_state.py
app/backend/app/state_machines/scrape_review_state.py
app/backend/app/state_machines/marketplace_order_state.py
app/backend/app/state_machines/community_moderation_state.py
```

## Impact

- Prevents invalid product states.
- Easier tests.
- Safer admin actions.
- Clearer notification triggers.

## Implementation priority

High for scraper/admin and tracker. Medium for marketplace/community.

---

# 5. Decision Tree

## Why this matters

The current onboarding is mostly a fixed multi-step form. The product funnel needs adaptive onboarding based on CTA intent:

- check eligibility first
- how to apply
- join study group
- know documents required
- get study plan
- find resources/mentor

A decision tree asks only the next necessary question.

## Onboarding decision example

```text
Landing intent: check_eligibility
  -> recruitment_id known?
      yes -> load recruitment required fields
      no  -> ask target exam / sector / state
  -> date_of_birth missing?
      yes -> ask DOB
  -> category missing?
      yes -> ask category
  -> education missing?
      yes -> ask education
  -> enough profile data?
      yes -> run eligibility
      no  -> continue minimal questions
```

## Required-field map

Create:

```text
app/backend/app/onboarding/field_requirements.py
```

Example:

```python
REQUIRED_FIELDS_BY_INTENT = {
    "eligibility": {
        "profile": ["date_of_birth", "category", "domicile_state"],
        "education": ["level", "degree", "stream", "percentage"],
    },
    "documents": {
        "profile": ["category", "pwbd_status", "domicile_state"],
        "education": ["level", "degree"],
    },
    "study_group": {
        "preferences": ["target_exams", "study_mode", "target_exam_year"],
    },
    "apply": {
        "profile": ["date_of_birth", "category", "phone"],
        "education": ["level", "degree"],
    },
}
```

## Flow engine

Create:

```text
app/backend/app/onboarding/flow_engine.py
```

Responsibilities:

- accept `intent`, `recruitment_id`, and current profile snapshot
- compute missing fields
- return next question or completion action
- keep frontend rendering generic

DTO example:

```python
class OnboardingNextStep(BaseModel):
    intent: str
    field_key: str | None
    prompt: str | None
    input_type: str | None
    options: list[str] = []
    complete: bool = False
    next_action: str | None = None
```

## Impact

- Lower onboarding friction.
- Better conversion from recruitment blog pages.
- Enables chat-style onboarding.
- Avoids collecting irrelevant data too early.

## Implementation priority

High after current profile/eligibility path is stable.

---

# 6. Tree

## Why this matters

Trees are useful for hierarchical content.

Use trees for:

- exam syllabus
- document checklist
- application steps
- marketplace course curriculum
- community category/subcategory structure
- admin review checklist

## Study OS syllabus tree

```text
Exam
  -> Subject
      -> Unit
          -> Topic
              -> Subtopic
```

Example:

```json
{
  "id": "ssc-cgl",
  "type": "exam",
  "children": [
    {
      "id": "quant",
      "type": "subject",
      "children": [
        {
          "id": "percentage",
          "type": "topic",
          "children": []
        }
      ]
    }
  ]
}
```

## Marketplace curriculum tree

```text
Course
  -> Section
      -> Lesson
          -> Practice item
```

## Document checklist tree

```text
Recruitment
  -> General documents
  -> Category-specific documents
  -> PwBD documents
  -> EWS documents
  -> Ex-serviceman documents
```

## Impact

- Clear UI navigation.
- Better progress tracking.
- Easier learning plan generation.
- Supports marketplace course progression.

## Implementation priority

Medium. Start with Study OS and marketplace curriculum after runtime schemas are stable.

---

# 7. DAG

## Why this matters

A DAG is needed when nodes have dependencies but cycles are invalid.

Use DAGs for:

- study topic prerequisites
- scraper pipeline provenance
- admin promotion dependencies
- notification generation dependencies
- marketplace course prerequisites

## Study prerequisite DAG

```text
Number System -> Percentage -> Profit & Loss -> Data Interpretation
Grammar Basics -> Error Spotting -> Cloze Test
Polity Basics -> Fundamental Rights -> Constitutional Bodies
```

## Scraper pipeline DAG

```text
source fetched
  -> document parsed
  -> fields extracted
  -> high-risk fields verified
  -> duplicate resolved
  -> recruitment promoted
  -> eligibility recomputed
  -> alerts generated
```

## Promotion dependency rule

A queue item can be promoted only when prerequisite nodes are complete:

```text
official source verified
high-risk fields verified
duplicate candidates resolved
canonical write dry-run valid
```

## Suggested module

```text
app/backend/app/common/dag.py
```

Minimum functions:

```python
def topological_sort(nodes: list[str], edges: list[tuple[str, str]]) -> list[str]:
    ...


def has_cycle(nodes: list[str], edges: list[tuple[str, str]]) -> bool:
    ...
```

## Impact

- Prevents invalid study paths.
- Makes scraper provenance auditable.
- Supports future admin visualization.

## Implementation priority

Medium. High for Study OS once topic dependencies are introduced.

---

# 8. Graph

## Why this matters

Graph is best for explainability and relationship traversal, not primary storage at this stage.

Use graph DTOs to show:

- why a candidate is eligible/not eligible
- how profile fields connect to rules
- how recruitments connect to study plans/resources/community
- why a marketplace resource is recommended
- how users, threads, exams, and study groups relate

## Do not add graph database now

Do not add Neo4j or another graph database at this stage.

Current need is graph representation, not graph persistence.

Supabase remains canonical. Graphs should be derived from relational records.

## Shared graph DTO

Create:

```text
app/backend/app/graph/schemas.py
```

Implementation:

```python
from typing import Any
from pydantic import BaseModel


class GraphNode(BaseModel):
    id: str
    type: str
    label: str
    data: dict[str, Any] = {}


class GraphEdge(BaseModel):
    source: str
    target: str
    type: str
    weight: float | None = None
    status: str | None = None
    data: dict[str, Any] = {}


class GraphDTO(BaseModel):
    nodes: list[GraphNode]
    edges: list[GraphEdge]
```

## Eligibility graph

```text
Candidate
  -> Profile Field
  -> Eligibility Rule
  -> Post
  -> Recruitment
  -> Next Action
```

Example:

```python
nodes = [
    {"id": "user:123", "type": "candidate", "label": "Candidate"},
    {"id": "field:dob", "type": "profile_field", "label": "Date of Birth"},
    {"id": "rule:age", "type": "eligibility_rule", "label": "Age Rule"},
    {"id": "post:456", "type": "post", "label": "Assistant Section Officer"},
]

edges = [
    {"source": "user:123", "target": "field:dob", "type": "has_field"},
    {"source": "field:dob", "target": "rule:age", "type": "evaluates"},
    {"source": "rule:age", "target": "post:456", "type": "passes", "status": "passed"},
]
```

## Marketplace graph

```text
User
  -> Target Exam
  -> Weak Topic
  -> Resource
  -> Provider
```

This allows transparent recommendation text:

```text
Recommended because you target SSC CGL, Quant is a weak area, and this resource covers Quant for SSC CGL.
```

## Community graph

```text
User
  -> Thread
  -> Category
  -> Exam
  -> Recruitment
  -> Study Group
```

## Suggested modules

```text
app/backend/app/graph/
  schemas.py
  eligibility_graph.py
  marketplace_graph.py
  community_graph.py
  onboarding_graph.py
```

Frontend:

```text
app/frontend/src/shared/graph/GraphView.jsx
app/frontend/src/features/eligibility/EligibilityGraph.jsx
```

## Impact

- Better explainability.
- Better user trust.
- Better marketplace/community personalization.
- Useful admin visualization.

## Implementation priority

Medium. Implement after deterministic eligibility and scraper promotion safety are stable.

---

# 9. Trie / Prefix Tree

## Why this matters

Trie is useful for fast autocomplete.

Use it for:

- exam search
- organization search
- post name search
- qualification search
- location search
- certificate search
- community tags
- marketplace resource/provider search

## Initial endpoint

Create:

```text
GET /api/search/suggest?q=ssc&type=exam
```

Start with database-backed `ilike` or full-text search.

Introduce in-memory trie only after common search terms and usage patterns are known.

## Suggested module

```text
app/backend/app/discovery/suggest.py
```

Future trie module:

```text
app/backend/app/discovery/trie.py
```

## Impact

- Faster onboarding search.
- Better recruitment discovery.
- Better blog funnel UX.
- Better marketplace and community search.

## Implementation priority

Medium. Useful after blog funnel pages and search entry points are defined.

---

# 10. Inverted Index

## Why this matters

Inverted indexes power discovery.

The project intends to use blogs and recruitment pages as SEO funnels. Users may land on pages like:

- eligibility for a recruitment
- how to apply
- required documents
- join study group
- marketplace resource for an exam

An inverted index connects words/tags/entities to product objects.

## Example

```python
index = {
    "ssc": {"recruitment:ssc-cgl", "blog:ssc-documents", "resource:quant-blueprint"},
    "graduate": {"recruitment:ssc-cgl", "recruitment:rbi-grade-b"},
    "quant": {"resource:quant-blueprint", "thread:quant-strategy"},
}
```

## Entities to index

- recruitments
- posts
- organizations
- blogs
- community threads
- marketplace resources
- mentors
- study topics
- documents

## Suggested modules

```text
app/backend/app/discovery/
  index_builder.py
  search.py
  routing.py
```

## Future tables

```text
search_documents
search_terms
search_index_entries
content_entity_links
```

## Impact

- Better SEO landing routing.
- Better internal search.
- Better recommendation joining across recruitment/community/marketplace/study.

## Implementation priority

Medium-high once blog funnel work starts.

---

# 11. LRU / TTL Cache

## Why this matters

Some data is read frequently and changes slowly.

Cache candidates:

- source registry
- published recruitments
- recruitment detail with posts
- eligibility criteria by recruitment
- marketplace resource catalog
- community categories
- search suggestions
- profile completion rules

## Suggested module

```text
app/backend/app/cache/ttl_cache.py
```

Simple implementation:

```python
from time import time
from typing import Any

_cache: dict[str, tuple[float, Any]] = {}


def get_cached(key: str, ttl_seconds: int):
    item = _cache.get(key)
    if not item:
        return None
    expires_at, value = item
    if expires_at < time():
        _cache.pop(key, None)
        return None
    return value


def set_cached(key: str, value: Any, ttl_seconds: int):
    _cache[key] = (time() + ttl_seconds, value)
```

## Caution

Do not aggressively cache user-specific eligibility unless invalidation is clear.

Invalidate eligibility-related cache when:

- profile changes
- education changes
- reservation/category changes
- recruitment criteria changes
- post criteria changes

## Impact

- Reduced Supabase read load.
- Better frontend response times.
- Cleaner service-level performance optimization.

## Implementation priority

Low-medium. Add only after correctness paths are stable.

---

# 12. Bloom Filter / Probabilistic Duplicate Filter

## Why this matters

At larger scraper scale, duplicate detection can become expensive.

Possible uses:

- seen source URLs
- seen PDF hashes
- known notification titles
- duplicate community spam links
- duplicate marketplace resources

## Caution

Bloom filters can return false positives.

Therefore they must never auto-delete, auto-reject, or auto-approve.

They can only mark an item as:

```text
probably_seen
needs_duplicate_review
```

## Suggested module

```text
app/backend/app/scraping/dedup_filter.py
```

## Impact

- Reduces duplicate scraper workload.
- Helps admin review prioritization.
- Useful later when source count grows significantly.

## Implementation priority

Low. Use after deterministic dedupe and fuzzy dedupe are already working.

---

# Domain-specific implementation plans

## A. Eligibility engine

### Current situation

The eligibility engine is deterministic and rule-based. It evaluates age, education, attempts, exam credentials, nationality, domicile, certifications, language, disability suitability, and age relaxation rules.

### Recommended data structures

- HashMap for criteria lookup.
- Set for credentials/languages/certifications.
- Graph DTO for eligibility explanation.
- Decision tree for missing profile field prompts.

### Implementation steps

1. Add `app/backend/app/common/indexing.py`.
2. Normalize all profile and criteria tokens through a shared normalizer.
3. Convert list-like fields into sets inside runtime context builders.
4. Add `app/backend/app/eligibility/graph.py` to build explanation graph from `EligibilityCheckResult`.
5. Add API endpoint later:

```text
GET /api/eligibility/recruitments/{recruitment_id}/graph
```

### Expected impact

- Faster batch eligibility recompute.
- Better fail-reason explanation.
- Cleaner onboarding prompts.
- Easier dashboard recommendation explanations.

---

## B. Scraper and admin review

### Current situation

Scraper data must remain trust-gated. New scraped items should stay pending or duplicate until admin review. Canonical recruitment data should only be created after admin promotion.

### Recommended data structures

- Priority Queue for admin review ordering.
- HashMap for source/queue lookup.
- Set for duplicate hashes and similarity keys.
- State Machine for queue lifecycle.
- DAG for provenance and promotion dependencies.
- Graph DTO for admin explainability.

### Implementation steps

1. Add `app/backend/app/scraping/state.py`.
2. Add priority scoring to queue payload and admin query.
3. Keep exact/fuzzy duplicate detection as deterministic review support only.
4. Add `scrape_queue.priority_score` and `priority_reason` later via migration.
5. Add `app/backend/app/scraping/provenance.py` to build pipeline DAG.
6. Add graph output for admin UI after queue safety is stable.

### Expected impact

- Admin reviews risky items first.
- Easier debugging of failed extraction/promotion.
- Lower duplicate workload.
- Stronger trust-gate compliance.

---

## C. Onboarding

### Current situation

Onboarding is currently step-based. It collects identity, education, preferences, and study rhythm.

### Recommended data structures

- Decision Tree for adaptive questions.
- HashMap for required fields by intent.
- State Machine for onboarding progress.
- Graph DTO for missing-field explanation.

### Implementation steps

1. Add intent detection from landing CTA:

```text
check_eligibility
how_to_apply
documents_required
join_study_group
study_plan
marketplace_resource
```

2. Create:

```text
app/backend/app/onboarding/intent.py
app/backend/app/onboarding/field_requirements.py
app/backend/app/onboarding/flow_engine.py
```

3. Add endpoint:

```text
POST /api/onboarding/next-step
```

4. Build chat-style frontend component:

```text
app/frontend/src/features/onboarding/ChatOnboarding.jsx
```

5. Keep current form as fallback.

### Expected impact

- Lower profile completion friction.
- Better conversion from recruitment blogs.
- More relevant data collection.
- Cleaner route from CTA to eligibility/study/community/marketplace.

---

## D. Dashboard and recommendations

### Current situation

Frontend ranking currently computes match score, recommendation stage, reasons, risks, and next action.

### Recommended data structures

- HashMap for applications/results/tracked state.
- Set for user targets/preferences.
- Sorted List / Priority Queue for recommendation order.
- State Machine for application lifecycle.

### Implementation steps

1. Move canonical ranking logic into backend service:

```text
app/backend/app/recommendations/scoring.py
app/backend/app/recommendations/context.py
```

2. Keep frontend ranking as fallback only.
3. Add backend endpoint:

```text
GET /api/recommendations/me
```

4. Return stable DTO:

```json
{
  "items": [
    {
      "recruitment_id": "...",
      "match_score": 82,
      "stage": "apply_now",
      "reasons": [],
      "risks": [],
      "next_action": "Apply now"
    }
  ]
}
```

### Expected impact

- Consistent ranking across frontend and notifications.
- Better testability.
- Easier personalization.

---

## E. Notifications

### Current situation

The project already has notification and recompute concepts. Notification governance is part of the schema roadmap.

### Recommended data structures

- Priority Queue for dispatch/generation.
- Dedup HashMap for notification keys.
- Time Buckets for quiet hours and digest windows.
- State Machine for delivery lifecycle.

### Implementation steps

1. Add dedupe key builder:

```text
app/backend/app/notifications/dedupe.py
```

2. Add priority scoring:

```text
app/backend/app/notifications/priority.py
```

3. Enforce quiet hours using time-window buckets.
4. Use shared recommendation stage state machine to generate next actions.

### Expected impact

- Less notification spam.
- Better urgency ordering.
- More consistent next-action messaging.

---

## F. Marketplace

### Current situation

Marketplace currently lists resources, providers, and affiliates. It filters resources by type on the frontend.

The schema roadmap says marketplace runtime should be implemented additively with courses, course sections, lessons, reviews, enrollments, lesson progress, and instructor payouts.

### Recommended data structures

- HashMap for resources/providers/courses.
- Set for enrolled resources and matching exams/topics.
- Inverted Index for resource discovery.
- Bipartite Graph for user-resource-provider matching.
- Priority Queue for personalized resource ranking.

### Implementation steps

1. Complete marketplace runtime schema first.
2. Create:

```text
app/backend/app/marketplace/indexes.py
app/backend/app/marketplace/recommender.py
app/backend/app/marketplace/provider_trust.py
app/backend/app/marketplace/graph.py
```

3. Build indexes:

```python
resources_by_exam = group_by(resource_exam_links, "exam_key")
resources_by_topic = group_by(resource_topic_links, "topic_key")
providers_by_id = index_by(providers, "id")
```

4. Add recommendation score:

```text
score =
  exam_match
  + weak_topic_match
  + provider_trust
  + rating_quality
  + completion_rate
  - price_mismatch
```

5. Add explanation output:

```json
{
  "resource_id": "quant-blueprint",
  "score": 87,
  "why": [
    "Matches SSC CGL",
    "Covers weak topic: Quant",
    "Provider is verified"
  ]
}
```

### Expected impact

- Marketplace becomes personalized instead of flat catalog.
- Recommendations become explainable.
- Affiliate/resource suggestions stay trust-based.

---

## G. Community layer

### Current situation

Community currently has categories, threads, posts, votes, replies, and simple sort modes.

The schema roadmap warns that `forum_*` and `community_*` legacy concepts are parallel and should not be blindly merged.

### Recommended data structures

- HashMap for thread/category/post lookup.
- Set for votes, follows, watched categories.
- Priority Queue / Heap for hot thread ranking.
- Inverted Index for thread search.
- Graph for user-thread-exam-study-group relationships.
- State Machine for moderation.

### Implementation steps

1. Stabilize canonical community tables.
2. Create:

```text
app/backend/app/community/ranking.py
app/backend/app/community/moderation.py
app/backend/app/community/search.py
app/backend/app/community/graph.py
```

3. Implement hot ranking:

```text
hot_score =
  votes * 3
  + replies * 2
  + pinned_bonus
  + freshness_score
  - moderation_penalty
```

4. Implement moderation state machine.
5. Add thread search index by exam, post, tag, topic, and document issue.
6. Link study groups to exams/recruitments.

### Expected impact

- Better community discovery.
- Safer moderation.
- More relevant study groups.
- Useful links between exams, threads, and marketplace resources.

---

## H. Study OS

### Current situation

Study pages exist, but formal topic dependency and syllabus structure should be introduced gradually.

### Recommended data structures

- Tree for syllabus hierarchy.
- DAG for topic prerequisites.
- Priority Queue for daily tasks.
- Spaced Repetition Queue for revision.
- HashMap for progress lookup.

### Implementation steps

1. Add topic catalog tables later:

```text
subjects
topics
topic_dependencies
user_topic_progress
study_tasks
revision_queue
```

2. Create:

```text
app/backend/app/study/syllabus_tree.py
app/backend/app/study/prerequisite_dag.py
app/backend/app/study/task_priority.py
app/backend/app/study/revision_queue.py
```

3. Generate daily plan by:

```text
exam target
+ weak topics
+ prerequisite readiness
+ deadline urgency
+ available weekly hours
```

### Expected impact

- Better study planning.
- Avoids recommending advanced topics too early.
- Supports marketplace resource matching by weak topics.

---

## I. Search and blog funnel

### Current situation

The product plan depends on recruitment blogs and CTA routing, but a dedicated discovery/indexing layer is not yet formalized.

### Recommended data structures

- Trie for autocomplete.
- Inverted Index for search.
- Graph for linking blogs, recruitments, resources, community, and onboarding intents.
- HashMap for entity resolution.

### Implementation steps

1. Create:

```text
app/backend/app/discovery/search.py
app/backend/app/discovery/suggest.py
app/backend/app/discovery/routing.py
app/backend/app/discovery/index_builder.py
```

2. Add CTA route resolver:

```text
/blogs/{slug}?cta=check_eligibility
  -> /?intent=eligibility&recruitment_id=...
```

3. Build entity links:

```text
blog -> recruitment
blog -> exam
blog -> document checklist
blog -> study group
blog -> marketplace resources
```

4. Add endpoint:

```text
GET /api/discovery/resolve?source=blog&slug=...&cta=...
```

### Expected impact

- SEO traffic lands in relevant product flows.
- Blog content becomes structured acquisition infrastructure.
- Search and recommendations share the same entity index.

---

# Database and schema guidance

## Do not persist runtime data structures too early

Do not immediately create tables like:

```text
graph_nodes
graph_edges
runtime_trees
runtime_tries
```

These should remain derived until product behavior stabilizes.

## Persist only stable canonical relationships

Good candidates for tables later:

```text
resource_exam_links
resource_topic_links
mentor_exam_links
thread_exam_links
study_group_exam_links
topic_dependencies
user_topic_progress
search_documents
search_index_entries
```

## Additive migration rule

Follow the existing safe migration approach:

- use `alter table ... add column if not exists`
- avoid destructive changes
- add indexes after columns exist
- guard foreign keys
- reload PostgREST schema after migrations
- keep feature capsules independently runnable

---

# Testing strategy

## Unit tests

Add tests for pure data-structure logic:

```text
tests/common/test_indexing.py
tests/common/test_state_machine.py
tests/recommendations/test_scoring.py
tests/onboarding/test_flow_engine.py
tests/community/test_ranking.py
tests/marketplace/test_recommender.py
tests/study/test_prerequisite_dag.py
```

## Integration tests

Add service-level tests for:

- eligibility graph endpoint
- onboarding next-step endpoint
- recommendation endpoint
- admin queue priority ordering
- marketplace recommended resources
- community hot ranking

## Safety tests

Must verify:

- graph output does not change canonical eligibility verdict
- priority score does not auto-approve scraper items
- duplicate detection does not auto-delete records
- state machines reject invalid transitions
- marketplace recommendations explain why a resource appears
- community moderation prevents invalid state transitions

---

# Implementation roadmap

## Phase 0: Low-risk utilities

Implement:

```text
app/backend/app/common/indexing.py
app/backend/app/common/state_machine.py
app/backend/app/common/tokens.py
```

Use in:

- eligibility services
- recommendations
- marketplace shaping
- community shaping
- scraper admin shaping

## Phase 1: Priority queues for existing flows

Implement priority scoring for:

- scraper admin queue
- eligibility recompute queue
- notification generation/dispatch

Do not change business outcomes. Only change ordering and observability.

## Phase 2: Backend recommendation service

Move canonical scoring from frontend-only behavior into backend:

```text
app/backend/app/recommendations/
```

Keep frontend fallback until backend response is stable.

## Phase 3: Adaptive onboarding decision tree

Implement intent-aware onboarding:

```text
POST /api/onboarding/next-step
```

Keep existing `/app/onboarding` form as fallback.

## Phase 4: Eligibility explanation graph

Implement graph DTO builder:

```text
app/backend/app/graph/eligibility_graph.py
```

Add frontend visualization only after DTO output is stable.

## Phase 5: Marketplace recommender

After marketplace runtime schema is stable:

- resource indexes
- provider trust score
- user-resource matching
- explanation output

## Phase 6: Community ranking and moderation

After community runtime schema is stable:

- hot ranking
- moderation state machine
- community search index
- exam/thread/study-group graph

## Phase 7: Study OS DAG

After topic catalog exists:

- syllabus tree
- topic dependency DAG
- user progress maps
- daily task priority queue
- revision queue

## Phase 8: Discovery/search/blog funnel

Implement:

- inverted index
- autocomplete suggestions
- blog CTA resolver
- entity graph between blogs, recruitments, resources, threads, and onboarding intents

---

# Final guidance

Recommended implementation order:

1. HashMap and Set utilities.
2. State machine utilities.
3. Priority queue scoring for scraper and recompute.
4. Backend recommendation service.
5. Adaptive onboarding decision tree.
6. Eligibility explanation graph DTO.
7. Marketplace inverted index and recommendation graph.
8. Community ranking, moderation, and graph relationships.
9. Study OS tree/DAG.
10. Search trie and inverted index for blog funnel.

Avoid starting with graph databases or advanced infrastructure. The correct path for this repo is to build small, deterministic, testable data-structure layers on top of the existing Supabase schema and FastAPI services.
