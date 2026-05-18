"""Coverage for the weekly_hours_goal shim in app.persona.signals.

`profiles.weekly_hours_goal` no longer exists in the live schema —
canonical.py derives it from `aspirant_preferences.study_hours_per_day`.
signals.py must apply the same derivation so the persona snapshot does
not regress when the database stops carrying the column.
"""
from __future__ import annotations

from app.persona.signals import collect_user_signals
from tests.persona_questions._stub import SBStub


def _seed(prefs_row: dict | None) -> SBStub:
    db: dict = {"profiles": [{"id": "u-1", "full_name": "A"}]}
    if prefs_row is not None:
        db["aspirant_preferences"] = [prefs_row]
    return SBStub(db)


def test_weekly_hours_goal_derived_from_prefs_two_hours_per_day():
    sb = _seed(
        {"user_id": "u-1", "study_hours_per_day": 2.0, "study_mode": "solo"}
    )
    signals = collect_user_signals(sb, "u-1")
    # 2 hr/day × 7 days = 14, rounded the same way canonical.py does it.
    assert signals["weekly_hours_goal"] == 14


def test_weekly_hours_goal_absent_when_prefs_row_missing():
    sb = _seed(prefs_row=None)
    signals = collect_user_signals(sb, "u-1")
    # No prefs row → shim never fires → snapshot leaves it None. The
    # signal payload still exposes the key (it's part of the contract),
    # but the underlying derive must not synthesise a fake 0.
    assert signals["weekly_hours_goal"] is None


def test_weekly_hours_goal_handles_bad_string_value_without_crashing():
    sb = _seed(
        {"user_id": "u-1", "study_hours_per_day": "not-a-number", "study_mode": "solo"}
    )
    signals = collect_user_signals(sb, "u-1")
    assert signals["weekly_hours_goal"] is None
