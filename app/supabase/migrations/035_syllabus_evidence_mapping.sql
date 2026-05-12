-- 030_syllabus_evidence_mapping.sql
-- Evidence layer for official syllabus and topic mapping.
-- Uses source_registry where available; does not replace notification_documents/extracted_field_evidence.

create table if not exists public.syllabus_documents (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  source_id uuid references public.source_registry(id) on delete set null,
  document_type text not null default 'syllabus'
    check (document_type in ('notification', 'syllabus_pdf', 'official_page', 'pattern_notice', 'corrigendum', 'other')),
  title text,
  source_url text,
  storage_path text,
  content_hash text,
  trust_status text not null default 'pending'
    check (trust_status in ('pending', 'verified', 'rejected', 'superseded')),
  published_at timestamptz,
  fetched_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.syllabus_topic_mentions (
  id uuid primary key default gen_random_uuid(),
  syllabus_document_id uuid not null references public.syllabus_documents(id) on delete cascade,
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  exam_phase_id uuid references public.exam_phases(id) on delete set null,
  topic_id uuid not null references public.topics(id) on delete restrict,

  raw_text text,
  normalized_text text,
  mention_type text not null default 'explicit'
    check (mention_type in ('explicit', 'implied', 'parent_topic_only', 'derived')),
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),

  extraction_method text,
  reviewer_status text not null default 'pending'
    check (reviewer_status in ('pending', 'verified', 'rejected', 'needs_correction')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewer_notes text,

  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create unique index if not exists syllabus_topic_mentions_doc_phase_topic_uidx
  on public.syllabus_topic_mentions(syllabus_document_id, exam_phase_id, topic_id)
  where exam_phase_id is not null;

create unique index if not exists syllabus_topic_mentions_doc_topic_no_phase_uidx
  on public.syllabus_topic_mentions(syllabus_document_id, topic_id)
  where exam_phase_id is null;

create index if not exists idx_syllabus_documents_exam
  on public.syllabus_documents(exam_id, exam_cycle_id);

create index if not exists idx_syllabus_documents_hash
  on public.syllabus_documents(content_hash);

create index if not exists idx_syllabus_documents_trust
  on public.syllabus_documents(trust_status);

create index if not exists idx_syllabus_topic_mentions_exam_phase
  on public.syllabus_topic_mentions(exam_id, exam_phase_id);

create index if not exists idx_syllabus_topic_mentions_topic
  on public.syllabus_topic_mentions(topic_id);

create index if not exists idx_syllabus_topic_mentions_review
  on public.syllabus_topic_mentions(reviewer_status);

notify pgrst, 'reload schema';
