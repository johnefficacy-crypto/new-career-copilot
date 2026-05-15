-- 042_posts_requires_domicile.sql
--
-- Canonical storage for the per-post domicile requirement flag, end-to-end
-- per the post-#132 audit:
--   * Scraper extracts the claim from notification text into a candidate
--     value on the queue payload.
--   * Reviewer verifies via the existing `extracted_field_evidence` /
--     promotion_gate flow.
--   * Verified value lands here on canonical `posts` and is consumed by
--     the eligibility runner to populate `PostCriteria.requires_domicile`.
--
-- Default `false`: org_state by itself is metadata and does not imply a
-- domicile rule. Only an explicit `true` after admin verification should
-- cause the engine to enforce domicile.

alter table public.posts
    add column if not exists requires_domicile boolean not null default false;

comment on column public.posts.requires_domicile is
    'True when the canonical recruitment requires candidates to be a domicile of the recruiting state. Populated by the scraper extractor and verified by admin before promotion. Read by the eligibility runner into PostCriteria.requires_domicile.';
