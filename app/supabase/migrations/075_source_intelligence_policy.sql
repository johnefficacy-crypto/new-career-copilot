begin;

alter table if exists public.source_registry
  add column if not exists is_official_source boolean not null default false,
  add column if not exists can_publish_directly boolean not null default true,
  add column if not exists discovery_only boolean not null default false;

update public.source_registry
set discovery_only = true,
    can_publish_directly = false,
    requires_official_confirmation = true
where source_type in ('aggregator','coaching_blog','social_signal');

commit;
