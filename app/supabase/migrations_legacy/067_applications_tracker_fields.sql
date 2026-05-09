alter table if exists public.user_recruitment_applications
  add column if not exists fee_amount numeric,
  add column if not exists documents_pending jsonb default '[]'::jsonb,
  add column if not exists clicked_apply_at timestamptz,
  add column if not exists application_number text,
  add column if not exists fee_paid boolean,
  add column if not exists notes text,
  add column if not exists submitted_at timestamptz;
