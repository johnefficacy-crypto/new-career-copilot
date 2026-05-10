-- Safe Feature Migration Plan: marketplace runtime schema.
-- Completes the additive marketplace shape after 011 without replaying
-- legacy CREATE TABLE definitions over the clean baseline.

--------------------------------------------------
-- EXISTING TABLE WIDENING
--------------------------------------------------

alter table public.courses
  add column if not exists instructor_id uuid,
  add column if not exists slug text,
  add column if not exists short_description text,
  add column if not exists thumbnail_url text,
  add column if not exists preview_video_url text,
  add column if not exists price_inr integer not null default 0,
  add column if not exists original_price_inr integer,
  add column if not exists level text not null default 'all',
  add column if not exists language text not null default 'Hindi',
  add column if not exists exam_tags text[] not null default '{}'::text[],
  add column if not exists status text not null default 'draft',
  add column if not exists total_lessons integer not null default 0,
  add column if not exists total_duration_mins integer not null default 0,
  add column if not exists avg_rating numeric(3,2),
  add column if not exists total_reviews integer not null default 0,
  add column if not exists total_enrollments integer not null default 0,
  add column if not exists commission_pct integer not null default 20,
  add column if not exists updated_at timestamptz default now();

alter table public.course_sections
  add column if not exists order_index integer not null default 0,
  add column if not exists is_free_preview boolean not null default false;

alter table public.lessons
  add column if not exists type text not null default 'video',
  add column if not exists order_index integer not null default 0,
  add column if not exists duration_mins integer,
  add column if not exists is_free_preview boolean not null default false,
  add column if not exists content_url text,
  add column if not exists content_text text;

alter table public.reviews
  add column if not exists body text,
  add column if not exists updated_at timestamptz default now();

do $$
begin
  if exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'reviews'
      and column_name = 'comment'
  ) then
    update public.reviews
       set body = comment
     where body is null
       and comment is not null;
  end if;
end $$;

--------------------------------------------------
-- MISSING MARKETPLACE TABLES
--------------------------------------------------

create table if not exists public.enrollments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  status text not null default 'active',
  amount_paid_inr integer not null default 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  enrolled_at timestamptz default now(),
  completed_at timestamptz
);

create table if not exists public.lesson_progress (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  lesson_id uuid not null references public.lessons(id) on delete cascade,
  course_id uuid not null references public.courses(id) on delete cascade,
  completed boolean not null default false,
  completed_at timestamptz,
  watch_seconds integer not null default 0
);

create table if not exists public.instructor_payouts (
  id uuid primary key default gen_random_uuid(),
  instructor_id uuid not null references public.profiles(id) on delete cascade,
  amount_inr integer not null,
  status text not null default 'pending',
  period_start date not null,
  period_end date not null,
  razorpay_payout_id text,
  created_at timestamptz default now()
);

--------------------------------------------------
-- GUARDED CONSTRAINTS
--------------------------------------------------

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_instructor_id_fkey'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_instructor_id_fkey
      foreign key (instructor_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'course_sections_course_id_fkey'
      and conrelid = 'public.course_sections'::regclass
  ) then
    alter table public.course_sections
      add constraint course_sections_course_id_fkey
      foreign key (course_id) references public.courses(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lessons_section_id_fkey'
      and conrelid = 'public.lessons'::regclass
  ) then
    alter table public.lessons
      add constraint lessons_section_id_fkey
      foreign key (section_id) references public.course_sections(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reviews_course_id_fkey'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_course_id_fkey
      foreign key (course_id) references public.courses(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reviews_user_id_fkey'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_user_id_fkey
      foreign key (user_id) references public.profiles(id) on delete cascade;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_level_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_level_check
      check (level in ('beginner','intermediate','advanced','all'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_status_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_status_check
      check (status in ('draft','published','archived'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'courses_commission_check'
      and conrelid = 'public.courses'::regclass
  ) then
    alter table public.courses
      add constraint courses_commission_check
      check (commission_pct between 0 and 100);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'lessons_type_check'
      and conrelid = 'public.lessons'::regclass
  ) then
    alter table public.lessons
      add constraint lessons_type_check
      check (type in ('video','pdf','text','quiz'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'enrollments_status_check'
      and conrelid = 'public.enrollments'::regclass
  ) then
    alter table public.enrollments
      add constraint enrollments_status_check
      check (status in ('active','completed','refunded'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'reviews_rating_check'
      and conrelid = 'public.reviews'::regclass
  ) then
    alter table public.reviews
      add constraint reviews_rating_check
      check (rating between 1 and 5);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'payouts_status_check'
      and conrelid = 'public.instructor_payouts'::regclass
  ) then
    alter table public.instructor_payouts
      add constraint payouts_status_check
      check (status in ('pending','processing','paid','failed'));
  end if;
end $$;

create index if not exists courses_slug_idx
  on public.courses(slug)
  where slug is not null;

create unique index if not exists enrollments_user_course_uidx
  on public.enrollments(user_id, course_id);

create unique index if not exists lesson_progress_user_lesson_uidx
  on public.lesson_progress(user_id, lesson_id);

create index if not exists reviews_user_course_idx
  on public.reviews(user_id, course_id);

create index if not exists courses_instructor_idx
  on public.courses(instructor_id);

create index if not exists courses_status_idx
  on public.courses(status);

create index if not exists courses_exam_tags_idx
  on public.courses using gin(exam_tags);

create index if not exists course_sections_course_order_idx
  on public.course_sections(course_id, order_index);

create index if not exists lessons_section_order_idx
  on public.lessons(section_id, order_index);

create index if not exists enrollments_user_idx
  on public.enrollments(user_id);

create index if not exists lesson_progress_user_idx
  on public.lesson_progress(user_id, course_id);

--------------------------------------------------
-- DERIVED COURSE COUNTS
--------------------------------------------------

create or replace function public.refresh_course_stats()
returns trigger
language plpgsql
as $$
begin
  update public.courses
     set avg_rating = (
           select round(avg(rating)::numeric, 2)
             from public.reviews
            where course_id = coalesce(new.course_id, old.course_id)
         ),
         total_reviews = (
           select count(*)
             from public.reviews
            where course_id = coalesce(new.course_id, old.course_id)
         )
   where id = coalesce(new.course_id, old.course_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_course_stats on public.reviews;
create trigger trg_refresh_course_stats
after insert or update or delete on public.reviews
for each row execute function public.refresh_course_stats();

create or replace function public.refresh_enrollment_count()
returns trigger
language plpgsql
as $$
begin
  update public.courses
     set total_enrollments = (
           select count(*)
             from public.enrollments
            where course_id = coalesce(new.course_id, old.course_id)
              and status = 'active'
         )
   where id = coalesce(new.course_id, old.course_id);

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_refresh_enrollment_count on public.enrollments;
create trigger trg_refresh_enrollment_count
after insert or update or delete on public.enrollments
for each row execute function public.refresh_enrollment_count();

--------------------------------------------------
-- RLS
--------------------------------------------------

alter table public.courses enable row level security;
alter table public.course_sections enable row level security;
alter table public.lessons enable row level security;
alter table public.enrollments enable row level security;
alter table public.lesson_progress enable row level security;
alter table public.reviews enable row level security;
alter table public.instructor_payouts enable row level security;

drop policy if exists "Public reads published courses" on public.courses;
create policy "Public reads published courses"
  on public.courses for select
  using (status = 'published' or auth.role() = 'service_role');

drop policy if exists "Instructor manages own courses" on public.courses;
create policy "Instructor manages own courses"
  on public.courses for all
  using (auth.uid() = instructor_id or auth.role() = 'service_role')
  with check (auth.uid() = instructor_id or auth.role() = 'service_role');

drop policy if exists "Admin manages all courses" on public.courses;
create policy "Admin manages all courses"
  on public.courses for all
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

drop policy if exists "Public reads sections of published courses" on public.course_sections;
create policy "Public reads sections of published courses"
  on public.course_sections for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.courses
      where id = course_id
        and status = 'published'
    )
  );

drop policy if exists "Instructor manages own sections" on public.course_sections;
create policy "Instructor manages own sections"
  on public.course_sections for all
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.courses
      where id = course_id
        and instructor_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.courses
      where id = course_id
        and instructor_id = auth.uid()
    )
  );

drop policy if exists "Public reads free preview lessons" on public.lessons;
create policy "Public reads free preview lessons"
  on public.lessons for select
  using (
    is_free_preview = true
    or auth.role() = 'service_role'
  );

drop policy if exists "Enrolled users read all lessons" on public.lessons;
create policy "Enrolled users read all lessons"
  on public.lessons for select
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.course_sections cs
      join public.enrollments e on e.course_id = cs.course_id
      where cs.id = section_id
        and e.user_id = auth.uid()
        and e.status = 'active'
    )
  );

drop policy if exists "Instructor manages own lessons" on public.lessons;
create policy "Instructor manages own lessons"
  on public.lessons for all
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.course_sections cs
      join public.courses c on c.id = cs.course_id
      where cs.id = section_id
        and c.instructor_id = auth.uid()
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.course_sections cs
      join public.courses c on c.id = cs.course_id
      where cs.id = section_id
        and c.instructor_id = auth.uid()
    )
  );

drop policy if exists "Users read own enrollments" on public.enrollments;
create policy "Users read own enrollments"
  on public.enrollments for select
  using (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "Service role manages enrollments" on public.enrollments;
create policy "Service role manages enrollments"
  on public.enrollments for all
  using (auth.role() = 'service_role')
  with check (auth.role() = 'service_role');

drop policy if exists "Users manage own progress" on public.lesson_progress;
create policy "Users manage own progress"
  on public.lesson_progress for all
  using (user_id = auth.uid() or auth.role() = 'service_role')
  with check (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "Public reads reviews" on public.reviews;
create policy "Public reads reviews"
  on public.reviews for select
  using (true);

drop policy if exists "Users manage own reviews" on public.reviews;
create policy "Users manage own reviews"
  on public.reviews for all
  using (user_id = auth.uid() or auth.role() = 'service_role')
  with check (user_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "Instructor reads own payouts" on public.instructor_payouts;
create policy "Instructor reads own payouts"
  on public.instructor_payouts for select
  using (instructor_id = auth.uid() or auth.role() = 'service_role');

drop policy if exists "Admin manages all payouts" on public.instructor_payouts;
create policy "Admin manages all payouts"
  on public.instructor_payouts for all
  using (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  )
  with check (
    auth.role() = 'service_role'
    or exists (
      select 1
      from public.profiles
      where id = auth.uid()
        and is_admin = true
    )
  );

notify pgrst, 'reload schema';
