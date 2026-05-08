from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.eligibility.engine import check_eligibility
from app.eligibility.schemas import (
    AgeCriteria,
    AttemptLimit,
    EducationCriteria,
    PostCriteria,
    UserEducation,
    UserExamAttempts,
    UserExamCredential,
    UserProfile,
)


def _profile(**overrides):
    base = dict(
        id="u-1",
        date_of_birth="2000-01-01",
        category="general",
        pwbd_status=None,
        ex_serviceman=False,
        service_years=None,
        domicile_state="Maharashtra",
        nationality="Indian",
    )
    base.update(overrides)
    return UserProfile(**base)


def _post(**overrides):
    base = dict(
        post_id="p-1",
        recruitment_id="r-1",
        age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01"),
        education_criteria=EducationCriteria(min_qualification_level="graduate", min_percentage=60.0, allowed_disciplines=None),
        attempt_limits=[AttemptLimit(category=None, max_attempts=3)],
        required_exam_keys=["gate"],
        org_state="Maharashtra",
    )
    base.update(overrides)
    return PostCriteria(**base)


def _education(*, completed=True, level="graduate", percentage=70.0, cgpa=None):
    return [
        UserEducation(
            level=level,
            degree="B.Tech",
            stream="CSE",
            percentage=percentage,
            cgpa=cgpa,
            is_completed=completed,
        )
    ]


@pytest.mark.parametrize(
    "dob,expected",
    [
        ("2010-01-01", False),  # below minimum
        ("1994-01-01", True),   # boundary-compatible with relaxation-free case
    ],
)
def test_age_bounds(dob, expected):
    result = check_eligibility(
        _profile(date_of_birth=dob),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    assert result.is_eligible is expected


@pytest.mark.parametrize(
    "category,pwbd_status,expected",
    [
        ("obc", None, True),
        ("obc", "orthopedic", True),
        ("general", None, False),
    ],
)
def test_category_relaxations(category, pwbd_status, expected):
    # 35-year-old candidate at cutoff date; OBC(+3) or PwBD paths should pass.
    result = check_eligibility(
        _profile(date_of_birth="1991-01-01", category=category, pwbd_status=pwbd_status),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01")),
    )
    assert result.is_eligible is expected


@pytest.mark.parametrize(
    "education,expected_conditional,expected_eligible",
    [
        (_education(completed=False, percentage=None), True, False),
        (_education(completed=True, percentage=None, cgpa=7.0), False, True),
    ],
)
def test_education_mark_availability(education, expected_conditional, expected_eligible):
    result = check_eligibility(
        _profile(),
        education,
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    assert result.is_conditional is expected_conditional
    assert result.is_eligible is expected_eligible


@pytest.mark.parametrize("attempts_used,expected", [(2, True), (3, False), (4, False)])
def test_attempt_limits(attempts_used, expected):
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=attempts_used)],
        [UserExamCredential(exam_key="gate")],
        _post(attempt_limits=[AttemptLimit(category=None, max_attempts=3)]),
    )
    assert result.is_eligible is expected


@pytest.mark.parametrize("keys,expected", [(["gate"], True), (["other"], False), ([], False)])
def test_required_exam_credentials(keys, expected):
    creds = [UserExamCredential(exam_key=k) for k in keys]
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        creds,
        _post(required_exam_keys=["gate"]),
    )
    assert result.is_eligible is expected


@pytest.mark.parametrize(
    "domicile,org_state,expected",
    [
        ("Maharashtra", "Maharashtra", True),
        ("Karnataka", "Maharashtra", False),
        (None, None, True),
    ],
)
def test_domicile_conditions(domicile, org_state, expected):
    result = check_eligibility(
        _profile(domicile_state=domicile),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(org_state=org_state),
    )
    assert result.is_eligible is expected
