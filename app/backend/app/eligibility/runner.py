"""Eligibility runner — Supabase-admin-backed.

Direct port of ``UI-career-copilot/lib/eligibility/runner.ts`` (master).

Differences from the TS reference (intentional, behaviour-equivalent):
    * Uses ``supabase-py`` admin client instead of the cookie-bound JS
      client. ``asyncpg`` is **not** used in this module today because
      the project's direct Postgres hostname is IPv6-only inside this
      runtime; switching to the Supabase pooler DSN later would let us
      drop in asyncpg without touching call-sites.
    * No ``revalidatePath`` (server-action only) — the Python API
      simply returns the result.

The engine itself (`engine.py`) is the single source of truth for
verdicts; this module just shuttles data.
"""
from __future__ import annotations

import logging
import hashlib
import json
from datetime import datetime, timezone
from typing import Any

from supabase import AsyncClient, Client

from app.core.error_utils import log_warning_with_context
from app.core.errors import DatabaseError
from app.db.utils import require_select, safe_select
from .engine import check_eligibility_batch
from app.profile.eligibility_mapper import build_user_eligibility_profile
from .schemas import (
    AgeCriteria,
    AgeRelaxationRule,
    AttemptLimit,
    CertificationCriteria,
    DisabilityRequirement,
    EducationCriteria,
    PostCriteria,
    UserEducation,
    UserExamAttempts,
    UserExamCredential,
    UserCertification,
    UserProfile,
)

logger = logging.getLogger("career_copilot.eligibility")

# Perf note (May 2026):
# - Read helpers now use real async Supabase client awaits when AsyncClient is provided.
# - Recompute path remains sync for write correctness (eligibility_results + alerts writes).
# - Existing batched reads already use `.in_(...)` for post and recruitment-linked criteria.


def _first(value: Any) -> Any:
    """Supabase returns FK joins as either an object or a single-element list."""
    if isinstance(value, list):
        return value[0] if value else None
    return value


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, separators=(",", ":"), default=str)


def _profile_hash(mapped_profile: dict[str, Any]) -> str:
    payload = {
        "identity": mapped_profile.get("identity") or {},
        "reservations": mapped_profile.get("reservations") or {},
        "location": mapped_profile.get("location") or {},
        "education": sorted(mapped_profile.get("education") or [], key=lambda r: _stable_json(r)),
        "certifications": sorted(mapped_profile.get("certifications") or [], key=lambda r: _stable_json(r)),
        "attempts": sorted(mapped_profile.get("attempts") or [], key=lambda r: _stable_json(r)),
        "credentials": sorted(mapped_profile.get("credentials") or [], key=lambda r: _stable_json(r)),
    }
    return hashlib.sha256(_stable_json(payload).encode("utf-8")).hexdigest()


def run_eligibility_for_user(
    user_id: str,
    supabase: Client,
) -> dict[str, Any]:
    """Run the engine for one user and persist results to ``eligibility_results``.

    Returns a summary mirroring the TS runner:
        ``{processed, eligible, conditional, alerts_inserted, errors}``
    """
    errors: list[str] = []

    # ── 1. Load user data ──────────────────────────────────────────────────
    mapped_model = build_user_eligibility_profile(supabase, user_id)
    mapped = mapped_model.model_dump()
    profile_hash = _profile_hash(mapped)
    if not mapped.get("identity"):
        return {
            "processed": 0,
            "eligible": 0,
            "conditional": 0,
            "alerts_inserted": 0,
            "errors": ["Profile not found"],
        }
    profile_rows = require_select(supabase, "profiles", "*", id=user_id)
    profile_payload = profile_rows[0] if profile_rows else {"id": user_id}
    profile_payload = {
        **profile_payload,
        "category": profile_payload.get("category") or mapped.get("reservations", {}).get("category"),
        "domicile_state": profile_payload.get("domicile_state") or mapped.get("location", {}).get("state"),
        "date_of_birth": profile_payload.get("date_of_birth") or mapped.get("identity", {}).get("dob"),
        "nationality": profile_payload.get("nationality") or mapped.get("identity", {}).get("nationality"),
        "disability_code": mapped.get("reservations", {}).get("disability_code"),
        "languages_known": mapped.get("preferences", {}).get("languages_known") or [],
        "family_income_annual": mapped.get("reservations", {}).get("family_income_annual"),
        "ews_certificate_available": mapped.get("reservations", {}).get("ews_certificate_available"),
    }
    profile = UserProfile(**profile_payload)

    education = [UserEducation(**row) for row in (mapped.get("education") or [])]
    attempt_rows = mapped.get("attempts") or []
    exam_attempts = []
    for row in attempt_rows:
        mapped = {
            "recruitment_id": row.get("recruitment_id") or row.get("exam_id"),
            "attempts_used": row.get("attempts_used") or 0,
        }
        if mapped["recruitment_id"]:
            exam_attempts.append(UserExamAttempts(**mapped))
    exam_credentials = [
        UserExamCredential(**row)
        for row in safe_select(
            supabase, "aspirant_exam_credentials", "exam_key", user_id=user_id
        )
    ]
    user_certifications = [UserCertification(**row) for row in safe_select(supabase, "aspirant_certifications", "certification_name,issuing_body,is_active", user_id=user_id) if row.get("is_active", True)]
    tracked_set = {
        row["recruitment_id"]
        for row in safe_select(
            supabase, "tracked_recruitments", "recruitment_id", user_id=user_id
        )
    }

    # ── 2. Load active posts + their criteria + recruiting org state ───────
    # The reference repo filtered by `recruitments.ingestion_trust_status` —
    # this Supabase project has migrated to `publish_status` (per migration
    # 033). Trust gate is `verified` or `published`; lifecycle gate is
    # `open` or `upcoming`.
    try:
        posts_resp = (
            supabase.table("posts")
            .select(
                """
                id,
                recruitment_id,
                language_requirements,
                recruitments!inner ( status, publish_status, organizations ( state ) ),
                age_criteria ( min_age, max_age, cutoff_date ),
                age_relaxation_rules ( reservation_category, condition_key, additional_years, max_age_cap, cumulative, source_note ),
                education_criteria ( min_qualification_level, min_percentage, allowed_disciplines, allow_higher_qualification, accepted_equivalent_qualifications, raw_requirement_text ),
                post_disability_requirements ( disability_code, physical_requirement_code, suitable, source_note ),
                certification_criteria ( mandatory, certifications ( name, issuer ) ),
                attempt_limits ( category, max_attempts )
                """
            )
            .in_("recruitments.status", ["open", "upcoming"])
            .in_("recruitments.publish_status", ["verified", "published"])
            .execute()
        )
        posts: list[dict[str, Any]] = posts_resp.data or []
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "eligibility.posts_fetch_required", exc, user_id=user_id)
        raise DatabaseError("Failed required select on posts") from exc

    # ── 3. Map to PostCriteria ─────────────────────────────────────────────
    post_criteria_list: list[PostCriteria] = []
    for row in posts:
        recruitment = _first(row.get("recruitments"))
        org = _first((recruitment or {}).get("organizations")) if recruitment else None
        ac = _first(row.get("age_criteria"))
        ec = _first(row.get("education_criteria"))
        attempts = row.get("attempt_limits") or []
        age_rules = row.get("age_relaxation_rules") or []
        disability_rows = row.get("post_disability_requirements") or []
        cert_rows = row.get("certification_criteria") or []
        cert_criteria = []
        for c in cert_rows:
            reg = _first(c.get("certifications"))
            cert_criteria.append(CertificationCriteria(mandatory=bool(c.get("mandatory", True)), name=(reg or {}).get("name"), issuer=(reg or {}).get("issuer"), aliases=(reg or {}).get("aliases") or []))

        post_criteria_list.append(
            PostCriteria(
                post_id=row["id"],
                recruitment_id=row["recruitment_id"],
                age_criteria=AgeCriteria(**ac) if ac else None,
                education_criteria=EducationCriteria(**ec) if ec else None,
                attempt_limits=[AttemptLimit(**a) for a in attempts],
                age_relaxation_rules=[AgeRelaxationRule(**a) for a in age_rules],
                disability_requirements=[DisabilityRequirement(**d) for d in disability_rows],
                certification_criteria=cert_criteria,
                language_requirements=row.get("language_requirements") or [],
                org_state=(org or {}).get("state") if org else None,
            )
        )

    # ── 4. Required exam credentials per recruitment (optional table) ──────
    rec_ids = list({pc.recruitment_id for pc in post_criteria_list})
    required_map: dict[str, list[str]] = {}
    if rec_ids:
        try:
            req_rows = (
                supabase.table("recruitment_required_exam_credentials")
                .select("recruitment_id, exam_key")
                .in_("recruitment_id", rec_ids)
                .execute()
                .data
                or []
            )
            for r in req_rows:
                required_map.setdefault(r["recruitment_id"], []).append(r["exam_key"])
        except Exception as exc:  # noqa: BLE001
            # Table is optional in some deployments — log and continue.
            logger.info("recruitment_required_exam_credentials skipped: %s", exc)

    for pc in post_criteria_list:
        pc.required_exam_keys = required_map.get(pc.recruitment_id, [])

    # ── 5. Run batch engine ────────────────────────────────────────────────
    existing_rows = (
        supabase.table("eligibility_results")
        .select("post_id, recruitment_id, profile_hash, computed_at")
        .eq("user_id", user_id)
        .execute()
        .data
        or []
    )
    existing_by_post = {row.get("post_id"): row for row in existing_rows if row.get("post_id")}
    skip_ids = {
        pc.post_id
        for pc in post_criteria_list
        if (existing_by_post.get(pc.post_id) or {}).get("profile_hash") == profile_hash
    }
    to_compute = [pc for pc in post_criteria_list if pc.post_id not in skip_ids]
    results = check_eligibility_batch(
        profile,
        education,
        exam_attempts,
        exam_credentials,
        to_compute,
        user_certifications=user_certifications,
    )

    # ── 6. Upsert into eligibility_results ─────────────────────────────────
    now = datetime.now(timezone.utc).isoformat()
    upsert_rows = [
        {
            "user_id": user_id,
            "post_id": r.post_id,
            "recruitment_id": r.recruitment_id,
            "is_eligible": r.result.is_eligible,
            "is_conditional": r.result.is_conditional,
            "fail_reasons": r.result.fail_reasons,
            "computed_at": now,
            "profile_hash": profile_hash,
        }
        for r in results
    ]
    if upsert_rows:
        try:
            supabase.table("eligibility_results").upsert(
                upsert_rows, on_conflict="user_id,post_id"
            ).execute()
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Cache write failed: {exc}")

    # ── 7. Emit notification_alerts for matched recruitments ───────────────
    eligible_by_rec: dict[str, bool] = {}  # True = eligible, False = conditional only
    for r in results:
        if r.result.is_eligible:
            eligible_by_rec[r.recruitment_id] = True
        elif r.result.is_conditional and r.recruitment_id not in eligible_by_rec:
            eligible_by_rec[r.recruitment_id] = False

    alerts_inserted = 0
    if eligible_by_rec:
        prefs_rows = safe_select(
            supabase,
            "aspirant_preferences",
            "target_exams, preferred_sectors",
            user_id=user_id,
        )
        prefs = prefs_rows[0] if prefs_rows else {}
        target_exams = [str(x).lower() for x in (prefs.get("target_exams") or [])]
        preferred_sectors = [str(x).lower() for x in (prefs.get("preferred_sectors") or [])]

        rec_meta_rows: list[dict[str, Any]] = []
        try:
            rec_meta_rows = (
                supabase.table("recruitments")
                .select("id, name, organizations(type)")
                .in_("id", list(eligible_by_rec.keys()))
                .execute()
                .data
                or []
            )
        except Exception as exc:  # noqa: BLE001
            log_warning_with_context(
                logger,
                "eligibility.recruitment_meta_fetch",
                exc,
                user_id=user_id,
                recruitment_count=len(eligible_by_rec),
            )

        meta_map = {row["id"]: row for row in rec_meta_rows}

        alert_rows = []
        for rec_id, strict_eligible in eligible_by_rec.items():
            meta = meta_map.get(rec_id, {})
            org_obj = _first(meta.get("organizations")) or {}
            name = str(meta.get("name") or "").lower()
            org_type = str(org_obj.get("type") or "").lower()
            alert_rows.append(
                {
                    "user_id": user_id,
                    "recruitment_id": rec_id,
                    "alert_type": "new_match",
                    "is_read": False,
                    "priority": 3,
                    "sent_at": now,
                    "alert_event_id": None,
                    "explanation": {
                        "is_tracked": rec_id in tracked_set,
                        "is_eligible": strict_eligible is True,
                        "matched_exam": any(t in name for t in target_exams),
                        "matched_sector": org_type in preferred_sectors,
                        "matched_type": False,
                    },
                }
            )

        try:
            inserted = (
                supabase.table("notification_alerts")
                .upsert(alert_rows, on_conflict="user_id,recruitment_id,alert_type")
                .execute()
            )
            alerts_inserted = len(inserted.data or [])
        except Exception as exc:  # noqa: BLE001
            errors.append(f"Alert write failed: {exc}")

    eligible = sum(1 for r in results if r.result.is_eligible)
    conditional = sum(1 for r in results if r.result.is_conditional)

    return {
        "processed": len(results),
        "skipped": len(skip_ids),
        "eligible": eligible,
        "conditional": conditional,
        "alerts_inserted": alerts_inserted,
        "errors": errors,
    }


async def run_eligibility_for_user_async(
    user_id: str,
    supabase: Client,
) -> dict[str, Any]:
    """Compatibility async API for FastAPI endpoints.

    Note: recompute path intentionally remains sync for write-path safety and
    deterministic behavior across eligibility_results + alert upserts.
    This is an async compatibility wrapper, not true async DB I/O.
    """
    return run_eligibility_for_user(user_id, supabase)


# ─── Read helpers (used by /api/eligibility/results/me[/all]) ────────────────


_RESULT_SELECT = (
    "post_id, recruitment_id, is_eligible, is_conditional, fail_reasons, computed_at, "
    "posts ( "
    "post_name, group_type, pay_level, "
    "salary_details ( pay_level, basic_pay_min, basic_pay_max, in_hand_estimate ), "
    "vacancies ( category, vacancy_count ), "
    "recruitments ( "
    "name, year, notification_date, apply_start_date, apply_end_date, status, "
    "organizations ( name, type ) ) )"
)

_RESULT_SELECT_ALL = (
    "post_id, recruitment_id, is_eligible, is_conditional, fail_reasons, computed_at, "
    "posts ( "
    "post_name, group_type, pay_level, "
    "recruitments ( name, year, apply_end_date, status, organizations ( name, type ) ) )"
)


def get_eligible_recruitments(user_id: str, supabase: Client) -> list[dict[str, Any]]:
    """Eligible + conditional rows, eligible first."""
    try:
        return (
            supabase.table("eligibility_results")
            .select(_RESULT_SELECT)
            .eq("user_id", user_id)
            .or_("is_eligible.eq.true,is_conditional.eq.true")
            .order("is_eligible", desc=True)
            .order("computed_at", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "eligibility.get_eligible_recruitments", exc, user_id=user_id)
        return []


async def get_eligible_recruitments_async(
    user_id: str, supabase: AsyncClient | Client
) -> list[dict[str, Any]]:
    if isinstance(supabase, Client):
        # Compatibility path for sync client.
        return get_eligible_recruitments(user_id, supabase)
    try:
        out = await (
            supabase.table("eligibility_results")
            .select(_RESULT_SELECT)
            .eq("user_id", user_id)
            .or_("is_eligible.eq.true,is_conditional.eq.true")
            .order("is_eligible", desc=True)
            .order("computed_at", desc=True)
            .execute()
        )
        return out.data or []
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "eligibility.get_eligible_recruitments_async", exc, user_id=user_id)
        return []




def get_all_eligibility_results(user_id: str, supabase: Client) -> list[dict[str, Any]]:
    """Every row, eligible first then conditional then ineligible."""
    try:
        return (
            supabase.table("eligibility_results")
            .select(_RESULT_SELECT_ALL)
            .eq("user_id", user_id)
            .order("is_eligible", desc=True)
            .order("is_conditional", desc=True)
            .execute()
            .data
            or []
        )
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "eligibility.get_all_results", exc, user_id=user_id)
        return []


async def get_all_eligibility_results_async(
    user_id: str, supabase: AsyncClient | Client
) -> list[dict[str, Any]]:
    if isinstance(supabase, Client):
        return get_all_eligibility_results(user_id, supabase)
    try:
        out = await (
            supabase.table("eligibility_results")
            .select(_RESULT_SELECT_ALL)
            .eq("user_id", user_id)
            .order("is_eligible", desc=True)
            .order("is_conditional", desc=True)
            .execute()
        )
        return out.data or []
    except Exception as exc:  # noqa: BLE001
        log_warning_with_context(logger, "eligibility.get_all_results_async", exc, user_id=user_id)
        return []
