-- 028_exam_intelligence_taxonomy.sql
-- Exam Intelligence foundation: reusable subject/topic taxonomy.
-- Additive-only migration for ccp-mainbuild-v1.
-- Keep Study OS text fields as historical display snapshots; this migration only adds canonical references.

create table if not exists public.subjects (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  subject_group text,
  default_difficulty_level text,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.subject_aliases (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_context text,
  created_at timestamptz not null default now(),
  unique(subject_id, normalized_alias)
);

create table if not exists public.topics (
  id uuid primary key default gen_random_uuid(),
  subject_id uuid not null references public.subjects(id) on delete cascade,
  parent_topic_id uuid references public.topics(id) on delete cascade,
  slug text not null,
  name text not null,
  level text not null default 'topic'
    check (level in ('topic', 'microtopic', 'concept')),
  default_difficulty_level text,
  description text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(subject_id, parent_topic_id, slug)
);

create table if not exists public.topic_aliases (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  alias text not null,
  normalized_alias text not null,
  source_context text,
  created_at timestamptz not null default now(),
  unique(topic_id, normalized_alias)
);

create table if not exists public.topic_prerequisites (
  id uuid primary key default gen_random_uuid(),
  topic_id uuid not null references public.topics(id) on delete cascade,
  prerequisite_topic_id uuid not null references public.topics(id) on delete cascade,
  relation_type text not null default 'requires'
    check (relation_type in ('requires', 'recommended_before', 'supports', 'foundation_for')),
  strength numeric(4,3) not null default 1.0 check (strength >= 0 and strength <= 1),
  source_basis text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(topic_id, prerequisite_topic_id),
  check (topic_id <> prerequisite_topic_id)
);

create index if not exists idx_subjects_group
  on public.subjects(subject_group);

create index if not exists idx_subjects_active
  on public.subjects(is_active);

create index if not exists idx_subject_aliases_normalized
  on public.subject_aliases(normalized_alias);

create index if not exists idx_topics_subject
  on public.topics(subject_id);

create index if not exists idx_topics_parent
  on public.topics(parent_topic_id);

create index if not exists idx_topics_level
  on public.topics(level);

create index if not exists idx_topics_active
  on public.topics(is_active);

create index if not exists idx_topic_aliases_normalized
  on public.topic_aliases(normalized_alias);

create index if not exists idx_topic_prerequisites_topic
  on public.topic_prerequisites(topic_id);

create index if not exists idx_topic_prerequisites_required
  on public.topic_prerequisites(prerequisite_topic_id);

notify pgrst, 'reload schema';
