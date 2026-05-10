-- Safe Feature Migration Plan: AI governance and recruitment-aware onboarding.
-- AI tables support chat/history and policy controls. Candidate question
-- contract tables implement the recruitment-aware onboarding chatbot plan.

create table if not exists public.ai_prompt_versions (
  id uuid primary key default gen_random_uuid(),
  prompt_key text not null,
  version integer not null default 1,
  prompt_text text not null,
  model text,
  status text not null default 'draft',
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  unique (prompt_key, version)
);

create table if not exists public.ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references public.profiles(id) on delete set null,
  job_type text not null,
  status text not null default 'queued',
  input jsonb not null default '{}'::jsonb,
  output jsonb,
  error_message text,
  prompt_version_id uuid references public.ai_prompt_versions(id) on delete set null,
  model text,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  finished_at timestamptz
);

create table if not exists public.ai_review_queue (
  id uuid primary key default gen_random_uuid(),
  ai_job_id uuid references public.ai_jobs(id) on delete cascade,
  user_id uuid references public.profiles(id) on delete set null,
  review_status text not null default 'pending',
  risk_level text not null default 'low',
  reason text,
  payload jsonb not null default '{}'::jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists public.ai_action_policies (
  id uuid primary key default gen_random_uuid(),
  action text not null unique,
  mode text not null default 'require_approval',
  reason text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.chat_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text,
  messages jsonb not null default '[]'::jsonb,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.candidate_field_registry (
  field_key text primary key,
  canonical_label text not null,
  user_facing_label text not null,
  data_type text not null,
  profile_group text not null,
  profile_table text,
  profile_column text,
  question_template text,
  help_text text,
  allowed_values jsonb default '[]'::jsonb,
  synonyms text[] default '{}'::text[],
  is_active boolean default true,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.recruitment_question_requirements (
  id uuid primary key default gen_random_uuid(),
  recruitment_id uuid not null references public.recruitments(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  field_key text not null references public.candidate_field_registry(field_key),
  requirement_type text not null,
  required_for text not null default 'eligibility',
  priority integer default 100,
  question_text text not null,
  help_text text,
  options jsonb default '[]'::jsonb,
  rule_operator text,
  rule_value jsonb default '{}'::jsonb,
  applies_when jsonb default '{}'::jsonb,
  is_knockout boolean default false,
  evidence_id uuid references public.extracted_field_evidence(id) on delete set null,
  reviewer_status text not null default 'pending',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.funnel_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  anonymous_id text,
  recruitment_id uuid references public.recruitments(id) on delete set null,
  post_id uuid references public.posts(id) on delete set null,
  intent text not null,
  source text,
  utm jsonb default '{}'::jsonb,
  status text not null default 'started',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.onboarding_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  funnel_session_id uuid references public.funnel_sessions(id) on delete set null,
  mode text not null default 'chat',
  current_field_key text references public.candidate_field_registry(field_key),
  missing_fields text[] default '{}'::text[],
  completed_fields text[] default '{}'::text[],
  status text not null default 'active',
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.onboarding_answers (
  id uuid primary key default gen_random_uuid(),
  session_id uuid references public.onboarding_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  field_key text not null references public.candidate_field_registry(field_key),
  answer_value jsonb,
  normalized_value jsonb,
  source text not null default 'guided_chat',
  confidence numeric,
  needs_review boolean default false,
  created_at timestamptz default now()
);

create table if not exists public.funnel_events (
  id uuid primary key default gen_random_uuid(),
  funnel_session_id uuid references public.funnel_sessions(id) on delete cascade,
  user_id uuid references auth.users(id) on delete set null,
  event_name text not null,
  event_payload jsonb default '{}'::jsonb,
  created_at timestamptz default now()
);

create table if not exists public.knowledge_base_university_thresholds (
  id uuid primary key default gen_random_uuid(),
  university_name text not null,
  qualification_level text,
  first_class_min_percentage numeric,
  distinction_min_percentage numeric,
  source_url text,
  verification_status text default 'unverified',
  created_at timestamptz default now()
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'candidate_field_registry_data_type_check'
      and conrelid = 'public.candidate_field_registry'::regclass
  ) then
    alter table public.candidate_field_registry
      add constraint candidate_field_registry_data_type_check
      check (data_type in ('text','number','date','boolean','single_select','multi_select','json'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'recruitment_question_requirements_reviewer_status_check'
      and conrelid = 'public.recruitment_question_requirements'::regclass
  ) then
    alter table public.recruitment_question_requirements
      add constraint recruitment_question_requirements_reviewer_status_check
      check (reviewer_status in ('pending','verified','rejected'));
  end if;
end $$;

create index if not exists ai_jobs_user_id_idx on public.ai_jobs(user_id);
create index if not exists ai_jobs_status_idx on public.ai_jobs(status);
create index if not exists ai_jobs_job_type_idx on public.ai_jobs(job_type);
create index if not exists ai_review_queue_status_idx on public.ai_review_queue(review_status);
create index if not exists chat_sessions_user_id_updated_at_idx on public.chat_sessions(user_id, updated_at desc);
create index if not exists idx_rqr_recruitment_post on public.recruitment_question_requirements(recruitment_id, post_id);
create index if not exists idx_rqr_field_key on public.recruitment_question_requirements(field_key);
create index if not exists idx_rqr_verified on public.recruitment_question_requirements(recruitment_id, post_id, required_for, reviewer_status);
create index if not exists idx_funnel_sessions_user on public.funnel_sessions(user_id, status);
create index if not exists idx_funnel_sessions_anonymous on public.funnel_sessions(anonymous_id, status);
create index if not exists idx_onboarding_sessions_user on public.onboarding_sessions(user_id, status);
create index if not exists idx_onboarding_answers_session on public.onboarding_answers(session_id, created_at);
create index if not exists idx_funnel_events_session on public.funnel_events(funnel_session_id, created_at);

insert into public.candidate_field_registry
(field_key, canonical_label, user_facing_label, data_type, profile_group, profile_table, profile_column, question_template, synonyms)
values
('date_of_birth', 'Date of birth', 'Date of birth', 'date', 'identity', 'profiles', 'date_of_birth', 'What is your date of birth?', array['dob','birth date']),
('reservation_category', 'Reservation category', 'Reservation category', 'single_select', 'reservation', 'profiles', 'category', 'Which reservation category should we use?', array['category','caste category']),
('domicile_state', 'Domicile state', 'Domicile state', 'single_select', 'location', 'profiles', 'domicile_state', 'What is your domicile state?', array['state','home state']),
('highest_qualification_level', 'Highest qualification level', 'Highest completed qualification', 'single_select', 'education', 'aspirant_education', 'level', 'What is your highest completed qualification?', array['education level','qualification']),
('qualification_discipline', 'Branch / discipline', 'Branch / discipline', 'text', 'education', 'aspirant_education', 'stream', 'What is your branch or discipline?', array['stream','subject','branch']),
('qualification_class', 'Qualification class', 'Class / division', 'single_select', 'education', 'aspirant_education', 'class_division', 'Did you pass with 1st class?', array['first class','division']),
('qualification_percentage', 'Qualification percentage', 'Percentage / marks', 'number', 'education', 'aspirant_education', 'percentage', 'What percentage did you score in your qualifying exam?', array['marks','percentage']),
('has_marathi_knowledge', 'Adequate knowledge of Marathi', 'Marathi language knowledge', 'boolean', 'language', null, null, 'Do you possess adequate knowledge of Marathi language?', array['marathi','language knowledge']),
('has_industrial_safety_diploma', 'Diploma in Industrial Safety', 'Industrial Safety diploma', 'boolean', 'certification', 'aspirant_certifications', 'certification_name', 'Do you have a Diploma in Industrial Safety from a recognized institution?', array['industrial safety diploma','safety diploma']),
('factory_supervisory_experience_years', 'Factory supervisory experience', 'Factory supervisory experience', 'number', 'experience', 'aspirant_experience', 'years_experience', 'How many years of supervisory experience do you have in a factory?', array['factory experience','supervisory experience'])
on conflict (field_key) do nothing;

insert into public.ai_action_policies (action, mode, reason)
values
('eligibility_verdict', 'deny', 'Deterministic eligibility engine owns verdicts.'),
('publish_recruitment', 'deny', 'Only admins may publish verified recruitments.'),
('profile_write', 'require_approval', 'Profile writes must use explicit user answers.'),
('study_plan_suggestion', 'allow', 'AI may suggest non-authoritative study actions.')
on conflict (action) do nothing;

alter table public.ai_prompt_versions enable row level security;
alter table public.ai_jobs enable row level security;
alter table public.ai_review_queue enable row level security;
alter table public.ai_action_policies enable row level security;
alter table public.chat_sessions enable row level security;
alter table public.candidate_field_registry enable row level security;
alter table public.recruitment_question_requirements enable row level security;
alter table public.funnel_sessions enable row level security;
alter table public.onboarding_sessions enable row level security;
alter table public.onboarding_answers enable row level security;
alter table public.funnel_events enable row level security;

notify pgrst, 'reload schema';
