-- Canonical schema sync migration
-- Align Supabase DB with backend expectations

-- PROFILES
alter table profiles add column if not exists gender text;
alter table profiles add column if not exists category text;
alter table profiles add column if not exists pwbd_status boolean default false;
alter table profiles add column if not exists domicile_state text;
alter table profiles add column if not exists nationality text;
alter table profiles add column if not exists ex_serviceman boolean default false;
alter table profiles add column if not exists govt_employee boolean default false;
alter table profiles add column if not exists dob date;
alter table profiles add column if not exists date_of_birth date;
alter table profiles add column if not exists service_years int;
alter table profiles add column if not exists graduation_year int;
alter table profiles add column if not exists target_type text;
alter table profiles add column if not exists target_exam text;
alter table profiles add column if not exists career_stage text;
alter table profiles add column if not exists career_goal text;
alter table profiles add column if not exists onboarding_step int default 0;
alter table profiles add column if not exists onboarding_completed boolean default false;
alter table profiles add column if not exists is_admin boolean default false;
alter table profiles add column if not exists plan_id text;
alter table profiles add column if not exists avatar_url text;

create unique index if not exists profiles_id_idx on profiles(id);

-- RECRUITMENTS
alter table recruitments add column if not exists slug text unique;
alter table recruitments add column if not exists publish_status text default 'draft';

update recruitments
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

-- ELIGIBILITY RESULTS
alter table eligibility_results
add column if not exists is_conditional boolean default false;

-- STUDY SESSIONS
alter table study_sessions rename column duration_minutes to duration_mins;
alter table study_sessions add column if not exists subject text;
alter table study_sessions add column if not exists topic text;

-- STUDY PLANS
alter table study_plans add column if not exists status text default 'active';

-- USER APPLICATIONS
alter table user_recruitment_applications add column if not exists status text default 'started';
alter table user_recruitment_applications
add constraint if not exists fk_user_apps_recruitment
foreign key (recruitment_id) references recruitments(id) on delete cascade;

-- MOCK TESTS
alter table mock_tests add column if not exists user_id uuid;

-- NOTIFICATIONS
alter table notification_alerts
add constraint if not exists fk_alerts_recruitment
foreign key (recruitment_id) references recruitments(id) on delete cascade;
