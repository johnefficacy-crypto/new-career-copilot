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
        _post(org_state=org_state, requires_domicile=org_state is not None),
    )
    assert result.is_eligible is expected


@pytest.mark.parametrize(
    "dob,cutoff,expected_age,expected_eligible",
    [
        # Cutoff exactly on birthday → age is full-year diff.
        ("2000-01-01", "2026-01-01", 26, True),
        # Cutoff one day before birthday → still 25 (not yet 26).
        ("2000-01-02", "2026-01-01", 25, True),
        # Cutoff day after birthday → 26.
        ("2000-01-01", "2026-01-02", 26, True),
        # Leap-year DOB Feb 29: in a non-leap cutoff year, Feb 28 is BEFORE Mar 1
        # so on 2025-02-28 the candidate is still 24 (not yet had their birthday).
        ("2000-02-29", "2025-02-28", 24, True),
        ("2000-02-29", "2025-03-01", 25, True),
    ],
)
def test_exact_age_birthday_cutoff(dob, cutoff, expected_age, expected_eligible):
    result = check_eligibility(
        _profile(date_of_birth=dob),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date=cutoff)),
    )
    assert result.is_eligible is expected_eligible
    age_check = next(c for c in result.checks if c.rule == "age")
    assert f"Age {expected_age}" in age_check.detail


def test_invalid_cutoff_date_is_unverifiable():
    result = check_eligibility(
        _profile(date_of_birth="2000-01-01"),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="not-a-date")),
    )
    # Must NOT silently fall back to today's date; must surface a failing age
    # check and not be eligible.
    assert result.is_eligible is False
    age_check = next(c for c in result.checks if c.rule == "age")
    assert age_check.passed is False
    assert "unverifiable" in age_check.detail.lower()


def test_missing_nationality_is_unverifiable():
    result = check_eligibility(
        _profile(nationality=None),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    nationality_check = next(c for c in result.checks if c.rule == "nationality")
    assert nationality_check.passed is False
    assert "not provided" in nationality_check.detail.lower()
    assert result.is_eligible is False


def test_ex_serviceman_without_service_years_is_unverifiable():
    # Ex-serviceman flag set but service_years missing → cannot apply the
    # actual_age - service_years - 3 formula. Must NOT auto-grant a 3yr
    # fallback relaxation; instead surface an unverifiable age check.
    result = check_eligibility(
        _profile(
            date_of_birth="1985-01-01",  # 41 at cutoff 2026-01-01
            ex_serviceman=True,
            service_years=None,
        ),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01")),
    )
    age_check = next(c for c in result.checks if c.rule == "age")
    assert age_check.passed is False
    assert "service_years" in age_check.detail
    assert result.is_eligible is False


@pytest.mark.parametrize(
    "limit_category,user_category,expected",
    [
        # OBC variants in canonical criteria must match a user with category "obc_ncl".
        ("obc", "obc_ncl", False),  # 3/3 attempts → fail
        ("obc_ncl", "obc", False),
        ("sebc", "vjnt", False),  # both normalise to obc → matched
        ("ews", "ews", False),  # exact ews match
        ("sc", "obc", True),  # different categories → no match → no attempt limit
    ],
)
def test_attempt_limits_use_normalized_category(limit_category, user_category, expected):
    # attempts_used = 3, max = 3 → fail iff the limit actually applies.
    result = check_eligibility(
        _profile(category=user_category),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=3)],
        [UserExamCredential(exam_key="gate")],
        _post(attempt_limits=[AttemptLimit(category=limit_category, max_attempts=3)]),
    )
    assert result.is_eligible is expected


def test_org_state_alone_does_not_force_domicile():
    # An org_state without requires_domicile must NOT cause a domicile failure:
    # organisation state is metadata, not a legal domicile rule.
    result = check_eligibility(
        _profile(domicile_state="Karnataka"),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(org_state="Maharashtra", requires_domicile=False),
    )
    assert result.is_eligible is True
    assert all(c.rule != "domicile" for c in result.checks)
