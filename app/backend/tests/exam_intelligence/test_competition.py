"""Tests for Phase 12 competition intelligence shapers."""
from __future__ import annotations

from app.exam_intelligence.competition import (
    competition_series,
    cutoff_series,
    vacancy_series,
)
from tests.persona_questions._stub import SBStub


_BASE_DB = {
    "exam_cycles": [
        {"id": "cy-2022", "exam_id": "exam-1", "year": 2022, "cycle_name": "CSE 2022", "status": "completed"},
        {"id": "cy-2023", "exam_id": "exam-1", "year": 2023, "cycle_name": "CSE 2023", "status": "completed"},
        {"id": "cy-2024", "exam_id": "exam-1", "year": 2024, "cycle_name": "CSE 2024", "status": "active"},
    ],
    "exam_phases": [
        {"id": "ph-prelims", "exam_id": "exam-1", "phase_name": "Prelims", "phase_slug": "prelims", "phase_order": 1},
        {"id": "ph-mains", "exam_id": "exam-1", "phase_name": "Mains", "phase_slug": "mains", "phase_order": 2},
    ],
}


def _metrics_db():
    db = {k: list(v) for k, v in _BASE_DB.items()}
    db["exam_competition_metrics"] = [
        # 2022 prelims — reviewed
        {
            "id": "m1", "exam_id": "exam-1", "exam_cycle_id": "cy-2022",
            "exam_phase_id": "ph-prelims", "vacancy_total": 1011,
            "vacancy_by_category": {"general": 410, "obc": 270, "sc": 152, "st": 79, "ews": 100},
            "applicant_count": 1130000, "selection_ratio": 0.000924,
            "cutoff_trend": {"general": 88.22, "obc": 87.54, "sc": 74.08, "st": 69.35},
            "difficulty_trend": {"overall": "medium"},
            "competition_pressure_score": 81.2, "reviewer_status": "reviewed",
            "source_basis": "official", "confidence_score": 0.92,
        },
        # 2023 prelims — locked
        {
            "id": "m2", "exam_id": "exam-1", "exam_cycle_id": "cy-2023",
            "exam_phase_id": "ph-prelims", "vacancy_total": 1105,
            "vacancy_by_category": {"general": 442, "obc": 298, "sc": 165, "st": 82, "ews": 118},
            "applicant_count": 1290000, "selection_ratio": 0.000857,
            "cutoff_trend": {"general": 75.41, "obc": 74.75, "sc": 59.25, "st": 47.82},
            "difficulty_trend": {"overall": "hard"},
            "competition_pressure_score": 85.7, "reviewer_status": "locked",
            "source_basis": "official", "confidence_score": 0.95,
        },
        # 2024 prelims — draft, must be excluded
        {
            "id": "m3", "exam_id": "exam-1", "exam_cycle_id": "cy-2024",
            "exam_phase_id": "ph-prelims", "vacancy_total": 1056,
            "vacancy_by_category": {"general": 420},
            "cutoff_trend": {"general": 80.0},
            "reviewer_status": "draft", "source_basis": "manual", "confidence_score": 0.2,
        },
    ]
    return db


def test_competition_series_excludes_unreviewed_and_sorts_by_year():
    sb = SBStub(_metrics_db())
    series = competition_series(sb, "exam-1")
    assert [r["cycle_year"] for r in series] == [2022, 2023]
    assert series[0]["vacancy_total"] == 1011
    assert series[1]["competition_pressure_score"] == 85.7
    assert series[0]["phase_slug"] == "prelims"


def test_competition_series_empty_when_exam_missing():
    assert competition_series(SBStub({}), "") == []
    assert competition_series(SBStub({}), "exam-x") == []


def test_cutoff_series_pivots_by_category():
    sb = SBStub(_metrics_db())
    series = competition_series(sb, "exam-1")
    cuts = cutoff_series(series)
    assert sorted(cuts.keys()) == ["general", "obc", "sc", "st"]
    assert cuts["general"] == [
        {"year": 2022, "marks": 88.22, "phase_slug": "prelims"},
        {"year": 2023, "marks": 75.41, "phase_slug": "prelims"},
    ]


def test_cutoff_series_handles_list_payload_takes_last_value():
    series = [
        {"cycle_year": 2023, "phase_slug": "mains",
         "cutoff_trend": {"general": [None, 880, 905]}},
    ]
    cuts = cutoff_series(series)
    assert cuts["general"] == [{"year": 2023, "marks": 905.0, "phase_slug": "mains"}]


def test_cutoff_series_skips_garbage_payloads():
    series = [
        {"cycle_year": 2023, "phase_slug": "prelims", "cutoff_trend": "not-a-dict"},
        {"cycle_year": 2024, "phase_slug": "prelims",
         "cutoff_trend": {"general": "n/a", "obc": None, "ews": "57.1"}},
    ]
    cuts = cutoff_series(series)
    assert cuts == {"ews": [{"year": 2024, "marks": 57.1, "phase_slug": "prelims"}]}


def test_vacancy_series_collapses_phases_per_cycle():
    # Same cycle, two phases — vacancy_total should only count once.
    db = _metrics_db()
    db["exam_competition_metrics"].append({
        "id": "m4", "exam_id": "exam-1", "exam_cycle_id": "cy-2023",
        "exam_phase_id": "ph-mains", "vacancy_total": 1105,
        "vacancy_by_category": {"general": 442},
        "reviewer_status": "locked", "source_basis": "official", "confidence_score": 0.9,
    })
    sb = SBStub(db)
    series = competition_series(sb, "exam-1")
    vac = vacancy_series(series)
    years = [pt["year"] for pt in vac["total"]]
    assert years == [2022, 2023]
    assert vac["total"][1]["count"] == 1105
    assert [pt["count"] for pt in vac["by_category"]["general"]] == [410, 442]


def test_vacancy_series_empty_payload_when_no_data():
    assert vacancy_series([]) == {"total": [], "by_category": {}}
