from __future__ import annotations

from pydantic import BaseModel, ConfigDict, Field, field_validator


class _Base(BaseModel):
    model_config = ConfigDict(extra="ignore")


class Identity(_Base):
    full_name: str | None = None
    dob: str | None = None
    nationality: str | None = None


class Location(_Base):
    state: str | None = None
    district: str | None = None


class Reservations(_Base):
    category: str | None = None
    is_pwd: bool = False
    pwd_type: str | None = None
    disability_code: str | None = None
    is_ex_serviceman: bool = False
    service_years: int | None = None
    govt_employee: bool = False
    family_income_annual: float | None = None
    ews_assets: dict = Field(default_factory=dict)
    ews_certificate_available: bool | None = None

    @field_validator("category", mode="before")
    @classmethod
    def _norm_cat(cls, v):
        return (str(v).strip().lower() or None) if v is not None else None

    @field_validator("service_years", mode="before")
    @classmethod
    def _norm_service_years(cls, v):
        if v is None or v == "":
            return None
        try:
            iv = int(v)
        except (TypeError, ValueError):
            return None
        return iv if iv >= 0 else None


class EducationRow(_Base):
    level: str
    degree: str | None = None
    stream: str | None = None
    graduation_year: int | None = None
    percentage: float | None = None
    cgpa: float | None = None
    is_completed: bool = False

    @field_validator("percentage")
    @classmethod
    def _pct(cls, v):
        if v is None:
            return v
        if not (0 <= float(v) <= 100):
            raise ValueError("percentage out of range")
        return float(v)

    @field_validator("cgpa")
    @classmethod
    def _cgpa(cls, v):
        if v is None:
            return v
        if not (0 <= float(v) <= 10):
            raise ValueError("cgpa out of range")
        return float(v)


class CertificationRow(_Base):
    certification_name: str
    issuing_body: str | None = None
    is_active: bool = True


class ExperienceRow(_Base):
    years_experience: float | None = None

    @field_validator("years_experience")
    @classmethod
    def _yrs(cls, v):
        if v is None:
            return v
        if float(v) < 0:
            raise ValueError("years_experience must be non-negative")
        return float(v)


class Preferences(_Base):
    target_exams: list[str] = Field(default_factory=list)
    preferred_states: list[str] = Field(default_factory=list)
    preferred_sectors: list[str] = Field(default_factory=list)
    willing_to_relocate: bool | None = None
    study_mode: str | None = None
    languages_known: list[str] = Field(default_factory=list)
    preferred_language: str | None = None


class AttemptRow(_Base):
    # Engine-side identity for an exam-family attempt count. Prefer the
    # canonical FK to ``public.exams`` (``exam_ref_id``) when available;
    # legacy ``exam_id`` is the free-form text the older UI wrote.
    exam_id: str
    exam_ref_id: str | None = None
    attempts_used: int = 0

    @field_validator("attempts_used")
    @classmethod
    def _attempts(cls, v):
        v = int(v)
        if v < 0:
            raise ValueError("attempts_used must be non-negative")
        return v


class CredentialRow(_Base):
    exam_key: str
    exam_year: int | None = None


class EligibilityProfile(_Base):
    user_id: str
    identity: Identity
    location: Location
    reservations: Reservations
    education: list[EducationRow] = Field(default_factory=list)
    certifications: list[CertificationRow] = Field(default_factory=list)
    experience: list[ExperienceRow] = Field(default_factory=list)
    preferences: Preferences = Field(default_factory=Preferences)
    attempts: list[AttemptRow] = Field(default_factory=list)
    credentials: list[CredentialRow] = Field(default_factory=list)
