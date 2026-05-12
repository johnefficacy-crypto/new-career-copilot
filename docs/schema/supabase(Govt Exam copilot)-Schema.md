-- WARNING: This schema is for context only and is not meant to be run.
-- Table order and constraints may not be valid for execution.

CREATE TABLE public.accountability_group_members (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL,
  user_id uuid NOT NULL,
  role text NOT NULL DEFAULT 'member'::text,
  joined_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT accountability_group_members_pkey PRIMARY KEY (id),
  CONSTRAINT accountability_group_members_group_id_fkey FOREIGN KEY (group_id) REFERENCES public.accountability_groups(id),
  CONSTRAINT accountability_group_members_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.accountability_groups (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  exam_tag text,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT accountability_groups_pkey PRIMARY KEY (id)
);
CREATE TABLE public.accountability_partner_requests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  requester_id uuid NOT NULL,
  partner_id uuid,
  message text,
  status text NOT NULL DEFAULT 'pending'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  responded_at timestamp with time zone,
  CONSTRAINT accountability_partner_requests_pkey PRIMARY KEY (id),
  CONSTRAINT accountability_partner_requests_requester_id_fkey FOREIGN KEY (requester_id) REFERENCES public.profiles(id),
  CONSTRAINT accountability_partner_requests_partner_id_fkey FOREIGN KEY (partner_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.admin_audit_logs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  actor_id uuid,
  actor_email text,
  action text NOT NULL,
  entity_type text NOT NULL,
  entity_id text,
  old_value jsonb,
  new_value jsonb,
  notes text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  admin_user_id uuid,
  before_payload jsonb,
  after_payload jsonb,
  metadata jsonb,
  CONSTRAINT admin_audit_logs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.admin_settings (
  key text NOT NULL,
  value text NOT NULL,
  updated_by uuid,
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT admin_settings_pkey PRIMARY KEY (key)
);
CREATE TABLE public.age_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  min_age integer,
  max_age integer,
  cutoff_date date,
  CONSTRAINT age_criteria_pkey PRIMARY KEY (id),
  CONSTRAINT age_criteria_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.age_relaxation_rules (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  reservation_category text,
  condition_key text,
  additional_years integer NOT NULL DEFAULT 0,
  max_age_cap integer,
  cumulative boolean NOT NULL DEFAULT false,
  source_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT age_relaxation_rules_pkey PRIMARY KEY (id),
  CONSTRAINT age_relaxation_rules_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.ai_action_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  action text NOT NULL UNIQUE,
  mode text NOT NULL DEFAULT 'require_approval'::text,
  reason text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_action_policies_pkey PRIMARY KEY (id)
);
CREATE TABLE public.ai_jobs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  job_type text NOT NULL,
  status text NOT NULL DEFAULT 'queued'::text,
  input jsonb NOT NULL DEFAULT '{}'::jsonb,
  output jsonb,
  error_message text,
  prompt_version_id uuid,
  model text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  started_at timestamp with time zone,
  finished_at timestamp with time zone,
  CONSTRAINT ai_jobs_pkey PRIMARY KEY (id),
  CONSTRAINT ai_jobs_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT ai_jobs_prompt_version_id_fkey FOREIGN KEY (prompt_version_id) REFERENCES public.ai_prompt_versions(id)
);
CREATE TABLE public.ai_prompt_versions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  prompt_key text NOT NULL,
  version integer NOT NULL DEFAULT 1,
  prompt_text text NOT NULL,
  model text,
  status text NOT NULL DEFAULT 'draft'::text,
  created_by uuid,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_prompt_versions_pkey PRIMARY KEY (id),
  CONSTRAINT ai_prompt_versions_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id)
);
CREATE TABLE public.ai_review_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  ai_job_id uuid,
  user_id uuid,
  review_status text NOT NULL DEFAULT 'pending'::text,
  risk_level text NOT NULL DEFAULT 'low'::text,
  reason text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT ai_review_queue_pkey PRIMARY KEY (id),
  CONSTRAINT ai_review_queue_ai_job_id_fkey FOREIGN KEY (ai_job_id) REFERENCES public.ai_jobs(id),
  CONSTRAINT ai_review_queue_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT ai_review_queue_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES auth.users(id)
);
CREATE TABLE public.alert_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  event_type text NOT NULL,
  recruitment_id uuid NOT NULL,
  diff_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  priority smallint NOT NULL DEFAULT 2 CHECK (priority >= 1 AND priority <= 5),
  fanout_status text NOT NULL DEFAULT 'pending'::text,
  fanout_started_at timestamp with time zone,
  fanout_completed_at timestamp with time zone,
  users_notified integer DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT alert_events_pkey PRIMARY KEY (id),
  CONSTRAINT alert_events_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT alert_events_diff_id_fkey FOREIGN KEY (diff_id) REFERENCES public.recruitment_field_diffs(id)
);
CREATE TABLE public.aspirant_certifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  certification_name text,
  issuing_body text,
  year_completed integer,
  is_active boolean DEFAULT true,
  CONSTRAINT aspirant_certifications_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_certifications_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_education (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  level text NOT NULL,
  degree text,
  stream text,
  institution text,
  university text,
  graduation_year integer,
  percentage numeric,
  cgpa numeric,
  is_completed boolean DEFAULT true,
  CONSTRAINT aspirant_education_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_education_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_exam_attempts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  exam_id uuid,
  attempts_used integer DEFAULT 0,
  CONSTRAINT aspirant_exam_attempts_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_exam_attempts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_exam_credentials (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  exam_key text NOT NULL,
  score numeric,
  percentile numeric,
  rank_text text,
  exam_year integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT aspirant_exam_credentials_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_exam_credentials_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_experience (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  sector text,
  role text,
  organization text,
  start_date date,
  end_date date,
  years_experience numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT aspirant_experience_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_experience_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_location (
  user_id uuid NOT NULL,
  state text NOT NULL,
  district text,
  is_rural boolean,
  domicile_certificate boolean DEFAULT false,
  CONSTRAINT aspirant_location_pkey PRIMARY KEY (user_id),
  CONSTRAINT aspirant_location_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid UNIQUE,
  preferred_sectors ARRAY,
  preferred_states ARRAY,
  willing_to_relocate boolean DEFAULT true,
  target_exams ARRAY,
  created_at timestamp with time zone DEFAULT now(),
  study_mode text,
  study_hours_per_day numeric,
  languages_known ARRAY NOT NULL DEFAULT '{}'::text[],
  preferred_language text,
  CONSTRAINT aspirant_preferences_pkey PRIMARY KEY (id),
  CONSTRAINT aspirant_preferences_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.aspirant_reservations (
  user_id uuid NOT NULL,
  category text NOT NULL,
  sub_category text,
  is_pwd boolean DEFAULT false,
  pwd_type text,
  is_ex_serviceman boolean DEFAULT false,
  is_jk_domicile boolean DEFAULT false,
  is_widow boolean DEFAULT false,
  age_relaxation_extra_years integer DEFAULT 0,
  disability_code text,
  family_income_annual numeric,
  ews_assets jsonb NOT NULL DEFAULT '{}'::jsonb,
  ews_certificate_available boolean,
  CONSTRAINT aspirant_reservations_pkey PRIMARY KEY (user_id),
  CONSTRAINT aspirant_reservations_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT aspirant_reservations_disability_code_fkey FOREIGN KEY (disability_code) REFERENCES public.disability_types(code)
);
CREATE TABLE public.attempt_limits (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  category text,
  max_attempts integer CHECK (max_attempts IS NULL OR max_attempts >= 0),
  CONSTRAINT attempt_limits_pkey PRIMARY KEY (id),
  CONSTRAINT attempt_limits_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.candidate_field_registry (
  field_key text NOT NULL,
  canonical_label text NOT NULL,
  user_facing_label text NOT NULL,
  data_type text NOT NULL CHECK (data_type = ANY (ARRAY['text'::text, 'number'::text, 'date'::text, 'boolean'::text, 'single_select'::text, 'multi_select'::text, 'json'::text])),
  profile_group text NOT NULL,
  profile_table text,
  profile_column text,
  question_template text,
  help_text text,
  allowed_values jsonb DEFAULT '[]'::jsonb,
  synonyms ARRAY DEFAULT '{}'::text[],
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT candidate_field_registry_pkey PRIMARY KEY (field_key)
);
CREATE TABLE public.certification_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  certification_name text,
  required boolean DEFAULT true,
  CONSTRAINT certification_criteria_pkey PRIMARY KEY (id),
  CONSTRAINT certification_criteria_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.certifications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  issuing_body text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT certifications_pkey PRIMARY KEY (id)
);
CREATE TABLE public.chat_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text,
  messages jsonb NOT NULL DEFAULT '[]'::jsonb,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT chat_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT chat_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.community_channels (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  name text NOT NULL,
  slug text NOT NULL,
  channel_type text NOT NULL DEFAULT 'discussion'::text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_channels_pkey PRIMARY KEY (id),
  CONSTRAINT community_channels_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.community_spaces(id)
);
CREATE TABLE public.community_replies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid NOT NULL,
  author_id uuid,
  body text NOT NULL,
  status text NOT NULL DEFAULT 'visible'::text,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_replies_pkey PRIMARY KEY (id),
  CONSTRAINT community_replies_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.community_threads(id),
  CONSTRAINT community_replies_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.community_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reporter_id uuid,
  thread_id uuid,
  reply_id uuid,
  reason text,
  status text NOT NULL DEFAULT 'pending'::text,
  moderator_id uuid,
  moderator_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_reports_pkey PRIMARY KEY (id),
  CONSTRAINT community_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id),
  CONSTRAINT community_reports_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.community_threads(id),
  CONSTRAINT community_reports_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES public.community_replies(id),
  CONSTRAINT community_reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.community_spaces (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_spaces_pkey PRIMARY KEY (id)
);
CREATE TABLE public.community_threads (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  space_id uuid NOT NULL,
  channel_id uuid NOT NULL,
  author_id uuid,
  title text NOT NULL,
  body text,
  status text NOT NULL DEFAULT 'visible'::text,
  is_locked boolean NOT NULL DEFAULT false,
  reply_count integer NOT NULL DEFAULT 0,
  vote_count integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_threads_pkey PRIMARY KEY (id),
  CONSTRAINT community_threads_space_id_fkey FOREIGN KEY (space_id) REFERENCES public.community_spaces(id),
  CONSTRAINT community_threads_channel_id_fkey FOREIGN KEY (channel_id) REFERENCES public.community_channels(id),
  CONSTRAINT community_threads_author_id_fkey FOREIGN KEY (author_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.community_votes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  thread_id uuid,
  reply_id uuid,
  user_id uuid NOT NULL,
  vote integer NOT NULL DEFAULT 1,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT community_votes_pkey PRIMARY KEY (id),
  CONSTRAINT community_votes_thread_id_fkey FOREIGN KEY (thread_id) REFERENCES public.community_threads(id),
  CONSTRAINT community_votes_reply_id_fkey FOREIGN KEY (reply_id) REFERENCES public.community_replies(id),
  CONSTRAINT community_votes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.course_sections (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  course_id uuid NOT NULL,
  title text NOT NULL,
  sort_order integer DEFAULT 0,
  order_index integer NOT NULL DEFAULT 0,
  is_free_preview boolean NOT NULL DEFAULT false,
  CONSTRAINT course_sections_pkey PRIMARY KEY (id),
  CONSTRAINT course_sections_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.courses (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text NOT NULL,
  description text,
  is_published boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  instructor_id uuid,
  slug text,
  short_description text,
  thumbnail_url text,
  preview_video_url text,
  price_inr integer NOT NULL DEFAULT 0,
  original_price_inr integer,
  level text NOT NULL DEFAULT 'all'::text CHECK (level = ANY (ARRAY['beginner'::text, 'intermediate'::text, 'advanced'::text, 'all'::text])),
  language text NOT NULL DEFAULT 'Hindi'::text,
  exam_tags ARRAY NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'draft'::text CHECK (status = ANY (ARRAY['draft'::text, 'published'::text, 'archived'::text])),
  total_lessons integer NOT NULL DEFAULT 0,
  total_duration_mins integer NOT NULL DEFAULT 0,
  avg_rating numeric,
  total_reviews integer NOT NULL DEFAULT 0,
  total_enrollments integer NOT NULL DEFAULT 0,
  commission_pct integer NOT NULL DEFAULT 20 CHECK (commission_pct >= 0 AND commission_pct <= 100),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT courses_pkey PRIMARY KEY (id),
  CONSTRAINT courses_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.disability_types (
  code text NOT NULL,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT disability_types_pkey PRIMARY KEY (code)
);
CREATE TABLE public.education_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  level text,
  degree text,
  stream text,
  min_percentage numeric,
  required boolean DEFAULT true,
  allow_higher_qualification boolean NOT NULL DEFAULT true,
  accepted_equivalent_qualifications jsonb NOT NULL DEFAULT '[]'::jsonb,
  raw_requirement_text text,
  min_qualification_level text,
  allowed_disciplines jsonb,
  CONSTRAINT education_criteria_pkey PRIMARY KEY (id),
  CONSTRAINT education_criteria_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.eligibility_recompute_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  recruitment_id uuid,
  post_id uuid,
  reason text,
  status text NOT NULL DEFAULT 'queued'::text,
  queued_at timestamp with time zone NOT NULL DEFAULT now(),
  claimed_at timestamp with time zone,
  processed_at timestamp with time zone,
  error_message text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  next_attempt_at timestamp with time zone,
  attempt_count integer NOT NULL DEFAULT 0,
  last_error text,
  CONSTRAINT eligibility_recompute_queue_pkey PRIMARY KEY (id)
);
CREATE TABLE public.eligibility_results (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid NOT NULL,
  post_id uuid,
  profile_hash text,
  is_eligible boolean NOT NULL DEFAULT false,
  reasons jsonb DEFAULT '[]'::jsonb,
  computed_at timestamp with time zone NOT NULL DEFAULT now(),
  is_conditional boolean DEFAULT false,
  fail_reasons ARRAY NOT NULL DEFAULT '{}'::text[],
  pass_reasons ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT eligibility_results_pkey PRIMARY KEY (id)
);
CREATE TABLE public.enrollments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  course_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text CHECK (status = ANY (ARRAY['active'::text, 'completed'::text, 'refunded'::text])),
  amount_paid_inr integer NOT NULL DEFAULT 0,
  razorpay_order_id text,
  razorpay_payment_id text,
  enrolled_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  CONSTRAINT enrollments_pkey PRIMARY KEY (id),
  CONSTRAINT enrollments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT enrollments_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.exam_patterns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  stage_name text NOT NULL,
  section_name text,
  question_count integer,
  marks integer,
  duration_minutes integer,
  negative_marking text,
  sort_order integer DEFAULT 0,
  source_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT exam_patterns_pkey PRIMARY KEY (id),
  CONSTRAINT exam_patterns_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.extracted_field_evidence (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scrape_queue_id uuid,
  document_id uuid,
  entity_type text DEFAULT 'other'::text CHECK (entity_type = ANY (ARRAY['recruitment'::text, 'post'::text, 'age_criteria'::text, 'education_criteria'::text, 'fee'::text, 'date'::text, 'vacancy'::text, 'other'::text])),
  entity_key text,
  field_name text NOT NULL,
  evidence_text text,
  reviewer_status text DEFAULT 'unverified'::text CHECK (reviewer_status = ANY (ARRAY['unverified'::text, 'verified'::text, 'rejected'::text, 'corrected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  reviewed_by uuid,
  reviewed_at timestamp with time zone,
  reviewer_notes text,
  extraction_method text DEFAULT 'manual'::text CHECK (extraction_method = ANY (ARRAY['rss_direct'::text, 'selector'::text, 'anthropic'::text, 'gemini'::text, 'manual'::text, 'system'::text])),
  extracted_value jsonb,
  source_page integer,
  source_bbox jsonb,
  confidence numeric,
  alignment_status text,
  page_number integer,
  char_start integer,
  char_end integer,
  model text,
  corrected_value jsonb,
  extraction_provider text,
  CONSTRAINT extracted_field_evidence_pkey PRIMARY KEY (id),
  CONSTRAINT extracted_field_evidence_reviewed_by_fkey FOREIGN KEY (reviewed_by) REFERENCES public.profiles(id)
);
CREATE TABLE public.form_submissions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  recruitment_id uuid,
  post_id uuid,
  form_type text,
  status text NOT NULL DEFAULT 'draft'::text,
  application_number text,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  submitted_at timestamp with time zone DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT form_submissions_pkey PRIMARY KEY (id),
  CONSTRAINT form_submissions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT form_submissions_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT form_submissions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.forum_categories (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  description text,
  slug text,
  exam_tag text,
  post_count integer NOT NULL DEFAULT 0,
  icon text,
  color text,
  order_index integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT forum_categories_pkey PRIMARY KEY (id)
);
CREATE TABLE public.forum_comment_upvotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  comment_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_comment_upvotes_pkey PRIMARY KEY (id),
  CONSTRAINT forum_comment_upvotes_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.forum_comments(id),
  CONSTRAINT forum_comment_upvotes_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.forum_comments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid,
  body text NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  upvote_count integer NOT NULL DEFAULT 0,
  is_accepted boolean NOT NULL DEFAULT false,
  status text NOT NULL DEFAULT 'visible'::text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_comments_pkey PRIMARY KEY (id),
  CONSTRAINT forum_comments_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT forum_comments_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.forum_post_upvotes (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_post_upvotes_pkey PRIMARY KEY (id)
);
CREATE TABLE public.forum_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  category_id uuid,
  user_id uuid,
  title text NOT NULL,
  body text,
  created_at timestamp with time zone DEFAULT now(),
  slug text,
  reply_count integer NOT NULL DEFAULT 0,
  upvote_count integer NOT NULL DEFAULT 0,
  is_locked boolean NOT NULL DEFAULT false,
  is_pinned boolean NOT NULL DEFAULT false,
  exam_tags ARRAY NOT NULL DEFAULT '{}'::text[],
  tags ARRAY NOT NULL DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'visible'::text,
  search_vector tsvector,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_posts_pkey PRIMARY KEY (id),
  CONSTRAINT forum_posts_category_id_fkey FOREIGN KEY (category_id) REFERENCES public.forum_categories(id),
  CONSTRAINT forum_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.forum_reports (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  reporter_id uuid NOT NULL,
  target_type text NOT NULL,
  post_id uuid,
  comment_id uuid,
  reason text NOT NULL,
  severity text NOT NULL DEFAULT 'p2_spam_noise'::text,
  status text NOT NULL DEFAULT 'open'::text,
  moderator_id uuid,
  moderator_notes text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  resolved_at timestamp with time zone,
  CONSTRAINT forum_reports_pkey PRIMARY KEY (id),
  CONSTRAINT forum_reports_reporter_id_fkey FOREIGN KEY (reporter_id) REFERENCES public.profiles(id),
  CONSTRAINT forum_reports_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT forum_reports_comment_id_fkey FOREIGN KEY (comment_id) REFERENCES public.forum_comments(id),
  CONSTRAINT forum_reports_moderator_id_fkey FOREIGN KEY (moderator_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.forum_reputation (
  user_id uuid NOT NULL,
  points integer NOT NULL DEFAULT 0,
  posts_count integer NOT NULL DEFAULT 0,
  comments_count integer NOT NULL DEFAULT 0,
  upvotes_received integer NOT NULL DEFAULT 0,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_reputation_pkey PRIMARY KEY (user_id),
  CONSTRAINT forum_reputation_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.forum_saved_posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  user_id uuid NOT NULL,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT forum_saved_posts_pkey PRIMARY KEY (id),
  CONSTRAINT forum_saved_posts_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.forum_posts(id),
  CONSTRAINT forum_saved_posts_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.funnel_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  funnel_session_id uuid,
  user_id uuid,
  event_name text NOT NULL,
  event_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT funnel_events_pkey PRIMARY KEY (id),
  CONSTRAINT funnel_events_funnel_session_id_fkey FOREIGN KEY (funnel_session_id) REFERENCES public.funnel_sessions(id),
  CONSTRAINT funnel_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.funnel_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  anonymous_id text,
  recruitment_id uuid,
  post_id uuid,
  intent text NOT NULL,
  source text,
  utm jsonb DEFAULT '{}'::jsonb,
  status text NOT NULL DEFAULT 'started'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT funnel_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT funnel_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT funnel_sessions_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT funnel_sessions_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.instructor_payouts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  instructor_id uuid NOT NULL,
  amount_inr integer NOT NULL,
  status text NOT NULL DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['pending'::text, 'processing'::text, 'paid'::text, 'failed'::text])),
  period_start date NOT NULL,
  period_end date NOT NULL,
  razorpay_payout_id text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT instructor_payouts_pkey PRIMARY KEY (id),
  CONSTRAINT instructor_payouts_instructor_id_fkey FOREIGN KEY (instructor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.knowledge_base_university_thresholds (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  university_name text NOT NULL,
  qualification_level text,
  first_class_min_percentage numeric,
  distinction_min_percentage numeric,
  source_url text,
  verification_status text DEFAULT 'unverified'::text,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT knowledge_base_university_thresholds_pkey PRIMARY KEY (id)
);
CREATE TABLE public.lesson_progress (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  lesson_id uuid NOT NULL,
  course_id uuid NOT NULL,
  completed boolean NOT NULL DEFAULT false,
  completed_at timestamp with time zone,
  watch_seconds integer NOT NULL DEFAULT 0,
  CONSTRAINT lesson_progress_pkey PRIMARY KEY (id),
  CONSTRAINT lesson_progress_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT lesson_progress_lesson_id_fkey FOREIGN KEY (lesson_id) REFERENCES public.lessons(id),
  CONSTRAINT lesson_progress_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id)
);
CREATE TABLE public.lessons (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL,
  title text NOT NULL,
  content text,
  sort_order integer DEFAULT 0,
  type text NOT NULL DEFAULT 'video'::text CHECK (type = ANY (ARRAY['video'::text, 'pdf'::text, 'text'::text, 'quiz'::text])),
  order_index integer NOT NULL DEFAULT 0,
  duration_mins integer,
  is_free_preview boolean NOT NULL DEFAULT false,
  content_url text,
  content_text text,
  CONSTRAINT lessons_pkey PRIMARY KEY (id),
  CONSTRAINT lessons_section_id_fkey FOREIGN KEY (section_id) REFERENCES public.course_sections(id)
);
CREATE TABLE public.mentor_bookings (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  mentor_id uuid,
  slot timestamp with time zone,
  agenda text,
  status text NOT NULL DEFAULT 'requested'::text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT mentor_bookings_pkey PRIMARY KEY (id),
  CONSTRAINT mentor_bookings_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT mentor_bookings_mentor_id_fkey FOREIGN KEY (mentor_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.mock_subject_breakdowns (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  mock_test_id uuid NOT NULL,
  subject text NOT NULL,
  total_questions integer,
  correct_answers integer,
  wrong_answers integer,
  marks numeric,
  accuracy numeric,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mock_subject_breakdowns_pkey PRIMARY KEY (id),
  CONSTRAINT mock_subject_breakdowns_mock_test_id_fkey FOREIGN KEY (mock_test_id) REFERENCES public.mock_tests(id)
);
CREATE TABLE public.mock_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  title text,
  duration_minutes integer,
  total_questions integer,
  created_at timestamp with time zone DEFAULT now(),
  user_id uuid,
  attempted_at timestamp with time zone DEFAULT now(),
  plan_id uuid,
  exam_name text,
  test_name text,
  total_marks integer,
  scored_marks numeric,
  correct_answers integer,
  wrong_answers integer,
  duration_mins integer,
  notes text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT mock_tests_pkey PRIMARY KEY (id),
  CONSTRAINT mock_tests_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT mock_tests_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.study_plans(id)
);
CREATE TABLE public.notification_alerts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid,
  alert_event_id uuid,
  alert_type text NOT NULL,
  priority smallint DEFAULT 2,
  is_read boolean NOT NULL DEFAULT false,
  sent_at timestamp with time zone NOT NULL DEFAULT now(),
  read_at timestamp with time zone,
  explanation jsonb DEFAULT '{}'::jsonb,
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamp with time zone,
  delivery_error text,
  source text,
  source_stage text,
  dedupe_key text,
  generated_at timestamp with time zone,
  title text,
  body text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_alerts_pkey PRIMARY KEY (id),
  CONSTRAINT fk_alerts_recruitment FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id)
);
CREATE TABLE public.notification_documents (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scrape_queue_id uuid,
  file_url text,
  document_type text NOT NULL CHECK (document_type = ANY (ARRAY['html'::text, 'pdf'::text, 'rss'::text, 'json'::text, 'unknown'::text])),
  created_at timestamp with time zone DEFAULT now(),
  source_id uuid,
  storage_path text,
  content_hash text NOT NULL,
  scrape_run_id uuid,
  source_url text NOT NULL,
  final_url text,
  fetched_at timestamp with time zone NOT NULL DEFAULT now(),
  http_status integer,
  etag text,
  last_modified text,
  raw_text text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT notification_documents_pkey PRIMARY KEY (id),
  CONSTRAINT notification_documents_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id),
  CONSTRAINT notification_documents_scrape_run_id_fkey FOREIGN KEY (scrape_run_id) REFERENCES public.scrape_runs(id)
);
CREATE TABLE public.notification_generation_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  status text DEFAULT 'running'::text,
  stats jsonb DEFAULT '{}'::jsonb,
  triggered_by_user_id uuid,
  scope text,
  dry_run boolean NOT NULL DEFAULT true,
  run_limit integer,
  candidates_count integer NOT NULL DEFAULT 0,
  created_count integer NOT NULL DEFAULT 0,
  skipped_count integer NOT NULL DEFAULT 0,
  by_type jsonb NOT NULL DEFAULT '{}'::jsonb,
  finished_at timestamp with time zone,
  error_message text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT notification_generation_runs_pkey PRIMARY KEY (id),
  CONSTRAINT notification_generation_runs_triggered_by_user_id_fkey FOREIGN KEY (triggered_by_user_id) REFERENCES auth.users(id)
);
CREATE TABLE public.notification_group_state (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid NOT NULL,
  last_event_at timestamp with time zone,
  state jsonb DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT notification_group_state_pkey PRIMARY KEY (id)
);
CREATE TABLE public.notification_preferences (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  in_app_enabled boolean NOT NULL DEFAULT true,
  email_enabled boolean NOT NULL DEFAULT false,
  whatsapp_enabled boolean NOT NULL DEFAULT false,
  telegram_enabled boolean NOT NULL DEFAULT false,
  digest_frequency text DEFAULT 'instant'::text,
  updated_at timestamp with time zone DEFAULT now(),
  in_app_types_disabled ARRAY NOT NULL DEFAULT '{}'::text[],
  email_types_disabled ARRAY NOT NULL DEFAULT '{}'::text[],
  event_types_muted ARRAY NOT NULL DEFAULT '{}'::text[],
  digest_preference text NOT NULL DEFAULT 'off'::text,
  quiet_hours_start integer,
  quiet_hours_end integer,
  min_priority_in_app text NOT NULL DEFAULT 'low'::text,
  min_priority_email text NOT NULL DEFAULT 'normal'::text,
  deadline_reminder_windows ARRAY NOT NULL DEFAULT ARRAY['48h'::text, '24h'::text, '6h'::text],
  CONSTRAINT notification_preferences_pkey PRIMARY KEY (id)
);
CREATE TABLE public.onboarding_answers (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  session_id uuid,
  user_id uuid,
  field_key text NOT NULL,
  answer_value jsonb,
  normalized_value jsonb,
  source text NOT NULL DEFAULT 'guided_chat'::text,
  confidence numeric,
  needs_review boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT onboarding_answers_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_answers_session_id_fkey FOREIGN KEY (session_id) REFERENCES public.onboarding_sessions(id),
  CONSTRAINT onboarding_answers_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT onboarding_answers_field_key_fkey FOREIGN KEY (field_key) REFERENCES public.candidate_field_registry(field_key)
);
CREATE TABLE public.onboarding_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  funnel_session_id uuid,
  mode text NOT NULL DEFAULT 'chat'::text,
  current_field_key text,
  missing_fields ARRAY DEFAULT '{}'::text[],
  completed_fields ARRAY DEFAULT '{}'::text[],
  status text NOT NULL DEFAULT 'active'::text,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT onboarding_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT onboarding_sessions_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id),
  CONSTRAINT onboarding_sessions_funnel_session_id_fkey FOREIGN KEY (funnel_session_id) REFERENCES public.funnel_sessions(id),
  CONSTRAINT onboarding_sessions_current_field_key_fkey FOREIGN KEY (current_field_key) REFERENCES public.candidate_field_registry(field_key)
);
CREATE TABLE public.organizations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  name text NOT NULL,
  type text,
  state text,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  website_url text,
  official_domain text,
  is_verified boolean NOT NULL DEFAULT false,
  trust_tier text NOT NULL DEFAULT 'unknown'::text CHECK (trust_tier = ANY (ARRAY['verified'::text, 'trusted'::text, 'unknown'::text, 'unverified'::text])),
  verification_notes text,
  verified_at timestamp with time zone,
  verified_by uuid,
  CONSTRAINT organizations_pkey PRIMARY KEY (id),
  CONSTRAINT organizations_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id)
);
CREATE TABLE public.payment_history (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  subscription_id uuid,
  amount numeric NOT NULL DEFAULT 0,
  currency text DEFAULT 'INR'::text,
  provider text,
  provider_payment_id text,
  status text DEFAULT 'pending'::text CHECK (status = ANY (ARRAY['created'::text, 'attempted'::text, 'captured'::text, 'failed'::text, 'refunded'::text, 'pending'::text])),
  paid_at timestamp with time zone,
  created_at timestamp with time zone DEFAULT now(),
  plan_id text,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_inr integer,
  method text,
  source text NOT NULL DEFAULT 'checkout'::text,
  event text,
  raw_event jsonb,
  CONSTRAINT payment_history_pkey PRIMARY KEY (id),
  CONSTRAINT payment_history_subscription_id_fkey FOREIGN KEY (subscription_id) REFERENCES public.user_subscriptions(id),
  CONSTRAINT payment_history_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.physical_requirement_types (
  code text NOT NULL,
  description text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT physical_requirement_types_pkey PRIMARY KEY (code)
);
CREATE TABLE public.post_disability_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  disability_code text,
  physical_requirement_code text,
  suitable boolean NOT NULL DEFAULT true,
  source_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT post_disability_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT post_disability_requirements_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT post_disability_requirements_disability_code_fkey FOREIGN KEY (disability_code) REFERENCES public.disability_types(code),
  CONSTRAINT post_disability_requirements_physical_requirement_code_fkey FOREIGN KEY (physical_requirement_code) REFERENCES public.physical_requirement_types(code)
);
CREATE TABLE public.posts (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruitment_id uuid,
  post_name text NOT NULL,
  post_code text,
  created_at timestamp with time zone DEFAULT now(),
  group_type text,
  pay_level text,
  job_type text,
  recruitment_unit_id uuid,
  language_requirements ARRAY NOT NULL DEFAULT '{}'::text[],
  CONSTRAINT posts_pkey PRIMARY KEY (id),
  CONSTRAINT posts_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT posts_recruitment_unit_id_fkey FOREIGN KEY (recruitment_unit_id) REFERENCES public.recruitment_units(id)
);
CREATE TABLE public.profiles (
  id uuid NOT NULL,
  email text,
  full_name text,
  phone text,
  state text,
  onboarding_completed boolean NOT NULL DEFAULT false,
  is_admin boolean NOT NULL DEFAULT false,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  gender text,
  category text,
  pwbd_status text DEFAULT 'none'::text,
  domicile_state text,
  nationality text,
  ex_serviceman boolean DEFAULT false,
  govt_employee boolean DEFAULT false,
  dob date,
  date_of_birth date,
  service_years integer,
  graduation_year integer,
  target_type text,
  target_exam text,
  career_stage text,
  career_goal text,
  onboarding_step integer DEFAULT 0,
  plan_id text,
  avatar_url text,
  is_instructor boolean NOT NULL DEFAULT false,
  instructor_bio text,
  CONSTRAINT profiles_pkey PRIMARY KEY (id)
);
CREATE TABLE public.recruitment_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruitment_id uuid NOT NULL,
  event_type text NOT NULL,
  event_date date,
  source_id uuid,
  scrape_queue_id uuid,
  payload jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_events_pkey PRIMARY KEY (id),
  CONSTRAINT recruitment_events_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT recruitment_events_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id),
  CONSTRAINT recruitment_events_scrape_queue_id_fkey FOREIGN KEY (scrape_queue_id) REFERENCES public.scrape_queue(id)
);
CREATE TABLE public.recruitment_field_diffs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruitment_id uuid,
  diff_payload jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recruitment_field_diffs_pkey PRIMARY KEY (id)
);
CREATE TABLE public.recruitment_question_requirements (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruitment_id uuid NOT NULL,
  post_id uuid,
  field_key text NOT NULL,
  requirement_type text NOT NULL,
  required_for text NOT NULL DEFAULT 'eligibility'::text,
  priority integer DEFAULT 100,
  question_text text NOT NULL,
  help_text text,
  options jsonb DEFAULT '[]'::jsonb,
  rule_operator text,
  rule_value jsonb DEFAULT '{}'::jsonb,
  applies_when jsonb DEFAULT '{}'::jsonb,
  is_knockout boolean DEFAULT false,
  evidence_id uuid,
  reviewer_status text NOT NULL DEFAULT 'pending'::text CHECK (reviewer_status = ANY (ARRAY['pending'::text, 'verified'::text, 'rejected'::text])),
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT recruitment_question_requirements_pkey PRIMARY KEY (id),
  CONSTRAINT recruitment_question_requirements_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT recruitment_question_requirements_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id),
  CONSTRAINT recruitment_question_requirements_field_key_fkey FOREIGN KEY (field_key) REFERENCES public.candidate_field_registry(field_key),
  CONSTRAINT recruitment_question_requirements_evidence_id_fkey FOREIGN KEY (evidence_id) REFERENCES public.extracted_field_evidence(id)
);
CREATE TABLE public.recruitment_units (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  recruitment_id uuid NOT NULL,
  organization_id uuid NOT NULL,
  unit_code text,
  unit_name text,
  location_state text,
  location_city text,
  preference_order integer,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT recruitment_units_pkey PRIMARY KEY (id),
  CONSTRAINT recruitment_units_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT recruitment_units_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id)
);
CREATE TABLE public.recruitments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  organization_id uuid,
  name text NOT NULL,
  status text DEFAULT 'active'::text,
  publish_status text DEFAULT 'published'::text,
  apply_start_date date,
  apply_end_date date,
  notification_date date,
  year integer,
  total_vacancies integer,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  slug text,
  official_notification_url text,
  official_apply_url text,
  source_pdf_url text,
  source_id uuid,
  published_by uuid,
  published_at timestamp with time zone,
  review_notes text,
  CONSTRAINT recruitments_pkey PRIMARY KEY (id),
  CONSTRAINT recruitments_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT recruitments_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id),
  CONSTRAINT recruitments_published_by_fkey FOREIGN KEY (published_by) REFERENCES auth.users(id)
);
CREATE TABLE public.reviews (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  course_id uuid,
  rating integer CHECK (rating >= 1 AND rating <= 5),
  comment text,
  created_at timestamp with time zone DEFAULT now(),
  body text,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT reviews_pkey PRIMARY KEY (id),
  CONSTRAINT reviews_course_id_fkey FOREIGN KEY (course_id) REFERENCES public.courses(id),
  CONSTRAINT reviews_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.salary_details (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  pay_level text,
  basic_pay_min numeric,
  basic_pay_max numeric,
  in_hand_estimate numeric,
  CONSTRAINT salary_details_pkey PRIMARY KEY (id)
);
CREATE TABLE public.scrape_queue (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scrape_run_id uuid,
  source_url text NOT NULL,
  source_name text,
  status text NOT NULL DEFAULT 'queued'::text,
  confidence_score numeric,
  data_quality_score numeric,
  extracted_data jsonb DEFAULT '{}'::jsonb,
  scraped_at timestamp with time zone,
  reviewed_at timestamp with time zone,
  reviewer_notes text,
  notification_document_id uuid,
  extraction_provider text,
  extraction_model text,
  extraction_prompt_version text,
  extraction_status text,
  evidence_required boolean DEFAULT false,
  recruitment_id uuid,
  source_id uuid,
  raw_html text,
  raw_payload jsonb,
  extracted_fields jsonb,
  duplicate_of uuid,
  reviewer_id uuid,
  field_evidence jsonb,
  official_source_resolved boolean NOT NULL DEFAULT false,
  official_source_host text,
  promoted_recruitment_id uuid,
  priority_score integer NOT NULL DEFAULT 0,
  priority_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  promoted_status text,
  promoted_at timestamp with time zone,
  warnings jsonb,
  duplicate_candidates jsonb,
  error_message text,
  CONSTRAINT scrape_queue_pkey PRIMARY KEY (id),
  CONSTRAINT scrape_queue_source_id_fkey FOREIGN KEY (source_id) REFERENCES public.source_registry(id),
  CONSTRAINT scrape_queue_duplicate_of_fkey FOREIGN KEY (duplicate_of) REFERENCES public.scrape_queue(id),
  CONSTRAINT scrape_queue_reviewer_id_fkey FOREIGN KEY (reviewer_id) REFERENCES auth.users(id),
  CONSTRAINT scrape_queue_promoted_recruitment_id_fkey FOREIGN KEY (promoted_recruitment_id) REFERENCES public.recruitments(id)
);
CREATE TABLE public.scrape_runs (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_id uuid,
  status text DEFAULT 'running'::text,
  started_at timestamp with time zone DEFAULT now(),
  completed_at timestamp with time zone,
  triggered_by text,
  triggered_by_user uuid,
  finished_at timestamp with time zone,
  sources_checked integer NOT NULL DEFAULT 0,
  items_found integer NOT NULL DEFAULT 0,
  items_new integer NOT NULL DEFAULT 0,
  items_duplicate integer NOT NULL DEFAULT 0,
  error_log jsonb NOT NULL DEFAULT '[]'::jsonb,
  providers_health jsonb,
  function_version text,
  CONSTRAINT scrape_runs_pkey PRIMARY KEY (id),
  CONSTRAINT scrape_runs_triggered_by_user_fkey FOREIGN KEY (triggered_by_user) REFERENCES public.profiles(id)
);
CREATE TABLE public.scrape_sources (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_registry_id uuid,
  source_name text,
  source_url text NOT NULL,
  is_active boolean DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT scrape_sources_pkey PRIMARY KEY (id)
);
CREATE TABLE public.skill_tests (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  test_type text NOT NULL,
  speed_requirement text,
  duration_minutes integer,
  evaluation_formula text,
  source_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT skill_tests_pkey PRIMARY KEY (id),
  CONSTRAINT skill_tests_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.source_observations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  scrape_run_id uuid,
  source_url text NOT NULL,
  fingerprint text,
  status text,
  canonical_id uuid,
  created_at timestamp with time zone DEFAULT now(),
  CONSTRAINT source_observations_pkey PRIMARY KEY (id)
);
CREATE TABLE public.source_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  source_name text NOT NULL,
  source_url text,
  source_type text,
  state text,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamp with time zone DEFAULT now(),
  intelligence_policy jsonb NOT NULL DEFAULT '{}'::jsonb,
  crawl_budget_per_day integer,
  priority_score integer NOT NULL DEFAULT 0,
  priority_reason jsonb NOT NULL DEFAULT '{}'::jsonb,
  last_policy_decision text,
  policy_updated_at timestamp with time zone,
  organization_id uuid,
  short_code text,
  category text,
  jurisdiction text,
  parent_org text,
  official_url text,
  notification_url text,
  rss_url text,
  api_url text,
  pdf_bulletin_url text,
  adapter_type text,
  parser_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  scrape_interval_hours integer,
  tier integer,
  trust_score numeric,
  anti_bot_risk text,
  requires_playwright boolean NOT NULL DEFAULT false,
  requires_login boolean NOT NULL DEFAULT false,
  has_captcha boolean NOT NULL DEFAULT false,
  pdf_only boolean NOT NULL DEFAULT false,
  is_verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'needs_review'::text,
  verified_by uuid,
  verified_at timestamp with time zone,
  last_scraped_at timestamp with time zone,
  last_success_at timestamp with time zone,
  consecutive_fails integer NOT NULL DEFAULT 0,
  last_error text,
  notes text,
  org_state text,
  insecure_tls boolean NOT NULL DEFAULT false,
  selectors jsonb,
  requires_official_confirmation boolean NOT NULL DEFAULT false,
  last_changed_at timestamp with time zone,
  added_by text,
  updated_at timestamp with time zone DEFAULT now(),
  is_official_source boolean NOT NULL DEFAULT false,
  can_publish_directly boolean NOT NULL DEFAULT false,
  discovery_only boolean NOT NULL DEFAULT false,
  scrape_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  trust_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  adapter_config jsonb NOT NULL DEFAULT '{}'::jsonb,
  CONSTRAINT source_registry_pkey PRIMARY KEY (id),
  CONSTRAINT source_registry_organization_id_fkey FOREIGN KEY (organization_id) REFERENCES public.organizations(id),
  CONSTRAINT source_registry_verified_by_fkey FOREIGN KEY (verified_by) REFERENCES auth.users(id)
);
CREATE TABLE public.study_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'active'::text,
  target_exam text,
  start_date date,
  end_date date,
  weekly_hours_goal numeric,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.study_sessions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid,
  user_id uuid NOT NULL,
  starts_at timestamp with time zone,
  ends_at timestamp with time zone,
  duration_mins integer,
  subject text,
  topic text,
  started_at timestamp with time zone,
  ended_at timestamp with time zone,
  session_type text,
  notes text,
  CONSTRAINT study_sessions_pkey PRIMARY KEY (id),
  CONSTRAINT study_sessions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.study_plans(id)
);
CREATE TABLE public.study_tasks (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_id uuid,
  user_id uuid NOT NULL,
  title text NOT NULL,
  status text DEFAULT 'pending'::text,
  due_at timestamp with time zone,
  day_label text,
  subject text,
  topic text,
  microtopic text,
  task_type text,
  duration_mins integer,
  planned_minutes integer,
  scheduled_date date,
  completed_at timestamp with time zone,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT study_tasks_pkey PRIMARY KEY (id),
  CONSTRAINT study_tasks_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.study_plans(id)
);
CREATE TABLE public.subscription_plans (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  plan_code text UNIQUE,
  name text NOT NULL,
  price numeric NOT NULL DEFAULT 0,
  billing_period text,
  is_active boolean DEFAULT true,
  description text,
  price_inr integer,
  currency text NOT NULL DEFAULT 'INR'::text,
  interval text NOT NULL DEFAULT 'monthly'::text CHECK ("interval" = ANY (ARRAY['monthly'::text, 'annual'::text, 'one_time'::text, 'free'::text])),
  features jsonb NOT NULL DEFAULT '[]'::jsonb,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT subscription_plans_pkey PRIMARY KEY (id)
);
CREATE TABLE public.tracked_recruitments (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid NOT NULL,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT tracked_recruitments_pkey PRIMARY KEY (id)
);
CREATE TABLE public.user_events (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid,
  event_name text NOT NULL,
  event_type text,
  recruitment_id uuid,
  post_id uuid,
  exam_id text,
  source text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  occurred_at timestamp with time zone NOT NULL DEFAULT now(),
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_events_pkey PRIMARY KEY (id),
  CONSTRAINT user_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_events_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id),
  CONSTRAINT user_events_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.user_recruitment_applications (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid NOT NULL,
  post_id uuid,
  application_status text,
  applied_at timestamp with time zone,
  notes text,
  created_at timestamp with time zone DEFAULT now(),
  status text DEFAULT 'started'::text,
  submitted_at timestamp with time zone,
  clicked_apply_at timestamp with time zone,
  application_number text,
  fee_paid boolean DEFAULT false,
  fee_amount numeric,
  documents_pending jsonb DEFAULT '[]'::jsonb,
  updated_at timestamp with time zone DEFAULT now(),
  CONSTRAINT user_recruitment_applications_pkey PRIMARY KEY (id),
  CONSTRAINT fk_user_apps_recruitment FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id)
);
CREATE TABLE public.user_recruitment_feedback (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  recruitment_id uuid,
  rating integer,
  feedback text,
  feedback_type text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_recruitment_feedback_pkey PRIMARY KEY (id),
  CONSTRAINT user_recruitment_feedback_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id),
  CONSTRAINT user_recruitment_feedback_recruitment_id_fkey FOREIGN KEY (recruitment_id) REFERENCES public.recruitments(id)
);
CREATE TABLE public.user_subscriptions (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  plan_id uuid NOT NULL,
  status text NOT NULL DEFAULT 'active'::text,
  starts_at timestamp with time zone DEFAULT now(),
  ends_at timestamp with time zone,
  razorpay_order_id text,
  razorpay_payment_id text,
  amount_paid_inr integer NOT NULL DEFAULT 0,
  currency text NOT NULL DEFAULT 'INR'::text,
  current_period_start timestamp with time zone,
  current_period_end timestamp with time zone,
  cancelled_at timestamp with time zone,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT user_subscriptions_pkey PRIMARY KEY (id),
  CONSTRAINT user_subscriptions_plan_id_fkey FOREIGN KEY (plan_id) REFERENCES public.subscription_plans(id),
  CONSTRAINT user_subscriptions_user_id_fkey FOREIGN KEY (user_id) REFERENCES public.profiles(id)
);
CREATE TABLE public.vacancies (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid,
  category text,
  vacancy_count integer NOT NULL DEFAULT 0 CHECK (vacancy_count >= 0),
  CONSTRAINT vacancies_pkey PRIMARY KEY (id),
  CONSTRAINT vacancies_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);
CREATE TABLE public.vacancy_reservations (
  id uuid NOT NULL DEFAULT gen_random_uuid(),
  post_id uuid NOT NULL,
  vertical_category text,
  horizontal_category text,
  vacancy_count integer NOT NULL DEFAULT 0 CHECK (vacancy_count >= 0),
  is_backlog boolean NOT NULL DEFAULT false,
  source_note text,
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  CONSTRAINT vacancy_reservations_pkey PRIMARY KEY (id),
  CONSTRAINT vacancy_reservations_post_id_fkey FOREIGN KEY (post_id) REFERENCES public.posts(id)
);