-- 119_policy_updates_publish_status.sql
-- PR3 precondition: aspirant-facing policy updates feed needs an explicit
-- publish gate. The existing reviewer_status / source_type axes are
-- admin-workflow concerns; the user-facing feed must read a single
-- "published" boolean equivalent to keep the API contract simple and
-- avoid coupling the read path to internal review state.
--
-- We add publish_status with the same vocabulary used on recruitments
-- (draft/needs_review/published/etc as free text). Default 'draft' so a
-- new row never reaches aspirants until an admin promotes it.
--
-- Backfill: a row that is already verified AND came from an official
-- source is treated as published (that is the long-standing gate the
-- planner reads); everything else stays draft until reviewed.

alter table public.exam_policy_updates
  add column if not exists publish_status text not null default 'draft';

update public.exam_policy_updates
   set publish_status = 'published'
 where publish_status = 'draft'
   and reviewer_status = 'verified'
   and source_type = 'official';

create index if not exists idx_exam_policy_updates_publish_status
  on public.exam_policy_updates(publish_status, published_at desc);

notify pgrst, 'reload schema';
