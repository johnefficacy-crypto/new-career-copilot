-- Canonical schema sync migration
-- Align Supabase DB with backend expectations

--------------------------------------------------
-- PROFILES
--------------------------------------------------
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

--------------------------------------------------
-- RECRUITMENTS
--------------------------------------------------
alter table recruitments add column if not exists slug text;
alter table recruitments add column if not exists publish_status text default 'draft';

create unique index if not exists recruitments_slug_idx on recruitments(slug);

update recruitments
set slug = lower(regexp_replace(name, '[^a-zA-Z0-9]+', '-', 'g'))
where slug is null;

--------------------------------------------------
-- ELIGIBILITY RESULTS
--------------------------------------------------
alter table eligibility_results
add column if not exists is_conditional boolean default false;

--------------------------------------------------
-- STUDY SESSIONS (safe rename)
--------------------------------------------------
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM information_schema.columns
        WHERE table_name='study_sessions' AND column_name='duration_minutes'
    ) THEN
        ALTER TABLE study_sessions
        RENAME COLUMN duration_minutes TO duration_mins;
    END IF;
END $$;

alter table study_sessions add column if not exists subject text;
alter table study_sessions add column if not exists topic text;

--------------------------------------------------
-- STUDY PLANS
--------------------------------------------------
alter table study_plans add column if not exists status text default 'active';

--------------------------------------------------
-- USER APPLICATIONS
--------------------------------------------------
alter table user_recruitment_applications add column if not exists status text default 'started';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_user_apps_recruitment'
    ) THEN
        ALTER TABLE user_recruitment_applications
        ADD CONSTRAINT fk_user_apps_recruitment
        FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE;
    END IF;
END $$;

--------------------------------------------------
-- MOCK TESTS
--------------------------------------------------
alter table mock_tests add column if not exists user_id uuid;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'mock_tests_user_id_fkey'
    ) THEN
        ALTER TABLE mock_tests
        ADD CONSTRAINT mock_tests_user_id_fkey
        FOREIGN KEY (user_id)
        REFERENCES auth.users(id)
        ON DELETE CASCADE;
    END IF;
END $$;

--------------------------------------------------
-- NOTIFICATIONS
--------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'fk_alerts_recruitment'
    ) THEN
        ALTER TABLE notification_alerts
        ADD CONSTRAINT fk_alerts_recruitment
        FOREIGN KEY (recruitment_id)
        REFERENCES recruitments(id)
        ON DELETE CASCADE;
    END IF;
END $$;