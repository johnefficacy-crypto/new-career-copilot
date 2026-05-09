begin;

-- Enable RLS
alter table public.profiles enable row level security;
alter table public.notification_alerts enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.tracked_recruitments enable row level security;
alter table public.eligibility_results enable row level security;
alter table public.eligibility_recompute_queue enable row level security;
alter table public.scrape_queue enable row level security;
alter table public.notification_documents enable row level security;
alter table public.extracted_field_evidence enable row level security;
alter table public.admin_audit_logs enable row level security;
alter table public.admin_settings enable row level security;

-- profiles
drop policy if exists profiles_select_own on public.profiles;
create policy profiles_select_own
on public.profiles
for select
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists profiles_update_own on public.profiles;
create policy profiles_update_own
on public.profiles
for update
using (
  id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  id = auth.uid()
  or public.is_admin(auth.uid())
);

-- notification_alerts
drop policy if exists alerts_select_own on public.notification_alerts;
create policy alerts_select_own
on public.notification_alerts
for select
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists alerts_update_own on public.notification_alerts;
create policy alerts_update_own
on public.notification_alerts
for update
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- notification_preferences
drop policy if exists prefs_select_own on public.notification_preferences;
create policy prefs_select_own
on public.notification_preferences
for select
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists prefs_upsert_own on public.notification_preferences;
create policy prefs_upsert_own
on public.notification_preferences
for all
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- tracked_recruitments
drop policy if exists tracked_select_own on public.tracked_recruitments;
create policy tracked_select_own
on public.tracked_recruitments
for select
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

drop policy if exists tracked_manage_own on public.tracked_recruitments;
create policy tracked_manage_own
on public.tracked_recruitments
for all
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
)
with check (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- eligibility_results
drop policy if exists eligibility_results_own on public.eligibility_results;
create policy eligibility_results_own
on public.eligibility_results
for select
using (
  user_id = auth.uid()
  or public.is_admin(auth.uid())
);

-- eligibility_recompute_queue
drop policy if exists eligibility_queue_admin on public.eligibility_recompute_queue;
create policy eligibility_queue_admin
on public.eligibility_recompute_queue
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

-- scrape_queue
drop policy if exists scrape_queue_admin on public.scrape_queue;
create policy scrape_queue_admin
on public.scrape_queue
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

-- notification_documents
drop policy if exists notif_docs_admin on public.notification_documents;
create policy notif_docs_admin
on public.notification_documents
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

-- extracted_field_evidence
drop policy if exists evidence_admin on public.extracted_field_evidence;
create policy evidence_admin
on public.extracted_field_evidence
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

-- admin_audit_logs
drop policy if exists admin_audit_admin on public.admin_audit_logs;
create policy admin_audit_admin
on public.admin_audit_logs
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

-- admin_settings
drop policy if exists admin_settings_admin on public.admin_settings;
create policy admin_settings_admin
on public.admin_settings
for all
using (
  public.is_admin(auth.uid())
)
with check (
  public.is_admin(auth.uid())
);

commit;