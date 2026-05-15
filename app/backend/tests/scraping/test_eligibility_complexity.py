"""Tests for ``app.scraping.eligibility_complexity``.

Plan §5 acceptance:

* complexity flags are non-decorative — every detector fires on real text
* signals carry blocking_level + field_key + source_field_path
* no false positives on a generic recruitment payload
"""
from __future__ import annotations

from app.scraping.eligibility_complexity import detect_complexity


def _payload(**posts_kwargs):
    return {
        "title": "Recruitment 2026",
        "organization_name": "Generic Org",
        "posts": [
            {"post_name": "Generic Officer", **posts_kwargs}
        ],
    }


def _flags(signals):
    return {s.flag for s in signals}


# ── individual detectors ─────────────────────────────────────────────


def test_detects_domicile_requirement():
    out = detect_complexity(_payload(raw_requirement_text="Candidate must be a domicile of the state."))
    assert "requires_domicile" in _flags(out)


def test_detects_language_requirement():
    out = detect_complexity(_payload(raw_requirement_text="Working knowledge of Marathi language is mandatory."))
    assert "requires_language" in _flags(out)


def test_detects_gate_score_requirement():
    out = detect_complexity(_payload(raw_requirement_text="Selection through GATE score 2026."))
    assert "requires_gate_score" in _flags(out)


def test_detects_experience_requirement():
    out = detect_complexity(_payload(raw_requirement_text="Minimum 5 years of relevant experience required."))
    assert "requires_experience" in _flags(out)


def test_detects_discipline_specific_degree():
    out = detect_complexity(_payload(raw_requirement_text="Degree in Mechanical Engineering."))
    assert "requires_discipline_specific_degree" in _flags(out)


def test_detects_first_class():
    out = detect_complexity(_payload(raw_requirement_text="First class degree required."))
    assert "requires_first_class" in _flags(out)


def test_detects_category_relaxation():
    out = detect_complexity(_payload(raw_requirement_text="Age relaxation as per government rules for SC/ST candidates."))
    assert "category_relaxation" in _flags(out)


def test_detects_pwbd():
    out = detect_complexity(_payload(raw_requirement_text="PwBD candidates as per horizontal reservation."))
    assert "pwbd_horizontal_reservation" in _flags(out)


def test_detects_ex_serviceman():
    out = detect_complexity(_payload(raw_requirement_text="Ex-Serviceman candidates eligible."))
    assert "ex_serviceman_rules" in _flags(out)


def test_detects_physical_standards():
    out = detect_complexity(_payload(raw_requirement_text="PET and PST as per physical standards."))
    assert "physical_standards" in _flags(out)


def test_detects_medical_standards():
    out = detect_complexity(_payload(raw_requirement_text="Candidate must be medically fit."))
    assert "medical_standards" in _flags(out)


def test_detects_certificates():
    out = detect_complexity(_payload(raw_requirement_text="Valid licence required."))
    assert "requires_certificates" in _flags(out)


def test_detects_max_attempts():
    out = detect_complexity(_payload(raw_requirement_text="Maximum 4 attempts allowed."))
    assert "max_attempts" in _flags(out)


# ── no-false-positive baseline ────────────────────────────────────────


def test_generic_payload_emits_no_signals():
    out = detect_complexity({
        "title": "Office Assistant Notification 2026",
        "organization_name": "District Office",
        "posts": [{"post_name": "Office Assistant"}],
    })
    assert out == []


def test_empty_payload_returns_no_signals():
    assert detect_complexity({}) == []
    assert detect_complexity(None) == []


# ── signal shape ──────────────────────────────────────────────────────


def test_signal_carries_blocking_level_and_field_key():
    out = detect_complexity(_payload(raw_requirement_text="Domicile of the state required."))
    sig = next(s for s in out if s.flag == "requires_domicile")
    assert sig.field_key == "profile.domicile_state"
    assert sig.blocking_level == "publish_blocker"
    assert sig.source_field_path  # non-empty


def test_each_flag_emitted_at_most_once_per_payload():
    # Multiple matching phrases shouldn't multiply the flag count.
    out = detect_complexity(_payload(
        raw_requirement_text=(
            "Domicile of the state required. Local resident only. "
            "Bonafide resident certificate."
        ),
    ))
    flags = [s.flag for s in out]
    assert flags.count("requires_domicile") == 1
