from __future__ import annotations

import logging
from pydantic import ValidationError

from app.db.utils import require_select, safe_select
from app.core.errors import ValidationError as DomainValidationError
from app.profile.eligibility_profile import (
    AttemptRow,
    CertificationRow,
    CredentialRow,
    EducationRow,
    EligibilityProfile,
    ExperienceRow,
    Identity,
    Location,
    Preferences,
    Reservations,
)

logger = logging.getLogger("career_copilot.profile.eligibility_mapper")


def _meaningful_pwbd_value(raw) -> str | None:
    """Return the PwBD value when it carries information, else ``None``.

    The legacy ``profiles.pwbd_status`` column defaults to the string
    ``'none'``, which is *truthy* in Python — so a plain ``bool(...)`` check
    on it incorrectly classifies every default user as PwD. Treat the
    common "absent" sentinels (`None`, empty, ``'none'``, ``'false'``,
    ``'no'``) as missing.
    """
    if raw is None:
        return None
    text = str(raw).strip()
    if not text:
        return None
    if text.lower() in {"none", "false", "no"}:
        return None
    return text


def build_user_eligibility_profile(supabase, user_id: str) -> EligibilityProfile:
    p = (require_select(supabase, "profiles", "*", id=user_id) or [{}])[0]
    loc = (require_select(supabase, "aspirant_location", "state,district,is_rural,domicile_certificate", user_id=user_id) or [{}])[0]
    res = (require_select(supabase, "aspirant_reservations", "category,sub_category,is_pwd,pwd_type,disability_code,is_ex_serviceman,family_income_annual,ews_assets,ews_certificate_available", user_id=user_id) or [{}])[0]
    profile_pwbd = _meaningful_pwbd_value(p.get("pwbd_status"))
    edu = require_select(supabase, "aspirant_education", "level,degree,stream,graduation_year,percentage,cgpa,cgpa_basis,is_completed", user_id=user_id)
    certs = safe_select(supabase, "aspirant_certifications", "certification_name,issuing_body,year_completed,is_active", user_id=user_id)
    exp = safe_select(supabase, "aspirant_experience", "sector,role,organization,start_date,end_date,years_experience", user_id=user_id)
    prefs = (safe_select(supabase, "aspirant_preferences", "target_exams,preferred_states,preferred_sectors,willing_to_relocate,study_mode,study_hours_per_day,languages_known,preferred_language", user_id=user_id) or [{}])[0]
    attempts = safe_select(supabase, "aspirant_exam_attempts", "exam_id,exam_ref_id,attempts_used", user_id=user_id)
    creds = safe_select(supabase, "aspirant_exam_credentials", "exam_key,score,percentile,rank_text,exam_year", user_id=user_id)
    identity = Identity(full_name=p.get("full_name"), dob=p.get("dob") or p.get("date_of_birth"), nationality=p.get("nationality"))
    if not identity.dob:
        raise DomainValidationError("Invalid critical profile identity: missing dob/date_of_birth")
    location = Location(state=loc.get("state") or p.get("domicile_state"), district=loc.get("district"))
    reservations = Reservations(
        category=res.get("category") or p.get("category"),
        is_pwd=bool(res.get("is_pwd") or profile_pwbd),
        pwd_type=res.get("pwd_type") or profile_pwbd,
        disability_code=res.get("disability_code") or res.get("pwd_type") or profile_pwbd,
        is_ex_serviceman=bool(res.get("is_ex_serviceman") if res.get("is_ex_serviceman") is not None else p.get("ex_serviceman")),
        service_years=p.get("service_years"),
        govt_employee=bool(p.get("govt_employee")),
        family_income_annual=res.get("family_income_annual"),
        ews_assets=res.get("ews_assets") or {},
        ews_certificate_available=res.get("ews_certificate_available"),
    )
    education_rows = []
    for row in edu:
        try:
            education_rows.append(EducationRow(**row))
        except ValidationError as exc:
            logger.warning("eligibility_mapper skip education row for user=%s: %s", user_id, exc)
    cert_rows, cert_seen = [], set()
    for row in certs:
        if not row.get("is_active", True):
            continue
        row = {**row, "certification_name": (row.get("certification_name") or "").strip().lower()}
        key = ((row.get("certification_name") or "").strip().lower(), (row.get("issuing_body") or "").strip().lower())
        if key in cert_seen:
            continue
        cert_seen.add(key)
        cert_rows.append(CertificationRow(**row))
    exp_rows = []
    for row in exp:
        try:
            exp_rows.append(ExperienceRow(**row))
        except ValidationError as exc:
            logger.warning("eligibility_mapper skip experience row for user=%s: %s", user_id, exc)
    attempt_rows, attempt_seen = [], set()
    for row in attempts:
        # Prefer the canonical FK to `exams.id` (added by migration 030).
        # Fall back to the legacy free-form `exam_id` text the UI wrote in
        # earlier deploys. The runner already de-prioritises the legacy
        # value when constructing the engine-shaped UserExamAttempts.
        key = str(row.get("exam_ref_id") or row.get("exam_id") or "").strip().lower()
        if not key or key in attempt_seen:
            continue
        try:
            attempt_rows.append(
                AttemptRow(
                    exam_id=key,
                    exam_ref_id=str(row.get("exam_ref_id") or "").strip().lower() or None,
                    attempts_used=row.get("attempts_used") or 0,
                )
            )
            attempt_seen.add(key)
        except ValidationError as exc:
            logger.warning("eligibility_mapper skip attempt row for user=%s: %s", user_id, exc)
    cred_rows, cred_seen = [], set()
    for row in creds:
        key = (str(row.get("exam_key") or "").strip().lower(), row.get("exam_year"))
        if not key[0] or key in cred_seen:
            continue
        cred_seen.add(key)
        cred_rows.append(CredentialRow(exam_key=key[0], exam_year=row.get("exam_year")))
    return EligibilityProfile(
        user_id=user_id,
        identity=identity,
        location=location,
        reservations=reservations,
        education=education_rows,
        certifications=cert_rows,
        experience=exp_rows,
        preferences=Preferences(
            target_exams=prefs.get("target_exams") or [],
            preferred_states=prefs.get("preferred_states") or [],
            preferred_sectors=prefs.get("preferred_sectors") or [],
            willing_to_relocate=prefs.get("willing_to_relocate"),
            study_mode=prefs.get("study_mode"),
            languages_known=prefs.get("languages_known") or [],
            preferred_language=prefs.get("preferred_language"),
        ),
        attempts=attempt_rows,
        credentials=cred_rows,
    )
