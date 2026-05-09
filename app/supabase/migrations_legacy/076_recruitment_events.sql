begin;

create table if not exists public.recruitment_events (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid references public.recruitments(id) on delete set null,
  event_type text not null check (event_type in ('notification','corrigendum','admit_card','exam_date','answer_key','result','cutoff','syllabus','calendar','other')),
  title text,
  official_url text,
  source_id uuid references public.source_registry(id) on delete set null,
  scrape_queue_id uuid references public.scrape_queue(id) on delete set null,
  event_date date,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null
);

create index if not exists idx_recruitment_events_recruitment on public.recruitment_events(recruitment_id, event_type, created_at desc);

commit;
