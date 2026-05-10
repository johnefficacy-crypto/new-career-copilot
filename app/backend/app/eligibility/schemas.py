"""Pydantic models for the eligibility engine.

Mirrors the TypeScript shapes from the reference repo
(`UI-career-copilot/lib/eligibility/engine.ts`). Optional fields use
``None`` to match the TS ``T | null`` semantics so the port is
behaviour-equivalent.
"""
from __future__ import annotations

from typing import Any

from pydantic import BaseModel, ConfigDict


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


# ─── Input shapes ────────────────────────────────────────────────────────────


class UserProfile(_Base):
    id: str
    dob: str | None = None
    date_of_birth: str | None = None
    category: str | None = None
    pwbd_status: str | None = None
    ex_serviceman: bool = False
    service_years: int | None = None
    govt_employee: bool = False
    domicile_state: str | None = None
    nationality: str | None = None
    disability_code: str | None = None
    languages_known: list[str] = []
    family_income_annual: float | None = None
    ews_certificate_available: bool | None = None


class UserEducation(_Base):
    level: str
    degree: str | None = None
    stream: str | None = None
    percentage: float | None = None
    cgpa: float | None = None
    is_completed: bool = False


class UserExamCredential(_Base):
    exam_key: str


class UserCertification(_Base):
    certification_name: str
    issuing_body: str | None = None


class UserExamAttempts(_Base):
    recruitment_id: str
    attempts_used: int = 0


class AgeCriteria(_Base):
    min_age: int | None = None
    max_age: int | None = None
    cutoff_date: str | None = None


class AgeRelaxationRule(_Base):
    reservation_category: str | None = None
    condition_key: str | None = None
    additional_years: int = 0
    max_age_cap: int | None = None
    cumulative: bool = False
    source_note: str | None = None


class EducationCriteria(_Base):
    min_qualification_level: str | None = None
    min_percentage: float | None = None
    allowed_disciplines: dict[str, Any] | None = None
    allow_higher_qualification: bool = True
    accepted_equivalent_qualifications: list[Any] = []
    raw_requirement_text: str | None = None


class DisabilityRequirement(_Base):
    disability_code: str | None = None
    physical_requirement_code: str | None = None
    suitable: bool = True
    source_note: str | None = None


class AttemptLimit(_Base):
    category: str | None = None
    max_attempts: int | None = None


class CertificationCriteria(_Base):
    mandatory: bool = True
    name: str | None = None
    issuer: str | None = None
    aliases: list[str] = []


class PostCriteria(_Base):
    post_id: str
    recruitment_id: str
    age_criteria: AgeCriteria | None = None
    education_criteria: EducationCriteria | None = None
    attempt_limits: list[AttemptLimit] = []
    org_state: str | None = None
    required_exam_keys: list[str] = []
    certification_criteria: list[CertificationCriteria] = []
    language_requirements: list[str] = []
    disability_requirements: list[DisabilityRequirement] = []
    age_relaxation_rules: list[AgeRelaxationRule] = []


# ─── Output shapes ───────────────────────────────────────────────────────────


class EligibilityCheck(_Base):
    rule: str
    passed: bool
    detail: str


class EligibilityCheckResult(_Base):
    is_eligible: bool
    is_conditional: bool
    checks: list[EligibilityCheck]
    fail_reasons: list[str]


class BatchEligibilityResult(_Base):
    post_id: str
    recruitment_id: str
    result: EligibilityCheckResult
