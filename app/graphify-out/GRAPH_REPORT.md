# Graph Report - app  (2026-05-13)

## Corpus Check
- 339 files · ~127,536 words
- Verdict: corpus is large enough that graph structure adds value.

## Summary
- 1604 nodes · 2959 edges · 120 communities (99 shown, 21 thin omitted)
- Extraction: 87% EXTRACTED · 13% INFERRED · 0% AMBIGUOUS · INFERRED: 396 edges (avg confidence: 0.77)
- Token cost: 0 input · 0 output

## Graph Freshness
- Built from commit: `b1e09c10`
- Run `git rev-parse HEAD` and compare to check if the graph is stale.
- Run `graphify update .` after code changes (no API cost).

## Community Hubs (Navigation)
- [[_COMMUNITY_Community 0|Community 0]]
- [[_COMMUNITY_Community 1|Community 1]]
- [[_COMMUNITY_Community 2|Community 2]]
- [[_COMMUNITY_Community 3|Community 3]]
- [[_COMMUNITY_Community 4|Community 4]]
- [[_COMMUNITY_Community 5|Community 5]]
- [[_COMMUNITY_Community 6|Community 6]]
- [[_COMMUNITY_Community 7|Community 7]]
- [[_COMMUNITY_Community 8|Community 8]]
- [[_COMMUNITY_Community 9|Community 9]]
- [[_COMMUNITY_Community 10|Community 10]]
- [[_COMMUNITY_Community 11|Community 11]]
- [[_COMMUNITY_Community 12|Community 12]]
- [[_COMMUNITY_Community 13|Community 13]]
- [[_COMMUNITY_Community 14|Community 14]]
- [[_COMMUNITY_Community 15|Community 15]]
- [[_COMMUNITY_Community 16|Community 16]]
- [[_COMMUNITY_Community 17|Community 17]]
- [[_COMMUNITY_Community 18|Community 18]]
- [[_COMMUNITY_Community 19|Community 19]]
- [[_COMMUNITY_Community 20|Community 20]]
- [[_COMMUNITY_Community 21|Community 21]]
- [[_COMMUNITY_Community 22|Community 22]]
- [[_COMMUNITY_Community 23|Community 23]]
- [[_COMMUNITY_Community 24|Community 24]]
- [[_COMMUNITY_Community 25|Community 25]]
- [[_COMMUNITY_Community 26|Community 26]]
- [[_COMMUNITY_Community 27|Community 27]]
- [[_COMMUNITY_Community 28|Community 28]]
- [[_COMMUNITY_Community 29|Community 29]]
- [[_COMMUNITY_Community 30|Community 30]]
- [[_COMMUNITY_Community 31|Community 31]]
- [[_COMMUNITY_Community 32|Community 32]]
- [[_COMMUNITY_Community 33|Community 33]]
- [[_COMMUNITY_Community 34|Community 34]]
- [[_COMMUNITY_Community 35|Community 35]]
- [[_COMMUNITY_Community 36|Community 36]]
- [[_COMMUNITY_Community 37|Community 37]]
- [[_COMMUNITY_Community 38|Community 38]]
- [[_COMMUNITY_Community 39|Community 39]]
- [[_COMMUNITY_Community 40|Community 40]]
- [[_COMMUNITY_Community 41|Community 41]]
- [[_COMMUNITY_Community 42|Community 42]]
- [[_COMMUNITY_Community 43|Community 43]]
- [[_COMMUNITY_Community 44|Community 44]]
- [[_COMMUNITY_Community 45|Community 45]]
- [[_COMMUNITY_Community 46|Community 46]]
- [[_COMMUNITY_Community 47|Community 47]]
- [[_COMMUNITY_Community 48|Community 48]]
- [[_COMMUNITY_Community 49|Community 49]]
- [[_COMMUNITY_Community 50|Community 50]]
- [[_COMMUNITY_Community 51|Community 51]]
- [[_COMMUNITY_Community 52|Community 52]]
- [[_COMMUNITY_Community 53|Community 53]]
- [[_COMMUNITY_Community 54|Community 54]]
- [[_COMMUNITY_Community 55|Community 55]]
- [[_COMMUNITY_Community 56|Community 56]]
- [[_COMMUNITY_Community 57|Community 57]]
- [[_COMMUNITY_Community 58|Community 58]]
- [[_COMMUNITY_Community 59|Community 59]]
- [[_COMMUNITY_Community 60|Community 60]]
- [[_COMMUNITY_Community 61|Community 61]]
- [[_COMMUNITY_Community 62|Community 62]]
- [[_COMMUNITY_Community 63|Community 63]]
- [[_COMMUNITY_Community 64|Community 64]]
- [[_COMMUNITY_Community 65|Community 65]]
- [[_COMMUNITY_Community 66|Community 66]]
- [[_COMMUNITY_Community 67|Community 67]]
- [[_COMMUNITY_Community 68|Community 68]]
- [[_COMMUNITY_Community 69|Community 69]]
- [[_COMMUNITY_Community 70|Community 70]]
- [[_COMMUNITY_Community 71|Community 71]]
- [[_COMMUNITY_Community 72|Community 72]]
- [[_COMMUNITY_Community 76|Community 76]]
- [[_COMMUNITY_Community 77|Community 77]]
- [[_COMMUNITY_Community 78|Community 78]]
- [[_COMMUNITY_Community 79|Community 79]]
- [[_COMMUNITY_Community 80|Community 80]]
- [[_COMMUNITY_Community 81|Community 81]]
- [[_COMMUNITY_Community 82|Community 82]]
- [[_COMMUNITY_Community 83|Community 83]]
- [[_COMMUNITY_Community 84|Community 84]]
- [[_COMMUNITY_Community 91|Community 91]]

## God Nodes (most connected - your core abstractions)
1. `get_supabase_admin()` - 115 edges
2. `_safe()` - 49 edges
3. `api` - 46 edges
4. `check_eligibility()` - 41 edges
5. `_post()` - 31 edges
6. `useAuth()` - 30 edges
7. `_profile()` - 29 edges
8. `_grad()` - 27 edges
9. `run_eligibility_for_user()` - 25 edges
10. `DatabaseError` - 24 edges

## Surprising Connections (you probably didn't know these)
- `_require_admin()` --calls--> `get_supabase_admin()`  [INFERRED]
  backend/app/api/admin_scrape.py → backend/app/db/supabase_client.py
- `list_scrape_runs()` --calls--> `get_supabase_admin()`  [INFERRED]
  backend/app/api/admin_scrape.py → backend/app/db/supabase_client.py
- `admin_organizations()` --calls--> `get_supabase_admin()`  [INFERRED]
  backend/app/api/admin_trust.py → backend/app/db/supabase_client.py
- `my_payments()` --calls--> `get_supabase_admin()`  [INFERRED]
  backend/app/api/payments.py → backend/app/db/supabase_client.py
- `admin_payments()` --calls--> `get_supabase_admin()`  [INFERRED]
  backend/app/api/payments.py → backend/app/db/supabase_client.py

## Communities (120 total, 21 thin omitted)

### Community 0 - "Community 0"
Cohesion: 0.05
Nodes (36): FILTERS, ROWS, IdentitySection(), IdentityStep(), Chips(), Grid(), Section(), SimpleList() (+28 more)

### Community 1 - "Community 1"
Cohesion: 0.11
Nodes (70): _category_relaxation_years(), check_eligibility(), check_eligibility_batch(), _condition_matches(), _edu_level_rank(), _normalise_token(), _normalize_category(), _notice_age_relaxation() (+62 more)

### Community 2 - "Community 2"
Cohesion: 0.05
Nodes (42): AppError, DatabaseError, Raised when a critical database operation fails., Raised when scrape pipeline orchestration fails., Base class for predictable application-level errors., Raised for invalid request/input state., ScraperPipelineError, ValidationError (+34 more)

### Community 3 - "Community 3"
Cohesion: 0.06
Nodes (15): api, apiFetch(), attachStructuredErrorFields(), formatApiErrorDetail(), getAccessToken(), getApiErrorDetail(), getApiErrorFieldList(), getApiErrorMessage() (+7 more)

### Community 5 - "Community 5"
Cohesion: 0.06
Nodes (39): _audit_recompute(), _get_results_supabase_client(), _is_service_role(), Eligibility API.  Endpoints (mirrors the reference repo):     POST /api/eligi, Prefer async Supabase client; fall back to sync client for compatibility., recompute(), RecomputeBody, results_me() (+31 more)

### Community 6 - "Community 6"
Cohesion: 0.08
Nodes (32): validate_status(), Execute a select query and return rows, or [] if the query fails., safe_select(), build_user_eligibility_profile(), AttemptRow, _attempts(), _Base, CertificationRow (+24 more)

### Community 7 - "Community 7"
Cohesion: 0.05
Nodes (16): admin_token(), normal_user(), End-to-end backend tests for Razorpay subscription / payment flow.  Hits the p, Create a fresh non-admin user and return (token, email, user_id)., Create → update → soft-delete a temp plan to keep core plans intact., Verify price update on the canonical 'pro' plan persists, then restore., _supabase_admin_create_user(), _supabase_signin() (+8 more)

### Community 8 - "Community 8"
Cohesion: 0.09
Nodes (36): admin_create_plan(), admin_disable_plan(), admin_list_plans(), admin_payments(), admin_subs(), admin_update_plan(), create_order(), _deactivate_other_active() (+28 more)

### Community 9 - "Community 9"
Cohesion: 0.08
Nodes (16): AdminShell(), NAV, ForgotPassword(), Login(), ResetPassword(), Signup(), auth, AuthCtx (+8 more)

### Community 10 - "Community 10"
Cohesion: 0.1
Nodes (13): E, FallbackQ, FallbackSB, Q, SB, test_fallback_attaches_age_and_education_rows_to_posts(), test_first_recompute_stores_profile_hash(), test_load_active_posts_uses_embedded_select_success_path() (+5 more)

### Community 11 - "Community 11"
Cohesion: 0.13
Nodes (16): _Exec, _Q, _SB, test_get_profile_returns_assembled_profile(), test_profile_completion_detects_missing_education(), test_profile_completion_uses_normalized_location_and_reservations(), test_put_profile_maps_cgpa(), test_put_profile_maps_education_level() (+8 more)

### Community 12 - "Community 12"
Cohesion: 0.09
Nodes (7): Q, R, SB, test_approve_updates_status(), test_promote_never_publishes(), test_reject_duplicate_mock_queue_rows_safely(), test_reject_writes_audit()

### Community 13 - "Community 13"
Cohesion: 0.13
Nodes (27): add_mock(), add_tracker(), affiliates(), ApplicationUpsert, carry_forward_tasks(), clicked_apply(), complete_task(), _days_until() (+19 more)

### Community 14 - "Community 14"
Cohesion: 0.15
Nodes (26): admin_sources(), approve_queue_item(), _audit(), build_effective_extracted_data(), correct_field(), list_scrape_runs(), _list_sources(), mark_queue_item_duplicate() (+18 more)

### Community 15 - "Community 15"
Cohesion: 0.08
Nodes (26): CertificationIn, ExamAttemptIn, ExperienceIn, FocusStart, FocusStop, MockEntry, PlanToggle, PostCreate (+18 more)

### Community 16 - "Community 16"
Cohesion: 0.12
Nodes (23): _anthropic_api_key_available(), build_recruitment_key(), compute_similarity_key(), _extract_json_object(), extract_recruitment_data(), fetch_page_html(), fetch_page_text(), _guess_org_type() (+15 more)

### Community 17 - "Community 17"
Cohesion: 0.14
Nodes (13): _install(), Q, R, SB, test_critical_edit_to_published_recruitment_resets_needs_review(), test_needs_review_visible_admin_hidden_public(), test_publish_blocked_when_eligibility_rules_missing(), test_publish_blocked_when_official_notification_url_missing() (+5 more)

### Community 18 - "Community 18"
Cohesion: 0.17
Nodes (23): activate_source(), admin_organizations(), admin_recruitments(), _audit(), create_source(), deactivate_source(), _is_suspicious_domain(), _normalize_timeline_event() (+15 more)

### Community 19 - "Community 19"
Cohesion: 0.1
Nodes (25): add_comment(), categories(), create_thread(), _ensure_active_plan(), focus_summary(), get_plan(), list_certifications(), list_exam_attempts() (+17 more)

### Community 20 - "Community 20"
Cohesion: 0.13
Nodes (10): _Exec, _Q, _SB, test_certifications_crud_and_isolation(), test_completion_includes_advanced_groups(), test_exam_attempt_crud_and_validation(), test_experience_crud_validation(), test_manual_recompute_endpoint() (+2 more)

### Community 21 - "Community 21"
Cohesion: 0.1
Nodes (3): GuestOnly(), ProtectedRoute(), STATUSES

### Community 22 - "Community 22"
Cohesion: 0.11
Nodes (18): eligibility_queue(), list_scrape_queue(), Two-pane KPI view consumed by ``EligibilityQueue.jsx``:      * ``pending`` — s, group_by(), index_by(), normalize_token(), InvalidTransition, transition() (+10 more)

### Community 23 - "Community 23"
Cohesion: 0.14
Nodes (21): create_certification(), create_exam_attempt(), create_experience(), delete_certification(), delete_exam_attempt(), delete_experience(), delete_tracker(), eligibility_input_me() (+13 more)

### Community 24 - "Community 24"
Cohesion: 0.17
Nodes (17): promote_queue_item(), PromotionError, DuplicatePromotionError, _find_or_create_organization(), promote_to_recruitments(), Write a queue item into the canonical schema. Raises on any insert failure., ExtractedRecruitment, RunnerSB (+9 more)

### Community 25 - "Community 25"
Cohesion: 0.11
Nodes (8): _Exec, FakeSupabase, _Query, test_disabled_type_is_skipped(), test_dry_run_creates_no_rows(), test_min_priority_skips_low(), test_no_duplicate_notification_same_day(), test_priority_and_types()

### Community 26 - "Community 26"
Cohesion: 0.12
Nodes (10): Query, Resp, SB, test_admin_list_can_see_all_statuses(), test_fake_generated_trailing_id_slug_does_not_resolve(), test_list_recruitments_with_q_uses_trimmed_string(), test_list_recruitments_without_q_does_not_ilike(), test_partial_uuid_does_not_resolve() (+2 more)

### Community 27 - "Community 27"
Cohesion: 0.13
Nodes (11): FOCUSABLE_SELECTOR, getFocusableElements(), useFocusTrap(), AuditDrawer(), OrganizationDrawer(), LiveConfirm(), SourceDetailsDialog(), OrganizationEditPanel() (+3 more)

### Community 28 - "Community 28"
Cohesion: 0.1
Nodes (5): PromotionError, Raised when promotion from queue to canonical records fails., E, Q, RunnerQuery

### Community 29 - "Community 29"
Cohesion: 0.13
Nodes (10): Q, R, SB, test_create_source_accepts_aggregator_and_sets_discovery_policy(), test_create_source_accepts_official_html_without_html_default(), test_create_source_requires_explicit_source_type(), test_invalid_trust_score(), test_org_update_clears_verified() (+2 more)

### Community 30 - "Community 30"
Cohesion: 0.12
Nodes (7): _Exec, _Query, _SB, test_recompute_service_role_runs(), test_recompute_user_mode_audits(), test_recompute_user_mode_ignores_body_user_id(), test_results_me_returns_count()

### Community 31 - "Community 31"
Cohesion: 0.14
Nodes (5): _Exec, _Q, _SB, test_generate_next_actions_all_users_limit_and_counts(), test_generate_next_actions_failed_run_log()

### Community 32 - "Community 32"
Cohesion: 0.13
Nodes (14): promote_run_endpoint(), utc_now_iso(), async_safe_select(), execute_or_default(), execute_or_raise(), Async wrapper around safe_select for async API boundaries.      supabase-py ca, Execute a DB operation and raise DatabaseError on failure., Execute a DB operation and return default when failure is safe. (+6 more)

### Community 33 - "Community 33"
Cohesion: 0.21
Nodes (10): _mk_rec(), Q, R, _set_sb(), test_missing_apply_when_open(), test_missing_notification(), test_publish_ready(), test_reversed_dates() (+2 more)

### Community 34 - "Community 34"
Cohesion: 0.14
Nodes (11): AdminPlans(), EMPTY, formatPrice(), paiseToRupees(), PlanCard(), AdminRBAC(), AdminScraper(), NotificationPreferences() (+3 more)

### Community 35 - "Community 35"
Cohesion: 0.16
Nodes (6): _Exec, _KillSB, _Q, _SB, test_dispatch_respects_notification_kill_switch(), test_dispatch_skips_cleanly_when_email_sent_column_missing()

### Community 36 - "Community 36"
Cohesion: 0.17
Nodes (10): useDashboardData(), ELIGIBILITY_CRITICAL_FIELDS, getProfileGaps(), hasGoalMatch(), normalizeState(), rankRecruitments(), scoreRecruitment(), STAGE_ORDER (+2 more)

### Community 37 - "Community 37"
Cohesion: 0.16
Nodes (7): buildPayload(), EMPTY_FORM, SOURCE_TYPES, SourceCard(), SourceFormDrawer(), sourceTypeLabel(), splitLines()

### Community 38 - "Community 38"
Cohesion: 0.17
Nodes (9): ADMIN_ROUTES_BY_STEP, ADMIN_WORKFLOW_STEPS, getBlockerLabel(), getBlockerNextAction(), NEXT_ACTION_MESSAGES, QUEUE_ACTION_LABELS, RECRUITMENT_BLOCKER_LABELS, RECRUITMENT_BLOCKER_NEXT_ACTIONS (+1 more)

### Community 39 - "Community 39"
Cohesion: 0.18
Nodes (9): AdminRecruitments(), isBlocked(), matchesStatus(), RecruitmentCard(), RecruitmentDrawer(), STATUS_FILTERS, truncateUrl(), getApiBlockingIssues() (+1 more)

### Community 40 - "Community 40"
Cohesion: 0.16
Nodes (10): slugify(), fuzzy_duplicate(), compute_promotion_slug(), _derive_status(), _document_type_for_url(), _ensure_notification_document(), _map_education_level(), Scrape pass runner + queue→canonical promoter.  Direct port of ``UI-career-copil (+2 more)

### Community 41 - "Community 41"
Cohesion: 0.24
Nodes (12): aggregator_max_items(), _clean_label(), discover_aggregator_detail_urls(), _host(), is_aggregator_source(), _looks_like_detail(), _matches_any(), mock_aggregator_detail_urls() (+4 more)

### Community 42 - "Community 42"
Cohesion: 0.16
Nodes (12): admin_notifications(), generate_next_actions(), GenerateNextActionsBody, get_prefs(), KillSwitchBody, MarkReadBody, my_unread_count(), Prefs (+4 more)

### Community 43 - "Community 43"
Cohesion: 0.16
Nodes (3): _AsyncQuery, _AsyncSupabase, test_async_result_helpers_return_rows_for_async_client()

### Community 44 - "Community 44"
Cohesion: 0.19
Nodes (13): _eligibility_summary(), get_recruitment(), list_recruitments(), my_recommendations(), Toggle save by recruitment id OR slug ending in -<8-char-id>., Resolve recruitment deterministically: UUID->id, otherwise exact slug., Coerce a Supabase recruitment row into the shape the UI expects., Map recruitment_id → {eligible: bool, conditional: bool, fail_reasons: [...]}. (+5 more)

### Community 45 - "Community 45"
Cohesion: 0.21
Nodes (12): my_alerts(), my_mark_read(), _job_deadline_sweep(), _alert_users_for_deadline(), alert_users_for_new_recruitment(), get_user_alerts(), mark_alerts_read(), _now() (+4 more)

### Community 46 - "Community 46"
Cohesion: 0.22
Nodes (12): toggle_kill(), _allowed_for_user(), dispatch_pending_alerts(), kill_switch_enabled(), _looks_like_missing_email_sent(), Notification dispatcher — render + send unread alerts.  Channel adapters:, Send via Resend if configured, otherwise log and return a mock id., Pick up unread + email-not-yet-sent alerts and send them.      Returns ``{chec (+4 more)

### Community 47 - "Community 47"
Cohesion: 0.19
Nodes (4): E, Q, SB, test_my_applications_shape_and_select()

### Community 48 - "Community 48"
Cohesion: 0.19
Nodes (5): AdminEligibilityQueue(), AdminOrganizations(), AdminSources(), adminTrustService, useAdminAction()

### Community 49 - "Community 49"
Cohesion: 0.21
Nodes (8): db_health(), DbHealth, Health, lifespan(), Career Copilot backend (Phase 1.5).  Authentication is delegated to Supabase A, close_pool(), get_pool(), stop_scheduler()

### Community 50 - "Community 50"
Cohesion: 0.18
Nodes (4): EligibilityReviewDrawer(), getNextActionForQueueItem(), HIGH_RISK_QUEUE_FIELDS, RECOMMENDED_REVIEW_FIELDS

### Community 51 - "Community 51"
Cohesion: 0.23
Nodes (7): formatDate(), formatLogin(), ROLE_OPTIONS, SORT_OPTIONS, UserCard(), UserTableRow(), ExamDetail()

### Community 52 - "Community 52"
Cohesion: 0.18
Nodes (3): queryClient, AuthProvider(), root

### Community 53 - "Community 53"
Cohesion: 0.33
Nodes (10): _assemble_profile_payload(), _ensure_profile_row(), _get_location(), _get_preferences(), _get_primary_education(), get_profile(), _get_reservations(), profile_completion() (+2 more)

### Community 54 - "Community 54"
Cohesion: 0.22
Nodes (9): admin_jobs(), admin_run_job(), _job_dispatch(), _job_recompute(), list_jobs(), APScheduler in-process job runner.  Three jobs:     notif:dispatch        eve, run_job_now(), start_scheduler() (+1 more)

### Community 55 - "Community 55"
Cohesion: 0.27
Nodes (4): QueueDetailDrawer(), reviewState(), shortId(), typeLabel()

### Community 57 - "Community 57"
Cohesion: 0.44
Nodes (8): _already_exists_today(), _candidate_from_recommendation(), _day_bucket(), _dedupe_key(), generate_next_actions_for_user(), _load_preferences(), _now_iso(), _priority_for_candidate()

### Community 58 - "Community 58"
Cohesion: 0.36
Nodes (5): normalize_legacy_source(), normalize_source_registry(), ScrapeSource, test_normalize_legacy_source_target_url(), test_normalize_source_registry_prefers_source_url()

### Community 61 - "Community 61"
Cohesion: 0.53
Nodes (4): _profile(), _rec(), test_continue_application_exact_text(), test_recommendations_counts()

### Community 65 - "Community 65"
Cohesion: 0.4
Nodes (5): create_thread(), list_threads(), _slugify(), thread_detail(), _thread_view()

### Community 66 - "Community 66"
Cohesion: 0.5
Nodes (3): normalize_recruitment(), NormalizedRecruitment, test_normalizer_scores_missing_fields()

### Community 69 - "Community 69"
Cohesion: 0.5
Nodes (3): me(), Auth router: Supabase-backed `/api/auth/me`.  Phase 1.5 removed the local JWT/, Return the Supabase-authenticated user that owns the access token.

### Community 70 - "Community 70"
Cohesion: 0.5
Nodes (4): _annotate(), get_recruitment(), list_recruitments(), saved_recruitments()

## Knowledge Gaps
- **127 isolated node(s):** `Career Copilot backend (Phase 1.5).  Authentication is delegated to Supabase A`, `Scraper trust-gate API.  Endpoints:     GET  /api/sources`, `Return a UI-friendly source row (matches Sources.jsx).`, `Run a scrape pass in mock mode (no model call, deterministic output).      Bod`, `Run a real scrape pass. It creates review queue items and never publishes.` (+122 more)
  These have ≤1 connection - possible missing edges or undocumented components.
- **21 thin communities (<3 nodes) omitted from report** — run `graphify query` to explore isolated nodes.

## Suggested Questions
_Questions this graph is uniquely positioned to answer:_

- **Why does `get_supabase_admin()` connect `Community 23` to `Community 32`, `Community 5`, `Community 8`, `Community 42`, `Community 44`, `Community 13`, `Community 14`, `Community 45`, `Community 46`, `Community 49`, `Community 18`, `Community 19`, `Community 53`, `Community 22`, `Community 54`, `Community 24`?**
  _High betweenness centrality (0.119) - this node is a cross-community bridge._
- **Why does `run_eligibility_for_user()` connect `Community 1` to `Community 2`, `Community 5`, `Community 6`?**
  _High betweenness centrality (0.036) - this node is a cross-community bridge._
- **Why does `DatabaseError` connect `Community 2` to `Community 32`, `Community 1`, `Community 5`, `Community 6`, `Community 24`, `Community 28`?**
  _High betweenness centrality (0.035) - this node is a cross-community bridge._
- **Are the 114 inferred relationships involving `get_supabase_admin()` (e.g. with `db_health()` and `_require_admin()`) actually correct?**
  _`get_supabase_admin()` has 114 INFERRED edges - model-reasoned connections that need verification._
- **Are the 32 inferred relationships involving `check_eligibility()` (e.g. with `test_eligible_basic()` and `test_age_below_minimum()`) actually correct?**
  _`check_eligibility()` has 32 INFERRED edges - model-reasoned connections that need verification._
- **What connects `Career Copilot backend (Phase 1.5).  Authentication is delegated to Supabase A`, `Scraper trust-gate API.  Endpoints:     GET  /api/sources`, `Return a UI-friendly source row (matches Sources.jsx).` to the rest of the system?**
  _127 weakly-connected nodes found - possible documentation gaps or missing edges._
- **Should `Community 0` be split into smaller, more focused modules?**
  _Cohesion score 0.05 - nodes in this community are weakly interconnected._