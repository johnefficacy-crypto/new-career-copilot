-- Migration 053: legacy scraping/notification setup retired
--
-- The prior script reintroduced deprecated triggers/functions:
--   - fn_notify_recruitment_opened + trg_notify_recruitment_opened
--   - fn_promote_approved_scrape + trg_promote_approved_scrape
-- and broad permissive policies that conflict with current governance.
--
-- These behaviors were intentionally disabled by canonical migrations:
--   - 016_disable_auto_promote.sql
--   - 022_drop_legacy_recruitment_open_trigger.sql
--   - 023_fix_service_role_policies.sql
--
-- To keep production migration replay safe and deterministic, this slot is a
-- no-op placeholder.

begin;
select '053_scraping_setup is intentionally a no-op (legacy setup retired).' as message;
commit;
