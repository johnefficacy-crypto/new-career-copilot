alter table if exists public.certifications
  add column if not exists aliases text[] default '{}'::text[],
  add column if not exists exam_families text[] default '{}'::text[],
  add column if not exists sectors text[] default '{}'::text[],
  add column if not exists qualification_levels text[] default '{}'::text[],
  add column if not exists certification_type text,
  add column if not exists is_active boolean default true;
