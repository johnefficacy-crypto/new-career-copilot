"""Deterministic eligibility engine — Career Copilot.

Direct port of ``UI-career-copilot/lib/eligibility/engine.ts`` (master).

Given a user's profile + education + attempts + exam credentials and a
post's criteria, returns a structured verdict with rule-by-rule reasons.

Rules covered (matching the reference repo, no additions):
    1. Age — min/max with category, PwBD (max-replace), and ex-serviceman
       (actual_age − service_years − 3) relaxations.
    2. Education — level rank + percentage (cgpa→pct fallback) +
       allowed-disciplines match. Final-year ⇒ ``is_conditional``.
    3. Attempts — per-category attempt limit with null fallback.
    4. Required exam credentials — set membership.
    5. Nationality — Indian only (matches reference behaviour).
    6. Domicile — only enforced when ``org_state`` is non-null
       (state PSC posts).

This module is pure — no I/O, no Supabase imports — so it is fully
testable and reusable from server actions, API routes, or workers.
"""
from __future__ import annotations

from datetime import datetime, timezone

from .schemas import (
    AttemptLimit,
    BatchEligibilityResult,
    EligibilityCheck,
    EligibilityCheckResult,
    PostCriteria,
    UserEducation,
    UserExamAttempts,
    UserExamCredential,
    UserCertification,
    UserProfile,
)

# ─── Education level ordering ────────────────────────────────────────────────

_EDU_LEVEL_ORDER: dict[str, int] = {
    "10th": 1,
    "12th": 2,
    "diploma": 3,
    "graduate": 4,
    "postgraduate": 5,
    "phd": 6,
}


def _edu_level_rank(level: str) -> int:
    return _EDU_LEVEL_ORDER.get((level or "").lower(), 0)


# ─── Category normalisation (state OBC variants → "obc", PwBD compounds) ─────


_OBC_VARIANTS: set[str] = {
    "obc",
    "obc_ncl",
    "vjnt",
    "sebc",
    "sbc",
    "mbc",
    "bc",
    "mbc_dnc",
    "bcm",
    "cat_2a",
    "cat_2b",
    "cat_3a",
    "cat_3b",
    "pwd_obc",
}


def _normalize_category(raw: str | None) -> str:
    cat = (raw or "general").lower().strip()
    if cat in _OBC_VARIANTS:
        return "obc"
    if cat in ("sc", "pwd_sc_st"):
        return "sc"
    if cat == "st":
        return "st"
    if cat == "ews":
        return "ews"
    return "general"


def _category_relaxation_years(profile: UserProfile) -> int:
    """Years to add to max_age for non-ex-serviceman cases."""
    cat = _normalize_category(profile.category)
    relaxation = 0
    if cat == "obc":
        relaxation = 3
    elif cat in ("sc", "st"):
        relaxation = 5
    # ews → 0

    if profile.pwbd_status and profile.pwbd_status != "none":
        if cat in ("general", "ews"):
            pwbd_total = 10
        elif cat == "obc":
            pwbd_total = 13
        else:  # sc, st
            pwbd_total = 15
        relaxation = max(relaxation, pwbd_total)

    return relaxation


def _parse_iso_date(value: str) -> datetime:
    # Accepts YYYY-MM-DD or full ISO timestamp; returns aware UTC.
    if "T" in value:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).astimezone(timezone.utc)
    return datetime.fromisoformat(value + "T00:00:00+00:00")


# ─── Core engine ─────────────────────────────────────────────────────────────


def check_eligibility(
    profile: UserProfile,
    education: list[UserEducation],
    exam_attempts: list[UserExamAttempts],
    exam_credentials: list[UserExamCredential],
    criteria: PostCriteria,
    user_certifications: list[UserCertification] | None = None,
) -> EligibilityCheckResult:
    checks: list[EligibilityCheck] = []
    is_conditional = False
    user_certs: list[UserCertification] = user_certifications or []

    # ── 1. Age ──────────────────────────────────────────────────────────────
    if criteria.age_criteria is not None:
        ac = criteria.age_criteria
        dob_str = profile.dob or profile.date_of_birth
        try:
            cutoff = _parse_iso_date(ac.cutoff_date) if ac.cutoff_date else datetime.now(timezone.utc)
        except Exception:
            cutoff = datetime.now(timezone.utc)

        if not dob_str:
            checks.append(
                EligibilityCheck(
                    rule="age",
                    passed=False,
                    detail="Date of birth not provided — cannot verify age eligibility.",
                )
            )
        else:
            try:
                dob = _parse_iso_date(dob_str)
            except Exception:
                checks.append(
                    EligibilityCheck(rule="age", passed=False, detail="Invalid date of birth.")
                )
            else:
                age_at_cutoff = int(
                    (cutoff - dob).total_seconds() // (365.25 * 24 * 60 * 60)
                )

                if profile.ex_serviceman and profile.service_years is not None:
                    cat_relax = _category_relaxation_years(profile)
                    age_for_max = age_at_cutoff - profile.service_years - 3
                    relax_note = (
                        f"ex-serviceman formula: {age_at_cutoff} − "
                        f"{profile.service_years} yrs service − 3 = {age_for_max}"
                        + (f" + {cat_relax} yr category relaxation" if cat_relax > 0 else "")
                    )
                    age_for_max -= cat_relax
                else:
                    relaxation = _category_relaxation_years(profile)
                    total_relaxation = (
                        max(relaxation, 3) if profile.ex_serviceman else relaxation
                    )
                    age_for_max = age_at_cutoff - total_relaxation
                    relax_note = (
                        f"{total_relaxation} yr relaxation applied"
                        if total_relaxation > 0
                        else "no relaxation"
                    )

                min_ok = ac.min_age is None or age_at_cutoff >= ac.min_age
                max_ok = ac.max_age is None or age_for_max <= ac.max_age

                if not min_ok:
                    checks.append(
                        EligibilityCheck(
                            rule="age",
                            passed=False,
                            detail=(
                                f"Age {age_at_cutoff} is below minimum age {ac.min_age} "
                                f"as of {ac.cutoff_date or 'today'}."
                            ),
                        )
                    )
                elif not max_ok:
                    checks.append(
                        EligibilityCheck(
                            rule="age",
                            passed=False,
                            detail=(
                                f"Age {age_at_cutoff} exceeds maximum {ac.max_age} after "
                                f"{relax_note} as of {ac.cutoff_date or 'today'}."
                            ),
                        )
                    )
                else:
                    checks.append(
                        EligibilityCheck(
                            rule="age",
                            passed=True,
                            detail=(
                                f"Age {age_at_cutoff} is within range "
                                f"({ac.min_age if ac.min_age is not None else '—'}–"
                                f"{ac.max_age if ac.max_age is not None else '—'}; {relax_note})."
                            ),
                        )
                    )

    # ── 2. Education ────────────────────────────────────────────────────────
    if criteria.education_criteria is not None:
        ec = criteria.education_criteria
        completed_edu = [e for e in education if e.is_completed]
        all_edu = list(education)

        if not completed_edu and not all_edu:
            checks.append(
                EligibilityCheck(
                    rule="education", passed=False, detail="No education records found."
                )
            )
        else:
            required_rank = (
                _edu_level_rank(ec.min_qualification_level)
                if ec.min_qualification_level
                else 0
            )

            highest_completed = (
                sorted(completed_edu, key=lambda e: _edu_level_rank(e.level), reverse=True)[0]
                if completed_edu
                else None
            )
            completed_level_ok = (
                highest_completed is not None
                and _edu_level_rank(highest_completed.level) >= required_rank
            )

            if not completed_level_ok:
                appearing_match = next(
                    (
                        e
                        for e in all_edu
                        if not e.is_completed and _edu_level_rank(e.level) >= required_rank
                    ),
                    None,
                )
                if appearing_match is not None:
                    is_conditional = True
                    checks.append(
                        EligibilityCheck(
                            rule="education",
                            passed=False,
                            detail=(
                                f"Conditionally eligible: currently appearing in "
                                f"{appearing_match.level} "
                                f"({appearing_match.degree or 'degree not specified'}). "
                                f"Full eligibility confirmed on completion of "
                                f"{ec.min_qualification_level or 'required qualification'}."
                            ),
                        )
                    )
                else:
                    if highest_completed is not None:
                        detail = (
                            f"Education level {highest_completed.level} is below required "
                            f"{ec.min_qualification_level}."
                        )
                    else:
                        detail = "No completed education meets the requirement."
                    checks.append(
                        EligibilityCheck(rule="education", passed=False, detail=detail)
                    )
            else:
                edu = highest_completed
                assert edu is not None  # for type-checkers

                marks_ok = True
                marks_detail = ""
                if ec.min_percentage is not None:
                    user_pct = (
                        edu.percentage
                        if edu.percentage is not None
                        else (edu.cgpa * 10 if edu.cgpa is not None else None)
                    )
                    if user_pct is None:
                        marks_ok = False
                        marks_detail = (
                            f"Minimum {ec.min_percentage}% required but marks not recorded."
                        )
                    elif user_pct < ec.min_percentage:
                        marks_ok = False
                        marks_detail = (
                            f"Score {user_pct}% is below the required {ec.min_percentage}%."
                        )
                    else:
                        marks_detail = (
                            f"Score {user_pct}% meets the required {ec.min_percentage}%."
                        )

                discipline_ok = True
                discipline_detail = ""
                if ec.allowed_disciplines and len(ec.allowed_disciplines) > 0:
                    user_stream = (edu.stream or "").lower()
                    user_degree = (edu.degree or "").lower()
                    flat: list[str] = []
                    for v in ec.allowed_disciplines.values():
                        if isinstance(v, list):
                            flat.extend(str(x).lower() for x in v)
                        elif isinstance(v, str):
                            flat.append(v.lower())
                    matched = any(d in user_stream or d in user_degree for d in flat)
                    if not matched:
                        discipline_ok = False
                        discipline_detail = (
                            f"Your stream/degree ({edu.stream or edu.degree or 'unknown'}) "
                            f"is not in the allowed disciplines."
                        )
                    else:
                        discipline_detail = (
                            f"Discipline {edu.stream or edu.degree} is accepted."
                        )

                passed = marks_ok and discipline_ok
                detail = " ".join(
                    s
                    for s in [
                        f"Education level {edu.level} meets requirement of "
                        f"{ec.min_qualification_level or 'any'}.",
                        marks_detail,
                        discipline_detail,
                    ]
                    if s
                )
                checks.append(EligibilityCheck(rule="education", passed=passed, detail=detail))

    # ── 3. Attempt limit ────────────────────────────────────────────────────
    if criteria.attempt_limits:
        user_category = (profile.category or "general").lower()
        record = next(
            (a for a in exam_attempts if a.recruitment_id == criteria.recruitment_id), None
        )
        attempts_used = record.attempts_used if record else 0

        applicable = next(
            (
                limit
                for limit in criteria.attempt_limits
                if (limit.category or "").lower() == user_category
            ),
            None,
        ) or next((limit for limit in criteria.attempt_limits if limit.category is None), None)

        if applicable is not None and applicable.max_attempts is not None:
            max_attempts = applicable.max_attempts
            passed = attempts_used < max_attempts
            checks.append(
                EligibilityCheck(
                    rule="attempts",
                    passed=passed,
                    detail=(
                        f"{attempts_used} of {max_attempts} attempts used."
                        if passed
                        else f"Attempt limit reached: {attempts_used}/{max_attempts} "
                        f"for category {user_category}."
                    ),
                )
            )

    # ── 4. Required exam credentials ────────────────────────────────────────
    if criteria.required_exam_keys:
        user_keys = {(c.exam_key or "").lower().strip() for c in exam_credentials}
        missing = [
            k for k in criteria.required_exam_keys if k.lower().strip() not in user_keys
        ]
        checks.append(
            EligibilityCheck(
                rule="exam_credential",
                passed=len(missing) == 0,
                detail=(
                    f"Required exam credentials present "
                    f"({', '.join(criteria.required_exam_keys)})."
                    if not missing
                    else f"Missing required exam credentials: {', '.join(missing)}."
                ),
                )
            )

    # ── 5. Certification criteria ──────────────────────────────────────────
    if criteria.certification_criteria:
        user_names = {((c.get("certification_name") if isinstance(c, dict) else getattr(c, "certification_name", None)) or "").strip().lower() for c in user_certs}
        for cc in criteria.certification_criteria:
            target = (cc.name or "").strip().lower()
            aliases = {(a or "").strip().lower() for a in (cc.aliases or [])}
            matched = bool(target and target in user_names) or bool(aliases.intersection(user_names))
            if cc.mandatory:
                checks.append(EligibilityCheck(rule="certification", passed=matched, detail=(f"Required certification matched: {cc.name}." if matched else f"Missing required certification: {cc.name or 'unspecified'}.")))
            else:
                checks.append(EligibilityCheck(rule="certification_optional", passed=True, detail=f"Optional certification: {cc.name or 'unspecified'}."))

    # ── 5. Nationality ──────────────────────────────────────────────────────
    nationality = (profile.nationality or "indian").lower()
    nationality_ok = nationality == "indian"
    checks.append(
        EligibilityCheck(
            rule="nationality",
            passed=nationality_ok,
            detail=(
                "Indian nationality confirmed."
                if nationality_ok
                else "Only Indian nationals are eligible."
            ),
        )
    )

    # ── 6. Domicile / state PSC ─────────────────────────────────────────────
    if criteria.org_state:
        user_state = (profile.domicile_state or "").lower().strip()
        post_state = criteria.org_state.lower().strip()
        domicile_ok = user_state == post_state
        checks.append(
            EligibilityCheck(
                rule="domicile",
                passed=domicile_ok,
                detail=(
                    f"Domicile state {profile.domicile_state} matches the recruiting state."
                    if domicile_ok
                    else (
                        f"This post is for {criteria.org_state} domicile only. "
                        f"Your domicile state is {profile.domicile_state or 'not set'}."
                    )
                ),
            )
        )

    # ── Aggregate ───────────────────────────────────────────────────────────
    failed_checks = [c for c in checks if not c.passed]
    is_eligible = len(failed_checks) == 0
    non_edu_failures = [
        c for c in failed_checks if c.rule not in ("education", "exam_credential")
    ]
    final_conditional = is_conditional and not non_edu_failures and not is_eligible

    return EligibilityCheckResult(
        is_eligible=is_eligible,
        is_conditional=final_conditional,
        checks=checks,
        fail_reasons=[c.detail for c in failed_checks],
    )


def check_eligibility_batch(
    profile: UserProfile,
    education: list[UserEducation],
    exam_attempts: list[UserExamAttempts],
    exam_credentials: list[UserExamCredential],
    post_criteria_list: list[PostCriteria],
    user_certifications: list[UserCertification] | None = None,
) -> list[BatchEligibilityResult]:
    return [
        BatchEligibilityResult(
            post_id=pc.post_id,
            recruitment_id=pc.recruitment_id,
            result=check_eligibility(profile, education, exam_attempts, exam_credentials, pc, user_certifications=user_certifications),
        )
        for pc in post_criteria_list
    ]
    user_certs: list[UserCertification] = getattr(profile, "_user_certifications", []) or []
