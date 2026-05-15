"""Compiler adapter for eligibility complexity (PR plan §5).

Bridges the gateway's detector output (
:class:`app.scraping.eligibility_complexity.EligibilityComplexitySignal`)
to the publish-readiness path in ``admin_trust.py``.

The deterministic engine doesn't have a centralised compiler module —
it uses ``age_criteria`` / ``education_criteria`` / ``certification_criteria``
tables. This adapter answers one question:

    "Given these complexity signals, which ones are NOT yet represented
     as canonical rules?"

If a signal is unrepresented at its declared ``blocking_level``, the
publish/promotion gate uses that to block.

The adapter is intentionally narrow — it doesn't try to *create*
canonical rules; that's an admin curation flow handled elsewhere. It
only inspects the canonical state.
"""
from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any, Iterable


logger = logging.getLogger(__name__)


# Map a complexity ``field_key`` to the canonical rule kind that would
# represent it. ``None`` means "no canonical-rule equivalent exists yet"
# — the signal is informational, never a blocker (the detector still
# decides the blocking_level; an unrepresented null-mapping flag at
# ``promotion_blocker`` would block, which is the intended pressure to
# extend the canonical schema).

_FIELD_KEY_TO_RULE_KIND: dict[str, str | None] = {
    "profile.domicile_state":           "domicile",
    "profile.languages_known":          "language",
    "profile.exam_scores.gate":         "exam_score",
    "profile.work_experience_years":    "experience",
    "profile.education.discipline":     "discipline",
    "profile.education.classification": "education_classification",
    "profile.category":                 "category",
    "profile.pwbd_status":              "pwbd",
    "profile.ex_serviceman_status":     "ex_serviceman",
    "profile.physical_standards":       "physical",
    "profile.medical_standards":        "medical",
    "profile.certificates":             "certificate",
    "profile.attempts_remaining":       "attempts",
}


@dataclass
class ComplexityRepresentation:
    """One signal's representation status."""

    flag: str
    field_key: str
    blocking_level: str
    represented: bool
    rule_kind: str | None


def _canonical_rule_kinds_for_recruitment(
    supabase, recruitment_id: str,
) -> set[str]:
    """Return the rule kinds present for a recruitment.

    Each kind corresponds to a row in one of the criteria tables.
    Best-effort — missing tables (older deploy) means "nothing
    represented", which makes the gate err on the side of blocking
    publish until the schema catches up.
    """
    kinds: set[str] = set()
    # Each pair is (table, kind_label). The table-existence-or-not is
    # what we need; column shape isn't important here.
    checks = (
        ("age_criteria",            "age"),
        ("education_criteria",      "education"),
        ("certification_criteria",  "certificate"),
        ("discipline_criteria",     "discipline"),
        ("domicile_criteria",       "domicile"),
        ("language_criteria",       "language"),
        ("category_criteria",       "category"),
        ("experience_criteria",     "experience"),
        ("attempt_criteria",        "attempts"),
        ("physical_criteria",       "physical"),
        ("medical_criteria",        "medical"),
        ("exam_score_criteria",     "exam_score"),
        ("pwbd_criteria",           "pwbd"),
        ("ex_serviceman_criteria",  "ex_serviceman"),
    )
    for table, kind in checks:
        try:
            rows = (
                supabase.table(table)
                .select("id")
                .eq("recruitment_id", recruitment_id)
                .limit(1)
                .execute()
                .data
                or []
            )
        except Exception:  # noqa: BLE001
            # Table doesn't exist or other error — treat as not represented.
            continue
        if rows:
            kinds.add(kind)
    return kinds


def evaluate_representation(
    supabase,
    *,
    recruitment_id: str,
    signals: Iterable[dict[str, Any]],
) -> list[ComplexityRepresentation]:
    """Decide which complexity signals are unrepresented.

    ``signals`` is the dict form (already validated through pydantic)
    coming off ``recruitment_verification_reports.risk_flags`` or
    a fresh detector output. Returns one
    :class:`ComplexityRepresentation` per signal.
    """
    if not recruitment_id:
        # Queue-only report (pre-promotion). Nothing to look up against.
        return [
            ComplexityRepresentation(
                flag=s["flag"],
                field_key=s["field_key"],
                blocking_level=s["blocking_level"],
                represented=False,
                rule_kind=_FIELD_KEY_TO_RULE_KIND.get(s["field_key"]),
            )
            for s in signals
        ]

    present_kinds = _canonical_rule_kinds_for_recruitment(supabase, recruitment_id)
    out: list[ComplexityRepresentation] = []
    for s in signals:
        kind = _FIELD_KEY_TO_RULE_KIND.get(s["field_key"])
        represented = bool(kind) and kind in present_kinds
        out.append(ComplexityRepresentation(
            flag=s["flag"],
            field_key=s["field_key"],
            blocking_level=s["blocking_level"],
            represented=represented,
            rule_kind=kind,
        ))
    return out


def has_unrepresented_blocker(
    representations: Iterable[ComplexityRepresentation],
    *,
    level: str,
) -> bool:
    """True if any signal at ``level`` is unrepresented.

    Used by the promotion/publish gates. ``level`` is one of
    ``"promotion_blocker"`` or ``"publish_blocker"``.
    """
    for r in representations:
        if r.blocking_level == level and not r.represented:
            return True
    return False


__all__ = [
    "ComplexityRepresentation",
    "evaluate_representation",
    "has_unrepresented_blocker",
]
