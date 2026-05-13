"""Pydantic models for the eligibility engine.

Mirrors the TypeScript shapes from the reference repo
(`UI-career-copilot/lib/eligibility/engine.ts`). Optional fields use
``None`` to match the TS ``T | null`` semantics so the port is
behaviour-equivalent.

The validators here enforce the inputs the deterministic engine assumes
(non-negative attempt counts, parseable ISO cutoff dates, in-range
percentages, etc.). Bad canonical data raises at the boundary rather
than producing a surprising verdict downstream.
"""
from __future__ import annotations

from datetime import date as _date
from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator, model_validator


AttemptScope = Literal["exam_family", "recruitment", "post"]


class _Base(BaseModel):
    # Kept permissive so callers can pass Supabase row dicts that carry
    # extra columns (`post_id` on `age_criteria`, etc.) without explicit
    # filtering. Validators below enforce the values that actually matter
    # for the engine.
    model_config = ConfigDict(extra="ignore")


def _coerce_optional_iso_date(value: Any) -> Any:
    """Validator-friendly: accept ``None`` / ISO date string / ``date``-ish input."""
    if value is None:
        return None
    if isinstance(value, _date):
        return value.isoformat()
    if isinstance(value, str):
        text = value.strip()
        if not text:
            return None
        # Accept ``YYYY-MM-DD`` or full ISO timestamps; the engine's
        # ``_parse_iso_date`` handles both. Just sanity-check the prefix
        # so obviously bad strings raise at the boundary.
        head = text.split("T", 1)[0]
        try:
            _date.fromisoformat(head)
        except (TypeError, ValueError) as exc:
            raise ValueError(f"cutoff_date must be ISO-formatted (YYYY-MM-DD): {value!r}") from exc
        return text
    raise ValueError(f"cutoff_date must be a string or null, got {type(value).__name__}")


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
    languages_known: list[str] = Field(default_factory=list)
    family_income_annual: float | None = None
    ews_certificate_available: bool | None = None

    @field_validator("service_years")
    @classmethod
    def _non_negative_service_years(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if int(v) < 0:
            raise ValueError("service_years must be non-negative")
        return int(v)


class UserEducation(_Base):
    level: str
    degree: str | None = None
    stream: str | None = None
    percentage: float | None = None
    cgpa: float | None = None
    is_completed: bool = False

    @field_validator("percentage")
    @classmethod
    def _percentage_in_range(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not (0.0 <= float(v) <= 100.0):
            raise ValueError("percentage must be between 0 and 100")
        return float(v)

    @field_validator("cgpa")
    @classmethod
    def _cgpa_in_range(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not (0.0 <= float(v) <= 10.0):
            raise ValueError("cgpa must be between 0 and 10")
        return float(v)


class UserExamCredential(_Base):
    exam_key: str


class UserCertification(_Base):
    certification_name: str
    issuing_body: str | None = None


class UserExamAttempts(_Base):
    """Scope-aware attempt count for one user.

    The engine looks up the right row per ``AttemptLimit`` by matching
    ``attempt_scope`` and the corresponding identifier(s):

    * ``attempt_scope='exam_family'`` → match on ``exam_id`` against the
      recruitment's exam-family id. Sourced from
      ``aspirant_exam_attempts``.
    * ``attempt_scope='recruitment'`` → match on ``recruitment_id``.
      Sourced from ``aspirant_recruitment_attempts`` with
      ``post_id is null``.
    * ``attempt_scope='post'`` → match on ``recruitment_id``+``post_id``.
      Sourced from ``aspirant_recruitment_attempts`` with
      ``post_id is not null``.

    Backwards compatibility: legacy callers that only set
    ``recruitment_id`` still construct a valid model — they get
    ``attempt_scope='exam_family'`` and the engine's exam-family lookup
    falls back to the first available record when neither side has an
    explicit ``exam_id``.
    """

    attempt_scope: AttemptScope = "exam_family"
    exam_id: str | None = None
    recruitment_id: str | None = None
    post_id: str | None = None
    attempts_used: int = 0

    @field_validator("attempts_used")
    @classmethod
    def _non_negative_attempts(cls, v: int) -> int:
        if int(v) < 0:
            raise ValueError("attempts_used must be non-negative")
        return int(v)


class AgeCriteria(_Base):
    min_age: int | None = None
    max_age: int | None = None
    cutoff_date: str | None = None

    @field_validator("min_age", "max_age")
    @classmethod
    def _non_negative_age(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if int(v) < 0:
            raise ValueError("age must be non-negative")
        return int(v)

    @field_validator("cutoff_date", mode="before")
    @classmethod
    def _validate_cutoff(cls, v: Any) -> Any:
        return _coerce_optional_iso_date(v)

    @model_validator(mode="after")
    def _min_le_max(self) -> "AgeCriteria":
        if self.min_age is not None and self.max_age is not None and self.min_age > self.max_age:
            raise ValueError(
                f"min_age ({self.min_age}) cannot exceed max_age ({self.max_age})"
            )
        return self


class AgeRelaxationRule(_Base):
    reservation_category: str | None = None
    condition_key: str | None = None
    additional_years: int = 0
    max_age_cap: int | None = None
    cumulative: bool = False
    source_note: str | None = None

    @field_validator("additional_years")
    @classmethod
    def _non_negative_additional_years(cls, v: int) -> int:
        if int(v) < 0:
            raise ValueError("additional_years must be non-negative")
        return int(v)

    @field_validator("max_age_cap")
    @classmethod
    def _non_negative_max_age_cap(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if int(v) < 0:
            raise ValueError("max_age_cap must be non-negative")
        return int(v)


class EducationCriteria(_Base):
    min_qualification_level: str | None = None
    min_percentage: float | None = None
    allowed_disciplines: dict[str, Any] | None = None
    allow_higher_qualification: bool = True
    accepted_equivalent_qualifications: list[Any] = Field(default_factory=list)
    raw_requirement_text: str | None = None

    @field_validator("min_percentage")
    @classmethod
    def _min_percentage_in_range(cls, v: float | None) -> float | None:
        if v is None:
            return None
        if not (0.0 <= float(v) <= 100.0):
            raise ValueError("min_percentage must be between 0 and 100")
        return float(v)


class DisabilityRequirement(_Base):
    disability_code: str | None = None
    physical_requirement_code: str | None = None
    suitable: bool = True
    source_note: str | None = None


class AttemptLimit(_Base):
    category: str | None = None
    max_attempts: int | None = None
    # Picks which ``UserExamAttempts`` record the engine should consult for
    # this limit. See ``UserExamAttempts`` for the matching contract.
    # Default ``'exam_family'`` matches the legacy semantics where every
    # cap was implicitly exam-family-scoped.
    attempt_scope: AttemptScope = "exam_family"

    @field_validator("max_attempts")
    @classmethod
    def _non_negative_max_attempts(cls, v: int | None) -> int | None:
        if v is None:
            return None
        if int(v) < 0:
            raise ValueError("max_attempts must be non-negative")
        return int(v)


class CertificationCriteria(_Base):
    mandatory: bool = True
    name: str | None = None
    issuer: str | None = None
    aliases: list[str] = Field(default_factory=list)


class PostCriteria(_Base):
    post_id: str
    recruitment_id: str
    # ``recruitments.exam_id`` (FK to ``exams.id``) — exam-family back-link
    # added by migration 050. The engine compares this with
    # ``UserExamAttempts.exam_id`` to route exam-family-scoped attempt
    # caps. Nullable for recruitments that pre-date the back-link.
    recruitment_exam_id: str | None = None
    age_criteria: AgeCriteria | None = None
    education_criteria: EducationCriteria | None = None
    attempt_limits: list[AttemptLimit] = Field(default_factory=list)
    org_state: str | None = None
    requires_domicile: bool = False
    required_exam_keys: list[str] = Field(default_factory=list)
    certification_criteria: list[CertificationCriteria] = Field(default_factory=list)
    language_requirements: list[str] = Field(default_factory=list)
    disability_requirements: list[DisabilityRequirement] = Field(default_factory=list)
    age_relaxation_rules: list[AgeRelaxationRule] = Field(default_factory=list)


# ─── Output shapes ───────────────────────────────────────────────────────────


class EligibilityCheck(_Base):
    rule: str
    passed: bool
    detail: str
    # True when the failure represents a missing/unverifiable input rather
    # than a rule violation (e.g. invalid cutoff_date, missing nationality,
    # ex-serviceman without service_years). Aggregated into
    # ``EligibilityCheckResult.is_conditional`` so callers can distinguish
    # "ask the user / fix the data" from "hard disqualification".
    is_unverifiable: bool = False


class EligibilityCheckResult(_Base):
    is_eligible: bool
    is_conditional: bool
    checks: list[EligibilityCheck] = Field(default_factory=list)
    fail_reasons: list[str] = Field(default_factory=list)


class BatchEligibilityResult(_Base):
    post_id: str
    recruitment_id: str
    result: EligibilityCheckResult
