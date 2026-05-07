begin;

alter table if exists public.recruitments
  add column if not exists slug text;

create unique index if not exists idx_recruitments_slug_unique
  on public.recruitments(slug)
  where slug is not null;

update public.recruitments
set slug = lower(regexp_replace(coalesce(name,''),'[^a-z0-9]+','-','g')) || '-' || coalesce(year::text, extract(year from now())::text) || '-' || left(id::text,8)
where slug is null;

commit;
