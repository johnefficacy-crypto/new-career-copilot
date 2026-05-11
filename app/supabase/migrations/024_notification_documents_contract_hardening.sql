-- Notification document contract hardening.
-- Keeps source_url/content_hash canonical while neutralizing legacy baseline
-- requirements such as file_url being required by old table definitions.

alter table public.notification_documents
  add column if not exists source_url text,
  add column if not exists final_url text,
  add column if not exists file_url text,
  add column if not exists content_hash text,
  add column if not exists document_type text,
  add column if not exists raw_text text,
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.notification_documents
   set source_url = coalesce(source_url, file_url, 'manual://unknown')
 where source_url is null;

update public.notification_documents
   set file_url = coalesce(file_url, source_url)
 where file_url is null;

update public.notification_documents
   set document_type = coalesce(document_type, 'unknown')
 where document_type is null;

update public.notification_documents
   set content_hash = coalesce(
     content_hash,
     encode(digest(coalesce(raw_text, source_url, file_url, id::text), 'sha256'), 'hex')
   )
 where content_hash is null;

alter table public.notification_documents
  alter column file_url drop not null,
  alter column source_url set not null,
  alter column document_type set not null,
  alter column content_hash set not null;

do $$
declare
  constraint_name text;
begin
  for constraint_name in
    select conname
    from pg_constraint
    where conrelid = 'public.notification_documents'::regclass
      and contype = 'c'
      and pg_get_constraintdef(oid) ilike '%document_type%'
  loop
    execute format('alter table public.notification_documents drop constraint %I', constraint_name);
  end loop;

  alter table public.notification_documents
    add constraint notification_documents_document_type_check
    check (document_type in ('html','pdf','rss','json','unknown'));
end $$;

do $$
begin
  if not exists (
    select 1
    from public.notification_documents
    group by content_hash
    having count(*) > 1
  ) then
    create unique index if not exists uq_notification_documents_hash
      on public.notification_documents(content_hash);
  else
    raise notice 'Skipping uq_notification_documents_hash: duplicate content_hash rows exist';
  end if;
end $$;

create index if not exists idx_notification_documents_content_hash
  on public.notification_documents(content_hash);

notify pgrst, 'reload schema';
