# Community, Study Group, Partner, Mentor & Resource Governance — Design Spec

Status: Proposal (no implementation yet)
Owners: Platform / Trust & Safety
Branch: `claude/governance-design-spec-159OU`
Related docs:
- `docs/engineering/admin-governance.md` (recruitment/eligibility control plane)
- `docs/engineering/admin-study-os-operations.md` (per-user Study OS ops)
- `docs/engineering/admin-persona-controls-v1.md`
- `docs/engineering/study-os-mission-control-v1.md`

## 1. Problem

The existing `docs/engineering/admin-governance.md` defines the **recruitment / eligibility / source / RBAC / audit** control plane. It does not cover the **community-side governance surface** — community threads, study groups, accountability partners, mentors, and community resources.

Audit of the live code shows the platform has **foundation-level governance infrastructure** for these surfaces (durable backend routes, RLS-enabled schemas, a cross-surface moderation queue), but **insufficient admin-facing controls**. The current admin pages are thin and in several places non-functional. This is safe for MVP monitoring and basic flag triage; it is **not sufficient for commercial-grade governance**.

This document specifies the missing admin surface, the API contract, the audit/RBAC envelope, and the rollout plan. No code is changed in this PR.

## 2. Goals / non-goals

### Goals
- Surface existing backend governance capability through complete admin tooling.
- Add the missing admin surfaces for study groups, accountability partners, mentor verification, and resource review.
- Make every governance decision (not only report resolution) audit-logged.
- Consolidate cross-surface trust desk on `moderation_items` + `moderation_events`.
- Make all admin governance actions RBAC-gated using the buckets already defined in `docs/engineering/admin-governance.md` §5.1.

### Non-goals
- Aspirant-facing UX changes for community, mentors, resources, or study groups.
- Replacing the cross-surface moderation queue at `moderation_items` — this spec leans on it.
- New canonical entities. Schema deltas are additive and scoped to fields the existing rows already imply.
- Re-doing recruitment/eligibility governance — that remains scoped to `admin-governance.md`.

## 3. Current state (verified against code)

### 3.1 Admin shell and routes
- `app/frontend/src/routes/adminRoutes.jsx:41–52` — registers `/admin/marketplace`, `/admin/mentors`, `/admin/community`, `/admin/moderation`, `/admin/copyright`, `/admin/kpis`, `/admin/rbac`, `/admin/ai-policy`, `/admin/persona`, `/admin/exam-intelligence`.
- `app/frontend/src/pages/admin/AdminShell.jsx:12–47` — splits nav into `OPERATIONS_NAV`, `GOVERNANCE_NAV` (Overview, KPIs, Moderation, Copyright, Organizations, Audit, RBAC, AI Policy, Persona, Exam Intelligence), and `BUSINESS_NAV` (Marketplace, Plans, Mentors, Community). Title is "Governance".

The IA exists. The surfaces under it are uneven.

### 3.2 Admin pages — actual behavior
- `app/frontend/src/pages/admin/Community.jsx:12,15–18,60–61` — reads `/api/admin/community/flags`; supports only `dismiss` and `hide` on a flag. **No** spaces, channels, group rules, pinned/locked threads, member roles, sanctions, group membership, partner disputes, resource approvals, mentor verification, or trust scoring UI.
- `app/frontend/src/pages/admin/Mentors.jsx:12,59` — reads `/api/marketplace/mentors`; the **Review** button has no `onClick` handler. No approve/reject/suspend/verify/credential review path.
- `app/frontend/src/pages/admin/Marketplace.jsx:11,29–31,50–51` — reads `/api/admin/marketplace`; **Dismiss** and **Open** buttons on flags are visual stubs with no handlers and no backend mutation route.
- `app/frontend/src/pages/admin/ModerationQueue.jsx:27–43,142–151` — comprehensive: `claim`, `resolve` (with resolution + notes), `dismiss`, `escalate`, plus an events panel rendering full audit trail. This is the strongest existing governance surface and the right base for the trust desk.

### 3.3 Backend capability (stronger than frontend)
- `app/backend/server.py:206–208` — mounts `community_runtime_router` **before** `canonical_router` and `community_people_router`, so durable routes shadow the deprecated seed module on overlap.
- `app/backend/app/api/community_runtime.py` — durable routes for forums (`:251,278,303,337,371`), study groups (`:514,551,574`), study rooms (`:585,615`), accountability partners (`:632,683,696`), mentors and mentor bookings (`:730,761,806`), resources and reports (`:908,948,998`), and admin flag resolution (`:1023,1044`). Audit write helper at `:106–121` writes to `admin_audit_logs` (only currently called from flag resolution).
- `app/backend/app/api/community_people.py:99–100,24–37,39–55` — explicitly `deprecated=True`, logs a deprecation warning per hit, serves seed/in-memory data. Legacy fallback only.
- `app/backend/app/api/admin_moderation.py:24–25,84–94,121–149,192–231` — file-report + queue + stats + claim/resolve, with `_record_event()` writing to `moderation_events`.
- `app/backend/app/api/admin_ops.py:19,52–60` — `/admin/marketplace` counts only (no mutation endpoints).
- `app/backend/app/api/admin_kpis.py:20` — KPI families for outcome, trust, commercial, quality.
- `app/backend/app/api/accountability.py:22` — Supabase-backed mentor bookings, intended to supersede in-memory endpoints.

### 3.4 Schema (already in place)
- `app/supabase/migrations/070_study_os_social_groups.sql` — `study_groups`, `study_group_members`, `social_study_sessions` (with `trust_source` enum at `:59` and `trust_weight` numeric at `:64`), `social_session_attendance`. RLS enabled on all four at `:115–118`.
- `app/supabase/migrations/088_community_resources_runtime.sql` — `community_resources` with `status` enum `pending_review | approved | rejected | hidden | dmca_removed` (`:17–18`), `verified_by_topper`, `verified_by`, upvote/report counters; plus `community_resource_votes` and `community_resource_reports`. RLS enabled at `:58–60`.
- `app/supabase/migrations/095_moderation_queue.sql` — versioned severity rubric (`moderation_severity_rubric:7`), cross-surface queue (`moderation_items:28`) covering `forum_thread`, `forum_post`, `community_resource`, `mentor_profile`, `marketplace_listing`, `ai_response`, `user_profile`; severity p0–p3 with `severity_rubric_version` FK; resolution enum incl. `escalated_legal`, `user_suspended`, `user_banned`, `edit_required`, `duplicate`; full `moderation_events` audit (`:60`).

### 3.5 Gap matrix

| Area | Backend route | Schema | Admin UI | Gap |
|---|---|---|---|---|
| Community threads / replies | Yes (`community_runtime.py:251–371`) | Forum tables via `095` references | Flag list + dismiss/hide only | Member sanctions, pinned/locked, channel rules, role grants missing |
| Study groups | Yes (`community_runtime.py:514–574`) | `study_groups`, `_members`, `social_study_sessions`, `_attendance` | None | No admin console for groups, sessions, attendance, freeze, member removal |
| Accountability partners | Yes (`community_runtime.py:632–696`) | Implied by routes; no dedicated schema audit yet | None | No view of pairs, ghosting/reliability signals, dispute resolution, block-rematch |
| Mentors | Yes (`community_runtime.py:730–806`, `accountability.py`) | Mentor profile rows in `profiles` and bookings | Listing only, non-wired button | No KYC, approve/reject/suspend, complaint review, payout hold |
| Community resources | Yes (`community_runtime.py:908–998`) | Status enum, votes, reports, verifier fields (`088`) | None | No review queue, approve/reject/edit metadata, DMCA, dedupe |
| Cross-surface moderation | Yes (`admin_moderation.py:84–231`) | `moderation_items` + `_events` + rubric (`095`) | `ModerationQueue.jsx` (full) | Mostly sufficient; promote to primary trust desk; broaden filters |
| KPIs | Yes (`admin_kpis.py`) | `kpi_snapshots` | KPI page | Monitoring only, no governance actions |
| Audit coverage | Partial (`community_runtime.py:106` used only on flag resolve) | `admin_audit_logs` | Audit viewer (per `admin-governance.md` §5.2 — pending) | Most governance writes are not audited |

## 4. Design

Five admin consoles plus one consolidation. All gated by RBAC buckets and writing to `admin_audit_logs` and (where applicable) `moderation_events`.

### 4.1 Admin Study Groups Console — `/admin/community/groups`
**Permission bucket:** `community` (new) or `moderation` (reuse — see §6.1).

**Read views**
- Group list with filters: `status`, `group_type`, `visibility`, `exam_id`, member count, recent session count, report count.
- Group detail: members + role, session log from `social_study_sessions`, attendance/focus-check evidence from `social_session_attendance`, recent flag/report events scoped to the group.

**Write actions** (all audit-logged)
- Archive / unarchive group (`study_groups.status`).
- Freeze group (new field: `study_groups.frozen_at`, `frozen_by`, `frozen_reason`).
- Remove member (`study_group_members` delete).
- Demote/promote member role.
- Force-end an in-progress session.
- Invalidate an attendance row (set `trust_weight = 0`, record reason).

**Backend additions**
- `GET /api/admin/community/groups` (filters)
- `GET /api/admin/community/groups/{id}` (detail incl. sessions + attendance)
- `POST /api/admin/community/groups/{id}/archive`
- `POST /api/admin/community/groups/{id}/freeze`
- `DELETE /api/admin/community/groups/{id}/members/{user_id}`
- `POST /api/admin/community/groups/{id}/sessions/{session_id}/force-end`
- `POST /api/admin/community/groups/{id}/attendance/{row_id}/invalidate`

### 4.2 Admin Partner Governance Console — `/admin/community/partners`
**Permission bucket:** `community` / `moderation`.

**Read views**
- Active pairs: pair id, both users, started_at, last activity, reliability score, ghost count.
- Pending invites with age.
- Reports filtered to entity_type ∈ {`user_profile`} with partner context.

**Write actions**
- End pair with reason (calls existing `POST /community/partner/end`, but admin-attributed and audited).
- Block rematch between two users (new lightweight table: `partner_rematch_blocks(user_a, user_b, reason, blocked_by, created_at)`).
- Resolve dispute → links to a `moderation_items` row.

**Backend additions**
- `GET /api/admin/community/partners` (pairs)
- `GET /api/admin/community/partners/invites`
- `POST /api/admin/community/partners/{pair_id}/end`
- `POST /api/admin/community/partners/rematch-blocks`
- `DELETE /api/admin/community/partners/rematch-blocks/{id}`

**Schema delta**
```sql
create table if not exists public.partner_rematch_blocks (
  id uuid primary key default gen_random_uuid(),
  user_a uuid not null references auth.users(id) on delete cascade,
  user_b uuid not null references auth.users(id) on delete cascade,
  reason text not null,
  blocked_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  unique (user_a, user_b)
);
```

### 4.3 Mentor Verification Console — `/admin/mentors`
**Permission bucket:** `mentors` (new) or `community`.

**Read views**
- Mentor list with verification state, KYC state, recent booking count, complaint count, payout hold flag.
- Mentor detail: credentials, KYC artifacts, booking history, feedback summary, complaint queue (scoped `moderation_items` where `entity_type = 'mentor_profile'`), payout state.

**Write actions**
- Approve / reject mentor application.
- Suspend / reinstate mentor.
- Mark KYC verified / failed with attachment id.
- Set / clear `payout_hold` with reason.
- Open a `moderation_item` against a mentor profile.

**Backend additions**
- `GET /api/admin/mentors` (filters)
- `GET /api/admin/mentors/{id}`
- `POST /api/admin/mentors/{id}/verification` `{ status, kyc_status, notes, artifact_id? }`
- `POST /api/admin/mentors/{id}/suspend` `{ reason }`
- `POST /api/admin/mentors/{id}/payout-hold` `{ hold: boolean, reason }`

**Schema delta** (additive on existing `profiles` or a sidecar)
```sql
create table if not exists public.mentor_verification (
  user_id uuid primary key references auth.users(id) on delete cascade,
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','suspended')),
  kyc_status text not null default 'unverified'
    check (kyc_status in ('unverified','submitted','verified','failed')),
  kyc_artifact_id text,
  payout_hold boolean not null default false,
  payout_hold_reason text,
  verified_by uuid references auth.users(id),
  verified_at timestamptz,
  updated_at timestamptz not null default now()
);
```

### 4.4 Resource Review Queue — `/admin/community/resources`
**Permission bucket:** `community` / `moderation`.

**Read views**
- Queue filtered by `community_resources.status` (`pending_review`, `approved`, `rejected`, `hidden`, `dmca_removed`).
- Resource detail: metadata, source URL, uploader, votes, reports, trust attribution (official / community / coaching / unknown), dedupe candidates (by URL hash and title similarity).

**Write actions** (all audit-logged, status transitions also emit a `moderation_events` row when an `moderation_items` row exists)
- Approve / reject (`community_resources.status`, set `verified_by`, `verified_by_topper` if applicable).
- Edit metadata (title, summary, exam tags, resource_type, source url).
- Set trust attribution (new field: `community_resources.trust_attribution` — enum).
- DMCA remove (`status = 'dmca_removed'`, log takedown reference).
- Merge duplicate into canonical resource (move votes, soft-redirect URLs).

**Backend additions**
- `GET /api/admin/community/resources` (filters, status, exam, reporter)
- `GET /api/admin/community/resources/{id}`
- `POST /api/admin/community/resources/{id}/decision` `{ action: 'approve'|'reject'|'edit'|'dmca'|'hide', metadata?, reason? }`
- `POST /api/admin/community/resources/{id}/merge-into` `{ canonical_id }`

**Schema delta** (additive on `community_resources`)
```sql
alter table public.community_resources
  add column if not exists trust_attribution text
    check (trust_attribution in ('official','community','coaching','unknown'))
    default 'unknown',
  add column if not exists merged_into uuid references public.community_resources(id);
```

### 4.5 Trust desk consolidation
- Keep `ModerationQueue.jsx` as the canonical cross-surface trust desk; broaden filters to expose `entity_type` chips (`forum_thread`, `forum_post`, `community_resource`, `mentor_profile`, `marketplace_listing`, `ai_response`, `user_profile`) per `moderation_items` enum in `app/supabase/migrations/095_moderation_queue.sql:30–34`.
- Reframe `Community.jsx` into **Admin Community Console**: a community-management page (spaces, channels, pinned/locked threads, member sanctions, role grants), not a parallel flag triage. Any flag-style triage links into the central queue.
- Every governance console (§4.1–§4.4) opens a one-click "open in trust desk" path that creates or jumps to the corresponding `moderation_items` row.

### 4.6 Audit coverage uplift
Extend the existing `_audit()` helper at `app/backend/app/api/community_runtime.py:106–121` (or a shared helper) so **every** admin write under this spec writes a row to `admin_audit_logs`. Today only flag resolution is audited.

Minimum action keys to add:
```
admin.group.archive
admin.group.freeze
admin.group.member.remove
admin.group.session.force_end
admin.group.attendance.invalidate
admin.partner.pair.end
admin.partner.rematch.block
admin.mentor.verification.set
admin.mentor.suspend
admin.mentor.payout_hold.set
admin.resource.decision
admin.resource.merge
```

Each row should carry: actor_id, actor_email, action, entity_type, entity_id, old/new payload, request_id, IP.

## 5. RBAC

Reuse buckets from `docs/engineering/admin-governance.md` §5.1 and add two:

| Bucket | Covers |
|---|---|
| `community` | Study groups, partners, community resources, community spaces |
| `mentors` | Mentor verification, suspension, payout hold |
| `moderation` (existing) | Cross-surface trust desk |
| `audit` (existing) | Read audit logs |
| `super_admin` | All of the above |

Enforcement requirements (mirroring `admin-governance.md` §5.1 DoD):
- Every new admin route checks the central permission helper — no `profiles.is_admin` shortcut.
- UI hides controls the operator's bucket does not grant.
- Server actions reject unauthorized callers even if the UI lets them through.

## 6. API conventions

All admin governance routes live under `/api/admin/...` and:
- Require an authenticated session resolved to an admin profile.
- Return `403` with `{ error: 'forbidden', required_permission: '<bucket>' }` on RBAC failure.
- Return `409` on optimistic concurrency mismatch (`updated_at` tag).
- Emit one `admin_audit_logs` row per write, and one `moderation_events` row when the action mutates a `moderation_items` row.
- Are idempotent on retry where the action is a state transition (re-applying the same decision is a no-op).

## 7. Frontend additions

```
app/frontend/src/pages/admin/
  community/
    AdminCommunityConsole.jsx       (renamed from Community.jsx)
    GroupsConsole.jsx               (§4.1)
    PartnersConsole.jsx             (§4.2)
    ResourcesReviewQueue.jsx        (§4.4)
  mentors/
    MentorsConsole.jsx              (§4.3, replaces non-wired Mentors.jsx)
```

`adminRoutes.jsx` adds:
```
/admin/community            -> AdminCommunityConsole
/admin/community/groups     -> GroupsConsole
/admin/community/partners   -> PartnersConsole
/admin/community/resources  -> ResourcesReviewQueue
/admin/mentors              -> MentorsConsole
```

`AdminShell.jsx` BUSINESS_NAV gains a nested **Community Governance** group with the four sub-routes; **Mentors** points to the new console.

## 8. Cleanups

- `app/backend/app/api/community_people.py` is `deprecated=True` and seed-backed (`:99–100,39–55`). Mount order (`server.py:206–208`) shadows it for overlapping paths, but any non-overlapping route is legacy risk. Action: enumerate non-shadowed routes, port any still-needed responses into `community_runtime.py`, then remove the include.
- Reuse `app/backend/app/api/accountability.py` Supabase wiring for any mentor-booking admin reads instead of seeding from `community_seed`.

## 9. Rollout plan

Phase 1 — read-only consoles (no schema change)
- Build Groups, Partners, Mentors, Resources consoles in **read-only** mode using existing `community_runtime.py` data + `moderation_items` joins.
- Promote `ModerationQueue.jsx` filters to expose all `entity_type` values.
- Wire audit helper into existing flag-resolve write only (already done) and verify shape.

Phase 2 — additive schema + write actions
- Apply schema deltas (`partner_rematch_blocks`, `mentor_verification`, `community_resources` columns).
- Ship write actions per §4.1–§4.4, each behind RBAC and audit logging.
- Replace stub buttons in `Mentors.jsx` and `Marketplace.jsx` with real handlers or remove them.

Phase 3 — consolidation
- Migrate `Community.jsx` into AdminCommunityConsole; route old flag triage into the central trust desk.
- Sunset `community_people.py` once routes are confirmed unreferenced.
- Add audit viewer (tracked separately in `admin-governance.md` §5.2) and verify all `admin.community.*`, `admin.mentor.*`, `admin.resource.*` actions appear.

## 10. Acceptance criteria

- An admin holding the right bucket can, end-to-end:
  - Freeze an abusive study group, remove a member, and invalidate a forged attendance row.
  - End a partner pair and block rematch between two users.
  - Approve, reject, suspend, and KYC-mark a mentor; place and clear a payout hold.
  - Approve, reject, edit, DMCA-remove, and merge a community resource.
  - Open any of the above as a `moderation_items` row and progress it through the central trust desk.
- Every write above produces exactly one `admin_audit_logs` row and (when applicable) one `moderation_events` row.
- No new admin route reads `profiles.is_admin` directly; all checks go through the central permission helper.
- `Mentors.jsx` and `Marketplace.jsx` no longer contain non-functional buttons.
- `Community.jsx` is either community-management or removed; flag triage is owned by the central trust desk.

## 11. Out of scope (tracked elsewhere)

- Admin audit log viewer UI — `docs/engineering/admin-governance.md` §5.2.
- Eligibility queue monitor — `docs/engineering/admin-governance.md` §5.3.
- Source verification / recruitment workflow / notification governance — `docs/engineering/admin-governance.md` §6.
- AI action policy enforcement on governance actions — `docs/engineering/admin-governance.md` §7.
- Per-user Study OS support inspector — `docs/engineering/admin-study-os-operations.md`.

## 12. Strategic rule (carried from `admin-governance.md` §10)

```
Trust > Speed
Control > Automation
Determinism > Heuristics
```

Governance is foundational. The repo already has the rails (durable backend, RLS schemas, cross-surface moderation queue). This spec finishes the admin-facing surface so the governance contract holds end-to-end.
