-- migration 033: recruitment publish workflow
-- Adds a separate publish_status column distinct from lifecycle status
-- (upcoming/open/closed). Publish workflow: draft → needs_review → verified → published.
--
-- Lifecycle status = where is the recruitment in the real world?
-- Publish status   = has this data been approved for user-facing display?

create type public.publish_status as enum (
  'draft',
  'needs_review',
  'verified',
  'published',
  'archived',
  'withdrawn'
);

alter table public.recruitments
  add column if not exists publish_status public.publish_status not null default 'draft',
  add column if not exists published_at   timestamptz,
  add column if not exists published_by   uuid references auth.users(id) on delete set null,
  add column if not exists review_notes   text;

-- Index for admin workflow queries
create index if not exists idx_recruitments_publish_status
  on public.recruitments(publish_status);

-- Only show published recruitments to regular users by default
-- (RLS already restricts; this ensures dashboard queries can filter easily)
comment on column public.recruitments.publish_status is
  'Workflow gate: draft → needs_review → verified → published. Separate from lifecycle status.';
