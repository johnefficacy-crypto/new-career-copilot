# ADR 0004: Promotion atomicity and async Supabase strategy

## Status
Accepted

## Decision
Critical promotion writes (organization/recruitment/post/criteria and queue status update) are treated as atomic success criteria.
If any critical write fails, promotion is failed and queue success status is not updated.

Eligibility/read APIs may use async Supabase client reads where feasible, but write paths remain sync-first where needed for correctness and deterministic behavior.

## Consequences
- Clearer failure semantics and retry behavior in trust-gate paths.
- Async boundaries improve API responsiveness for reads without introducing unsafe parallel writes.
