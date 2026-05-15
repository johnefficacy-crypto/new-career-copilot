"""Pydantic shapes for the jsonb columns on ``recruitment_verification_reports``.

Three jsonb columns are validated through this module:

* ``risk_flags`` — list of :class:`RiskFlag`.
* ``conflicts`` — list of :class:`VerificationConflict`.
* ``evidence_summary`` — dict mapping ``key → EvidenceSummaryItem``.

Raw jsonb writes are forbidden. Every service path that touches these
columns runs the payload through the validators here first; an invalid
shape raises ``pydantic.ValidationError`` before the write reaches the
DB. This keeps the gateway's JSON columns analysable without a schema
migration each time a new evidence kind shows up.
"""
from __future__ import annotations

from typing import Any, Literal

from pydantic import BaseModel, ConfigDict, Field, TypeAdapter


BlockingLevel = Literal[
    "promotion_blocker",
    "publish_blocker",
    "conditional_result_allowed",
    "warning",
]

# RiskFlag has a narrower set than the full eligibility-complexity signal —
# only flags that gate report-level promotion/publish decisions appear
# here. ``conditional_result_allowed`` is part of the complexity contract
# (PR4) and is not a RiskFlag blocking level for PR1.
RiskFlagBlockingLevel = Literal["promotion_blocker", "publish_blocker", "warning"]


class RiskFlag(BaseModel):
    model_config = ConfigDict(extra="forbid")

    flag: str = Field(min_length=1)
    field_key: str | None = None
    source_field_path: str | None = None
    blocking_level: RiskFlagBlockingLevel
    evidence_summary_key: str | None = None


class ConflictValue(BaseModel):
    model_config = ConfigDict(extra="forbid")

    source: str = Field(min_length=1)
    value: Any
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


class VerificationConflict(BaseModel):
    model_config = ConfigDict(extra="forbid")

    conflict_key: str = Field(min_length=1)
    field_path: str = Field(min_length=1)
    values: list[ConflictValue] = Field(min_length=1)
    status: Literal["open", "resolved_by_admin", "ignored"] = "open"


class EvidenceSummaryItem(BaseModel):
    model_config = ConfigDict(extra="forbid")

    key: str = Field(min_length=1)
    field_path: str | None = None
    source_url: str | None = None
    snippet: str | None = None
    confidence: float | None = Field(default=None, ge=0.0, le=1.0)


# Validators reused for the full jsonb payloads. ``TypeAdapter`` lets us
# validate list/dict shapes without wrapping them in a container model.
_RISK_FLAGS_ADAPTER = TypeAdapter(list[RiskFlag])
_CONFLICTS_ADAPTER = TypeAdapter(list[VerificationConflict])
_EVIDENCE_ADAPTER = TypeAdapter(dict[str, EvidenceSummaryItem])


def validate_risk_flags(value: Any) -> list[dict[str, Any]]:
    """Validate a ``risk_flags`` jsonb payload, return the canonical dict form."""
    flags = _RISK_FLAGS_ADAPTER.validate_python(value if value is not None else [])
    return [f.model_dump(exclude_none=True) for f in flags]


def validate_conflicts(value: Any) -> list[dict[str, Any]]:
    """Validate a ``conflicts`` jsonb payload, return the canonical dict form."""
    conflicts = _CONFLICTS_ADAPTER.validate_python(value if value is not None else [])
    return [c.model_dump(exclude_none=True) for c in conflicts]


def validate_evidence_summary(value: Any) -> dict[str, dict[str, Any]]:
    """Validate an ``evidence_summary`` jsonb payload, return the canonical dict form.

    Two acceptable inputs:

    * dict mapping ``key → EvidenceSummaryItem-shape`` (canonical).
    * empty dict / None (default).

    Every item must carry ``key`` equal to its mapping key. Mismatches
    are rejected so a downstream reader can rely on either projection.
    """
    if value is None or value == {}:
        return {}
    if not isinstance(value, dict):
        raise TypeError("evidence_summary must be a mapping")
    # Backfill ``key`` from the mapping key when callers omit it (common
    # ergonomics improvement: writers shouldn't have to repeat the key).
    coerced: dict[str, Any] = {}
    for k, v in value.items():
        if not isinstance(v, dict):
            coerced[k] = v
            continue
        item = dict(v)
        item.setdefault("key", k)
        if item.get("key") != k:
            raise ValueError(f"evidence_summary item under '{k}' has mismatched key '{item.get('key')}'")
        coerced[k] = item
    items = _EVIDENCE_ADAPTER.validate_python(coerced)
    return {k: items[k].model_dump(exclude_none=True) for k in items}


__all__ = [
    "RiskFlag",
    "ConflictValue",
    "VerificationConflict",
    "EvidenceSummaryItem",
    "validate_risk_flags",
    "validate_conflicts",
    "validate_evidence_summary",
]
