-- 031_pyq_question_intelligence.sql
-- Deep PYQ intelligence: papers, questions, options, tags, repeated patterns, and relations.
-- Separate from user mock_tests; mock_tests are user-attempt analytics.

create table if not exists public.pyq_sources (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid not null references public.exams(id) on delete cascade,
  source_id uuid references public.source_registry(id) on delete set null,
  source_type text not null default 'unknown'
    check (source_type in ('official', 'memory_based', 'coaching', 'community', 'aggregator', 'unknown')),
  source_url text,
  title text,
  trust_status text not null default 'pending'
    check (trust_status in ('pending', 'verified', 'rejected')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pyq_papers (
  id uuid primary key default gen_random_uuid(),
  pyq_source_id uuid references public.pyq_sources(id) on delete set null,
  exam_id uuid not null references public.exams(id) on delete cascade,
  exam_cycle_id uuid references public.exam_cycles(id) on delete set null,
  exam_phase_id uuid references public.exam_phases(id) on delete set null,
  year integer,
  paper_date date,
  shift text,
  paper_code text,
  source_url text,
  source_type text not null default 'unknown'
    check (source_type in ('official', 'memory_based', 'coaching', 'community', 'aggregator', 'unknown')),
  trust_status text not null default 'pending'
    check (trust_status in ('pending', 'verified', 'rejected')),
  content_hash text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists pyq_papers_unique_known_uidx
  on public.pyq_papers(exam_id, exam_phase_id, year, paper_date, shift, paper_code)
  where exam_phase_id is not null;

create table if not exists public.pyq_questions (
  id uuid primary key default gen_random_uuid(),
  pyq_paper_id uuid not null references public.pyq_papers(id) on delete cascade,
  question_number integer,
  question_text text,
  normalized_question_hash text,
  question_type text not null default 'mcq'
    check (question_type in ('mcq', 'numerical', 'descriptive', 'caselet', 'matching', 'other')),
  correct_option_id uuid,
  explanation_text text,
  observed_difficulty text,
  expected_solve_time_sec integer,
  language text,
  reviewer_status text not null default 'pending'
    check (reviewer_status in ('pending', 'verified', 'rejected', 'needs_correction')),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.pyq_options (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.pyq_questions(id) on delete cascade,
  option_label text,
  option_text text,
  normalized_option_hash text,
  normalized_value text,
  is_correct boolean not null default false,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(question_id, option_label)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.pyq_questions'::regclass
      and conname = 'pyq_questions_correct_option_id_fkey'
  ) then
    alter table public.pyq_questions
      add constraint pyq_questions_correct_option_id_fkey
      foreign key (correct_option_id) references public.pyq_options(id)
      on delete set null not valid;
  end if;
end $$;

create table if not exists public.pyq_question_topic_tags (
  id uuid primary key default gen_random_uuid(),
  question_id uuid not null references public.pyq_questions(id) on delete cascade,
  topic_id uuid not null references public.topics(id) on delete restrict,
  tag_weight numeric(4,3) not null default 1 check (tag_weight >= 0 and tag_weight <= 1),
  tag_role text not null default 'primary'
    check (tag_role in ('primary', 'secondary', 'prerequisite', 'trap', 'calculation_layer', 'conceptual_layer')),
  tagging_source text not null default 'manual'
    check (tagging_source in ('manual', 'admin', 'ai', 'rule', 'imported')),
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  reviewer_status text not null default 'pending'
    check (reviewer_status in ('pending', 'verified', 'rejected', 'needs_correction')),
  reviewed_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(question_id, topic_id, tag_role)
);

create table if not exists public.pyq_option_patterns (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.pyq_options(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete set null,
  pattern_type text not null
    check (pattern_type in ('repeated_value', 'common_trap', 'approximation', 'extreme_value', 'formula_confusion', 'chronology_trap', 'concept_confusion', 'elimination_pattern', 'other')),
  normalized_value text,
  confidence_score numeric(4,3) not null default 0 check (confidence_score >= 0 and confidence_score <= 1),
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.pyq_option_repetitions (
  id uuid primary key default gen_random_uuid(),
  exam_id uuid references public.exams(id) on delete cascade,
  topic_id uuid references public.topics(id) on delete cascade,
  option_hash text not null,
  normalized_value text,
  occurrence_count integer not null default 1,
  first_seen_year integer,
  last_seen_year integer,
  examples jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now()
);

create unique index if not exists pyq_option_repetitions_exam_topic_hash_uidx
  on public.pyq_option_repetitions(exam_id, topic_id, option_hash)
  where exam_id is not null and topic_id is not null;

create table if not exists public.question_relation_edges (
  id uuid primary key default gen_random_uuid(),
  source_question_id uuid not null references public.pyq_questions(id) on delete cascade,
  target_question_id uuid not null references public.pyq_questions(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('exact_repeat', 'near_repeat', 'same_template', 'same_concept', 'same_option_pattern', 'same_trap', 'escalation_variant', 'cross_subject_link')),
  similarity_score numeric(4,3) not null default 0 check (similarity_score >= 0 and similarity_score <= 1),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique(source_question_id, target_question_id, relation_type),
  check (source_question_id <> target_question_id)
);

create table if not exists public.topic_relation_edges (
  id uuid primary key default gen_random_uuid(),
  source_topic_id uuid not null references public.topics(id) on delete cascade,
  target_topic_id uuid not null references public.topics(id) on delete cascade,
  exam_id uuid references public.exams(id) on delete cascade,
  relation_type text not null
    check (relation_type in ('prerequisite', 'co_occurs_with', 'frequently_combined', 'confusion_pair', 'alternate_route', 'revision_cluster', 'cross_subject_link')),
  strength numeric(4,3) not null default 0 check (strength >= 0 and strength <= 1),
  evidence_count integer not null default 0,
  last_observed_year integer,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(source_topic_id, target_topic_id, exam_id, relation_type),
  check (source_topic_id <> target_topic_id)
);

create index if not exists idx_pyq_sources_exam
  on public.pyq_sources(exam_id);

create index if not exists idx_pyq_papers_exam_phase_year
  on public.pyq_papers(exam_id, exam_phase_id, year);

create index if not exists idx_pyq_papers_hash
  on public.pyq_papers(content_hash);

create index if not exists idx_pyq_questions_paper
  on public.pyq_questions(pyq_paper_id);

create index if not exists idx_pyq_questions_hash
  on public.pyq_questions(normalized_question_hash);

create index if not exists idx_pyq_questions_review
  on public.pyq_questions(reviewer_status);

create index if not exists idx_pyq_options_question
  on public.pyq_options(question_id);

create index if not exists idx_pyq_options_hash
  on public.pyq_options(normalized_option_hash);

create index if not exists idx_pyq_question_topic_tags_question
  on public.pyq_question_topic_tags(question_id);

create index if not exists idx_pyq_question_topic_tags_topic
  on public.pyq_question_topic_tags(topic_id);

create index if not exists idx_pyq_question_topic_tags_review
  on public.pyq_question_topic_tags(reviewer_status);

create index if not exists idx_pyq_option_patterns_option
  on public.pyq_option_patterns(option_id);

create index if not exists idx_question_relation_edges_source
  on public.question_relation_edges(source_question_id);

create index if not exists idx_question_relation_edges_target
  on public.question_relation_edges(target_question_id);

create index if not exists idx_topic_relation_edges_source
  on public.topic_relation_edges(source_topic_id);

create index if not exists idx_topic_relation_edges_exam
  on public.topic_relation_edges(exam_id, relation_type);

notify pgrst, 'reload schema';
