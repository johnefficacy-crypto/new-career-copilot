-- Migration 045: canonical fees + selection-process tables per post.
--
-- PR #127 plumbed ``ExtractedPost.fees`` and ``selection_process`` into
-- the queue payload; PR #136 ("rich post fields") wrote exam_patterns /
-- skill_tests / age_relaxation_rules to canonical storage but left fees
-- and selection_process in scrape_queue.extracted_data._meta only.
-- Eligibility + admit-card UI need them shaped per-post.
--
-- Shape decisions (intentional):
--   * post_fees is one row per category (general/obc/sc/st/ews/pwbd/etc.)
--     so admin can show a category-vs-amount table; currency stored
--     alongside in case of multi-currency notices (rare in IN govt but
--     cheap to model).
--   * post_selection_stages is one row per stage_label with sort_order
--     so admin gets a stable ordered list ("tier_1 -> tier_2 -> interview").

begin;

create table if not exists public.post_fees (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  category     text not null,
  amount       numeric not null check (amount >= 0),
  currency     text not null default 'INR',
  source_note  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_post_fees_post on public.post_fees(post_id);

create table if not exists public.post_selection_stages (
  id           uuid primary key default gen_random_uuid(),
  post_id      uuid not null references public.posts(id) on delete cascade,
  stage_label  text not null,
  sort_order   integer not null default 0,
  source_note  text,
  created_at   timestamptz not null default now()
);

create index if not exists idx_post_selection_stages_post
  on public.post_selection_stages(post_id);

commit;

notify pgrst, 'reload schema';
