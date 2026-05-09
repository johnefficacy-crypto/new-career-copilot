-- Migration 030: Vector embeddings table for semantic retrieval (AI P2)
--
-- Requires the pgvector extension. Each row stores one model's embedding for
-- one entity. The content_hash allows the sync job to skip unchanged content.
--
-- Covered by: jobs/embeddings-sync.ts (P2 — not yet implemented)

begin;

create extension if not exists vector;

create table if not exists public.embeddings (
  id           uuid    primary key default gen_random_uuid(),
  entity_type  text    not null check (
    entity_type in ('recruitment', 'exam', 'notice', 'resource')
  ),
  entity_id    uuid    not null,
  model        text    not null,
  content_hash text    not null,
  embedding    vector(1536) not null,
  metadata     jsonb   not null default '{}'::jsonb,
  created_at   timestamptz not null default now(),
  unique (entity_type, entity_id, model)
);

create index if not exists ix_embeddings_entity
  on public.embeddings (entity_type, entity_id);

create index if not exists ix_embeddings_cosine
  on public.embeddings
  using ivfflat (embedding vector_cosine_ops)
  with (lists = 100);

comment on table public.embeddings is
  'Vector embeddings for semantic retrieval. One row per (entity, model). '
  'content_hash enables skip-if-unchanged sync. Powered by pgvector.';

commit;
