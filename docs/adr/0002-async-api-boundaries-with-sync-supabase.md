# ADR 0002: Add async API boundaries while retaining sync Supabase calls internally

- **Status:** Accepted
- **Date:** 2026-05-08

## Context

FastAPI endpoints benefit from async boundaries, but the current Supabase client usage in this codebase is synchronous.

## Decision

Add async wrapper functions at API boundaries and use worker-thread delegation (`asyncio.to_thread`) for existing sync DB call paths, preserving current behavior.

## Consequences

- Pros: endpoints can `await` orchestration calls without immediate full client migration.
- Trade-offs: true async DB concurrency requires future migration to native async access patterns.
