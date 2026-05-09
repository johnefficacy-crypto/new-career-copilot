-- Clean baseline 002: core runtime schema (ordered for fresh-project safety)

-- identity/profile
create table if not exists public.profiles (
  id uuid primary key,
  email text,
  full_name text,
  phone text,
  state text,
  onboarding_completed boolean not null default false,
  is_admin boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.certifications (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  issuing_body text,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.aspirant_education (id uuid primary key default gen_random_uuid(), user_id uuid, level text not null, degree text, stream text, institution text, university text, graduation_year int, percentage numeric, cgpa numeric, is_completed boolean default true);
create table if not exists public.aspirant_preferences (id uuid primary key default gen_random_uuid(), user_id uuid unique, preferred_sectors text[], preferred_states text[], willing_to_relocate boolean default true, target_exams text[], created_at timestamptz default now(), study_mode text, study_hours_per_day numeric);
create table if not exists public.aspirant_certifications (id uuid primary key default gen_random_uuid(), user_id uuid, certification_name text, issuing_body text, year_completed int, is_active boolean default true);
create table if not exists public.aspirant_experience (id uuid primary key default gen_random_uuid(), user_id uuid, sector text, role text, organization text, start_date date, end_date date, years_experience numeric, created_at timestamptz default now());
create table if not exists public.aspirant_location (user_id uuid primary key, state text not null, district text, is_rural boolean, domicile_certificate boolean default false);
create table if not exists public.aspirant_reservations (user_id uuid primary key, category text not null, sub_category text, is_pwd boolean default false, pwd_type text, is_ex_serviceman boolean default false, is_jk_domicile boolean default false, is_widow boolean default false, age_relaxation_extra_years int default 0);
create table if not exists public.aspirant_exam_attempts (id uuid primary key default gen_random_uuid(), user_id uuid, exam_id uuid, attempts_used int default 0);
create table if not exists public.aspirant_exam_credentials (id uuid primary key default gen_random_uuid(), user_id uuid not null, exam_key text not null, score numeric, percentile numeric, rank_text text, exam_year int, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- recruitment
create table if not exists public.organizations (id uuid primary key default gen_random_uuid(), name text not null, type text, state text, is_active boolean default true, created_at timestamptz default now());
create table if not exists public.recruitments (id uuid primary key default gen_random_uuid(), organization_id uuid, name text not null, status text default 'active', publish_status text default 'published', apply_start_date date, apply_end_date date, notification_date date, year int, total_vacancies int, created_at timestamptz default now(), updated_at timestamptz default now());
create table if not exists public.posts (id uuid primary key default gen_random_uuid(), recruitment_id uuid, post_name text not null, post_code text, created_at timestamptz default now());
create table if not exists public.vacancies (id uuid primary key default gen_random_uuid(), post_id uuid, category text, vacancy_count int not null default 0 check (vacancy_count >= 0));
create table if not exists public.age_criteria (id uuid primary key default gen_random_uuid(), post_id uuid, min_age int, max_age int, cutoff_date date);
create table if not exists public.education_criteria (id uuid primary key default gen_random_uuid(), post_id uuid, level text, degree text, stream text, min_percentage numeric, required boolean default true);
create table if not exists public.attempt_limits (id uuid primary key default gen_random_uuid(), post_id uuid, category text, max_attempts int check (max_attempts is null or max_attempts >= 0));
create table if not exists public.certification_criteria (id uuid primary key default gen_random_uuid(), post_id uuid, certification_name text, required boolean default true);
create table if not exists public.salary_details (id uuid primary key default gen_random_uuid(), post_id uuid, pay_level text, basic_pay_min numeric, basic_pay_max numeric);
create table if not exists public.eligibility_results (id uuid primary key default gen_random_uuid(), user_id uuid not null, recruitment_id uuid not null, post_id uuid, profile_hash text, is_eligible boolean not null default false, reasons jsonb default '[]'::jsonb, computed_at timestamptz not null default now());
create table if not exists public.eligibility_recompute_queue (id uuid primary key default gen_random_uuid(), user_id uuid, recruitment_id uuid, post_id uuid, reason text, status text not null default 'queued', queued_at timestamptz not null default now(), claimed_at timestamptz, processed_at timestamptz, error_message text);
create table if not exists public.tracked_recruitments (id uuid primary key default gen_random_uuid(), user_id uuid not null, recruitment_id uuid not null, created_at timestamptz not null default now());
create table if not exists public.user_recruitment_applications (id uuid primary key default gen_random_uuid(), user_id uuid not null, recruitment_id uuid not null, post_id uuid, application_status text, applied_at timestamptz, notes text, created_at timestamptz default now());

-- scraper/admin
create table if not exists public.source_registry (id uuid primary key default gen_random_uuid(), source_name text not null, source_url text, source_type text, state text, is_active boolean not null default true, created_at timestamptz default now());
create table if not exists public.scrape_sources (id uuid primary key default gen_random_uuid(), source_registry_id uuid, source_name text, source_url text not null, is_active boolean default true, created_at timestamptz default now());
create table if not exists public.scrape_runs (id uuid primary key default gen_random_uuid(), source_id uuid, status text default 'running', started_at timestamptz default now(), completed_at timestamptz);
create table if not exists public.notification_documents (id uuid primary key default gen_random_uuid(), scrape_queue_id uuid, file_url text, document_type text, created_at timestamptz default now());
create table if not exists public.scrape_queue (id uuid primary key default gen_random_uuid(), scrape_run_id uuid, source_url text not null, source_name text, status text not null default 'queued', confidence_score numeric, data_quality_score numeric, extracted_data jsonb default '{}'::jsonb, scraped_at timestamptz, reviewed_at timestamptz, reviewer_notes text, notification_document_id uuid, extraction_provider text, extraction_model text, extraction_prompt_version text, extraction_status text, evidence_required boolean default false, recruitment_id uuid);
create table if not exists public.source_observations (id uuid primary key default gen_random_uuid(), scrape_run_id uuid, source_url text not null, fingerprint text, status text, canonical_id uuid, created_at timestamptz default now());
create table if not exists public.extracted_field_evidence (id uuid primary key default gen_random_uuid(), scrape_queue_id uuid, document_id uuid, entity_type text, entity_key text, field_name text not null, evidence_text text, reviewer_status text default 'unverified', created_at timestamptz default now());
create table if not exists public.admin_audit_logs (id uuid primary key default gen_random_uuid(), actor_id uuid, actor_email text, action text not null, entity_type text not null, entity_id text, old_value jsonb, new_value jsonb, notes text, created_at timestamptz not null default now(), admin_user_id uuid, before_payload jsonb, after_payload jsonb, metadata jsonb);
create table if not exists public.admin_settings (key text primary key, value text not null, updated_by uuid, updated_at timestamptz not null default now());

-- notifications
create table if not exists public.recruitment_field_diffs (id uuid primary key default gen_random_uuid(), recruitment_id uuid, diff_payload jsonb default '{}'::jsonb, created_at timestamptz default now());
create table if not exists public.alert_events (id uuid primary key default gen_random_uuid(), event_type text not null, recruitment_id uuid not null, diff_id uuid, payload jsonb not null default '{}'::jsonb, priority smallint not null default 2 check (priority between 1 and 5), fanout_status text not null default 'pending', fanout_started_at timestamptz, fanout_completed_at timestamptz, users_notified int default 0, created_at timestamptz not null default now());
create table if not exists public.notification_alerts (id uuid primary key default gen_random_uuid(), user_id uuid not null, recruitment_id uuid, alert_event_id uuid, alert_type text not null, priority smallint default 2, is_read boolean not null default false, sent_at timestamptz not null default now(), read_at timestamptz, explanation jsonb default '{}'::jsonb);
create table if not exists public.notification_preferences (id uuid primary key default gen_random_uuid(), user_id uuid unique not null, in_app_enabled boolean not null default true, email_enabled boolean not null default false, whatsapp_enabled boolean not null default false, telegram_enabled boolean not null default false, digest_frequency text default 'instant', updated_at timestamptz default now());
create table if not exists public.notification_generation_runs (id uuid primary key default gen_random_uuid(), started_at timestamptz default now(), completed_at timestamptz, status text default 'running', stats jsonb default '{}'::jsonb);
create table if not exists public.notification_group_state (id uuid primary key default gen_random_uuid(), user_id uuid not null, recruitment_id uuid not null, last_event_at timestamptz, state jsonb default '{}'::jsonb, updated_at timestamptz default now());

-- payments + product
create table if not exists public.subscription_plans (id uuid primary key default gen_random_uuid(), plan_code text unique, name text not null, price numeric not null default 0, billing_period text, is_active boolean default true);
create table if not exists public.user_subscriptions (id uuid primary key default gen_random_uuid(), user_id uuid not null, plan_id uuid not null, status text not null default 'active', starts_at timestamptz default now(), ends_at timestamptz);
create table if not exists public.payment_history (id uuid primary key default gen_random_uuid(), user_id uuid not null, subscription_id uuid, amount numeric not null default 0, currency text default 'INR', provider text, provider_payment_id text, status text default 'pending', paid_at timestamptz, created_at timestamptz default now());
create table if not exists public.study_plans (id uuid primary key default gen_random_uuid(), user_id uuid not null, title text not null, description text, created_at timestamptz default now());
create table if not exists public.study_sessions (id uuid primary key default gen_random_uuid(), plan_id uuid, user_id uuid not null, starts_at timestamptz, ends_at timestamptz, duration_minutes int);
create table if not exists public.study_tasks (id uuid primary key default gen_random_uuid(), plan_id uuid, user_id uuid not null, title text not null, status text default 'pending', due_at timestamptz);
create table if not exists public.courses (id uuid primary key default gen_random_uuid(), title text not null, description text, is_published boolean default false, created_at timestamptz default now());
create table if not exists public.course_sections (id uuid primary key default gen_random_uuid(), course_id uuid not null, title text not null, sort_order int default 0);
create table if not exists public.lessons (id uuid primary key default gen_random_uuid(), section_id uuid not null, title text not null, content text, sort_order int default 0);
create table if not exists public.reviews (id uuid primary key default gen_random_uuid(), user_id uuid, course_id uuid, rating int check (rating between 1 and 5), comment text, created_at timestamptz default now());
create table if not exists public.mock_tests (id uuid primary key default gen_random_uuid(), title text not null, duration_minutes int, total_questions int, created_at timestamptz default now());
create table if not exists public.forum_categories (id uuid primary key default gen_random_uuid(), name text not null unique, description text);
create table if not exists public.forum_posts (id uuid primary key default gen_random_uuid(), category_id uuid, user_id uuid, title text not null, body text, created_at timestamptz default now());
create table if not exists public.forum_comments (id uuid primary key default gen_random_uuid(), post_id uuid not null, user_id uuid, body text not null, created_at timestamptz default now());
create table if not exists public.forum_post_upvotes (id uuid primary key default gen_random_uuid(), post_id uuid not null, user_id uuid not null, created_at timestamptz default now(), unique (post_id, user_id));

-- foreign keys added after table creation to reduce circular dependency risk
alter table if exists public.aspirant_education add constraint aspirant_education_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_preferences add constraint aspirant_preferences_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_certifications add constraint aspirant_certifications_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_experience add constraint aspirant_experience_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_location add constraint aspirant_location_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_reservations add constraint aspirant_reservations_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_exam_attempts add constraint aspirant_exam_attempts_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.aspirant_exam_credentials add constraint aspirant_exam_credentials_user_id_fkey foreign key (user_id) references public.profiles(id);
alter table if exists public.recruitments add constraint recruitments_organization_id_fkey foreign key (organization_id) references public.organizations(id);
alter table if exists public.posts add constraint posts_recruitment_id_fkey foreign key (recruitment_id) references public.recruitments(id);
alter table if exists public.vacancies add constraint vacancies_post_id_fkey foreign key (post_id) references public.posts(id);
alter table if exists public.alert_events add constraint alert_events_recruitment_id_fkey foreign key (recruitment_id) references public.recruitments(id);
alter table if exists public.alert_events add constraint alert_events_diff_id_fkey foreign key (diff_id) references public.recruitment_field_diffs(id);

-- TODO(fk): add remaining foreign keys from live DB introspection with exact names/options.
