"""Allowlisted canonical profile writes for the unified engine.

``onboarding_session_answers`` is a log, not truth. Canonical profile
data is only ever written here, and only through a tiny allowlist:

* ``persona_question_bank`` answers reuse the existing PR2 adapter
  (:func:`app.persona_questions.profile_adapter.apply_safe_profile_mapping`).
* ``recruitment_question_requirements`` answers write a small allowlist of
  non-sensitive canonical fields, and never overwrite an existing value.
* ``intent_picker`` answers are never canonical — intent lives on the
  session row only.

Rules enforced here:
  * Anonymous callers (no ``user_id``) get no canonical write at all.
  * Sensitive fields (reservation/category/income/EWS/disability/PwBD/
    ex-serviceman/...) are never written by this adapter.
  * Existing non-empty canonical values are preserved.
  * Each allowlisted recruitment answer can mirror into multiple canonical
    tables (e.g. ``domicile_state`` → ``profiles.domicile_state`` AND
    ``aspirant_location.state``) so eligibility consumers see the value
    no matter which table they read from.
  * Writes are idempotent — repeat answers do not create duplicate rows
    or churn the value.
  * Optional provenance is appended to ``profiles.metadata.onboarding_provenance``
    so future product decisions can distinguish onboarding-supplied from
    manually-edited facts.
  * A failure here never blocks the answer save.

Criteria for adding a new ``field_key`` to ``_RECRUITMENT_FIELD_ALLOWLIST``:
  1. ``candidate_field_registry`` has an explicit ``(profile_table, profile_column)``
     pair for it AND that pair is read by ``profile/eligibility_mapper.py``.
  2. The field is non-sensitive (does not match ``SENSITIVE_MARKERS``).
  3. A pure transformer can validate/coerce the answer to the canonical
     column's type — silent garbage writes are forbidden.
  4. The target table is either profile-scoped (``profiles``,
     ``aspirant_location``, ``aspirant_reservations``, ``aspirant_preferences``)
     where ``user_id`` is unique and upsert is well-defined. Multi-row
     tables (``aspirant_education``, ``aspirant_experience``,
     ``aspirant_certifications``) need explicit row-selection logic
     before they can be added — they are intentionally not supported in
     this initial allowlist.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from datetime import date, datetime, timezone
from typing import Any, Callable

from app.onboarding_unified.question_selector import SENSITIVE_MARKERS
from app.persona_questions.profile_adapter import apply_safe_profile_mapping

logger = logging.getLogger("career_copilot.onboarding_unified.profile_adapter")


def _coerce_text(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    return text or None


def _coerce_date(value: Any) -> str | None:
    if value is None:
        return None
    text = str(value).strip()
    if not text:
        return None
    try:
        date.fromisoformat(text[:10])
    except ValueError:
        return None
    return text[:10]


@dataclass(frozen=True)
class _RecruitmentMapping:
    # Every (table, column) the value should be mirrored to. The first
    # entry conventionally lives on ``profiles``; subsequent entries are
    # the normalized aspirant_* mirrors that some eligibility consumers
    # read from.
    targets: tuple[tuple[str, str], ...]
    transform: Callable[[Any], Any] | None = None


# Recruitment field_keys promoted to canonical profile tables. Intentionally
# small — see the module docstring for the criteria each new entry must
# meet before being added.
_RECRUITMENT_FIELD_ALLOWLIST: dict[str, _RecruitmentMapping] = {
    "date_of_birth": _RecruitmentMapping(
        targets=(("profiles", "date_of_birth"),),
        transform=_coerce_date,
    ),
    "domicile_state": _RecruitmentMapping(
        targets=(
            ("profiles", "domicile_state"),
            ("aspirant_location", "state"),
        ),
        transform=_coerce_text,
    ),
}


# Tables where ``user_id`` (or ``id`` for ``profiles``) is the natural single
# row per user. Writes use a select-then-update-or-insert pattern keyed by
# the column shown here.
_PROFILE_SCOPED_TABLES: dict[str, str] = {
    "profiles": "id",
    "aspirant_location": "user_id",
    "aspirant_reservations": "user_id",
    "aspirant_preferences": "user_id",
}


def _safe(call: Callable[[], Any], default: Any = None) -> Any:
    try:
        return call()
    except Exception as exc:  # noqa: BLE001
        logger.warning("onboarding_unified.profile_adapter call failed: %s", exc)
        return default


def _field_is_sensitive(field_key: str | None, registry_row: dict[str, Any] | None) -> bool:
    haystack = " ".join(
        str(v or "").lower()
        for v in (
            field_key,
            (registry_row or {}).get("profile_group"),
            (registry_row or {}).get("canonical_label"),
        )
    )
    return any(marker in haystack for marker in SENSITIVE_MARKERS)


def _read_existing(
    supabase: Any, table: str, key_col: str, user_id: str, column: str
) -> tuple[bool, Any]:
    """Return (row_exists, current_value). On read failure assume no row."""
    rows = _safe(
        lambda: (
            supabase.table(table)
            .select(f"{key_col}, {column}")
            .eq(key_col, user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows:
        return False, None
    return True, rows[0].get(column)


def _write_canonical(
    supabase: Any, user_id: str, table: str, column: str, value: Any
) -> dict[str, Any]:
    key_col = _PROFILE_SCOPED_TABLES.get(table)
    if not key_col:
        return {"applied": False, "reason": "table_not_user_scoped", "field": f"{table}.{column}"}

    row_exists, current = _read_existing(supabase, table, key_col, user_id, column)

    # Idempotent: if the canonical value is already what we'd write, do
    # nothing and surface the no-op so callers / tests can assert it.
    if row_exists and current == value:
        return {"applied": False, "reason": "value_already_present", "field": f"{table}.{column}"}

    # Never overwrite a non-empty existing canonical value.
    if row_exists and current not in (None, "", []):
        return {
            "applied": False,
            "reason": "existing_value_preserved",
            "field": f"{table}.{column}",
        }

    if row_exists:
        updated = _safe(
            lambda: (
                supabase.table(table)
                .update({column: value})
                .eq(key_col, user_id)
                .execute()
                .data
            ),
            default=None,
        )
        if updated is None:
            return {"applied": False, "reason": "write_failed", "field": f"{table}.{column}"}
        return {"applied": True, "field": f"{table}.{column}", "value": value}

    inserted = _safe(
        lambda: (
            supabase.table(table)
            .insert({key_col: user_id, column: value})
            .execute()
            .data
        ),
        default=None,
    )
    if inserted is None:
        return {"applied": False, "reason": "write_failed", "field": f"{table}.{column}"}
    return {"applied": True, "field": f"{table}.{column}", "value": value}


def _record_provenance(
    supabase: Any,
    user_id: str,
    *,
    applied_fields: list[str],
    source: str,
    session_id: str | None,
) -> None:
    """Append onboarding provenance under ``profiles.metadata``.

    Best-effort: on read/write failure we log and return — the canonical
    write is the source of truth, provenance is supplementary.
    """
    if not applied_fields:
        return
    rows = _safe(
        lambda: (
            supabase.table("profiles")
            .select("metadata")
            .eq("id", user_id)
            .limit(1)
            .execute()
            .data
        ),
        default=[],
    ) or []
    if not rows:
        return
    metadata = rows[0].get("metadata") or {}
    if not isinstance(metadata, dict):
        return
    provenance = dict(metadata.get("onboarding_provenance") or {})
    answered_at = datetime.now(timezone.utc).isoformat()
    for field_path in applied_fields:
        entry = {"answered_at": answered_at, "source": source}
        if session_id:
            entry["session_id"] = session_id
        provenance[field_path] = entry
    metadata = {**metadata, "onboarding_provenance": provenance}
    _safe(
        lambda: (
            supabase.table("profiles")
            .update({"metadata": metadata})
            .eq("id", user_id)
            .execute()
        )
    )


def apply_profile_mapping(
    supabase: Any,
    user_id: str | None,
    *,
    question_source: str,
    question: dict[str, Any],
    normalized_value: Any,
    registry: dict[str, dict[str, Any]] | None = None,
    session_id: str | None = None,
) -> dict[str, Any]:
    """Apply the allowlisted canonical write (if any) for one answer.

    Returns a small dict describing what (if anything) was written. For
    recruitment answers with multiple mirror targets, ``writes`` holds the
    per-target outcomes and ``applied`` is true if *any* mirror succeeded.
    """
    if not user_id:
        return {"applied": False, "reason": "anonymous_no_canonical_write"}
    if normalized_value is None:
        return {"applied": False, "reason": "missing_value"}

    if question_source == "intent_picker":
        return {"applied": False, "reason": "intent_is_session_only"}

    if question_source == "persona_question_bank":
        # Reuse the existing PR2 allowlisted adapter unchanged.
        return apply_safe_profile_mapping(supabase, user_id, question, normalized_value)

    if question_source == "recruitment_question_requirements":
        field_key = question.get("field_key") or question.get("question_key")
        registry_row = (registry or {}).get(field_key) if field_key else None
        if _field_is_sensitive(field_key, registry_row):
            return {"applied": False, "reason": "sensitive_field_not_written"}

        mapping = _RECRUITMENT_FIELD_ALLOWLIST.get(field_key)
        if not mapping:
            return {"applied": False, "reason": "not_in_allowlist"}

        coerced = mapping.transform(normalized_value) if mapping.transform else normalized_value
        if coerced is None:
            return {"applied": False, "reason": "invalid_value"}

        writes: list[dict[str, Any]] = []
        applied_fields: list[str] = []
        for table, column in mapping.targets:
            result = _write_canonical(supabase, user_id, table, column, coerced)
            writes.append(result)
            if result.get("applied"):
                applied_fields.append(result["field"])

        if applied_fields:
            _record_provenance(
                supabase,
                user_id,
                applied_fields=applied_fields,
                source=question_source,
                session_id=session_id,
            )

        return {
            "applied": bool(applied_fields),
            "field_key": field_key,
            "value": coerced,
            "writes": writes,
        }

    return {"applied": False, "reason": "unknown_source"}
