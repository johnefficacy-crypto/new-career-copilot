-- Migration 042: deprecated seed payload placeholder
--
-- This repository previously stored large environment/demo seed SQL in this
-- migration slot. Running that payload in production is unsafe because it
-- creates auth users, profile records, and demo business data.
--
-- Production policy:
--   - schema evolution belongs in migrations
--   - environment/demo seed data belongs outside migrations
--
-- Historical seed content has been removed from migration execution flow.
-- Keep this no-op file to preserve migration ordering/history.

begin;
select '042_seed_data is intentionally a no-op; use dedicated seed scripts outside migrations.' as message;
commit;
