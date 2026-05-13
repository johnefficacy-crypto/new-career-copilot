from __future__ import annotations

from datetime import datetime, timezone

import pytest

from app.eligibility.engine import check_eligibility
from app.eligibility.schemas import (
    AgeCriteria,
    AttemptLimit,
    CertificationCriteria,
    EducationCriteria,
    PostCriteria,
    UserCertification,
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
    # Defense in depth: AgeCriteria's validator catches bad cutoff_date at
    # the boundary now, but the engine's runtime parse keeps its own
    # try/except for canonical data that bypassed validation. Use
    # `model_construct` to simulate that path without triggering the
    # validator.
    bad_ac = AgeCriteria.model_construct(min_age=18, max_age=32, cutoff_date="not-a-date")
    result = check_eligibility(
        _profile(date_of_birth="2000-01-01"),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=bad_ac),
    )
    # Must NOT silently fall back to today's date; must surface a failing age
    # check, not be eligible, AND surface as conditional so callers can
    # distinguish "bad canonical data" from a hard age disqualification.
    assert result.is_eligible is False
    assert result.is_conditional is True
    age_check = next(c for c in result.checks if c.rule == "age")
    assert age_check.passed is False
    assert age_check.is_unverifiable is True
    assert "unverifiable" in age_check.detail.lower()


def test_age_criteria_validator_rejects_bad_cutoff_at_boundary():
    # The other half of the contract: bad data shouldn't even reach the
    # engine. AgeCriteria's validator rejects unparseable cutoff_date.
    import pytest as _pytest

    with _pytest.raises(Exception) as excinfo:
        AgeCriteria(min_age=18, max_age=32, cutoff_date="not-a-date")
    assert "ISO" in str(excinfo.value)


def test_age_criteria_validator_rejects_min_greater_than_max():
    import pytest as _pytest

    with _pytest.raises(Exception) as excinfo:
        AgeCriteria(min_age=40, max_age=32, cutoff_date="2026-01-01")
    assert "cannot exceed" in str(excinfo.value)


def test_attempt_limit_validator_rejects_negative():
    from app.eligibility.schemas import AttemptLimit
    import pytest as _pytest

    with _pytest.raises(Exception):
        AttemptLimit(category="general", max_attempts=-1)


def test_education_criteria_validator_rejects_out_of_range_percentage():
    from app.eligibility.schemas import EducationCriteria
    import pytest as _pytest

    with _pytest.raises(Exception):
        EducationCriteria(min_qualification_level="graduate", min_percentage=150.0)


def test_age_relaxation_rule_validator_rejects_negative_years():
    from app.eligibility.schemas import AgeRelaxationRule
    import pytest as _pytest

    with _pytest.raises(Exception):
        AgeRelaxationRule(additional_years=-3)


def test_unverifiable_flag_set_on_unverifiable_age_checks():
    # All four unverifiable age branches must tag the check with
    # is_unverifiable=True. Downstream UI/audit can render conditional
    # cases distinctly without needing to parse the detail string.
    cases = [
        # invalid cutoff
        AgeCriteria.model_construct(min_age=18, max_age=32, cutoff_date="garbage"),
        # missing cutoff
        AgeCriteria.model_construct(min_age=18, max_age=32, cutoff_date=None),
    ]
    for bad_ac in cases:
        result = check_eligibility(
            _profile(date_of_birth="2000-01-01"),
            _education(),
            [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
            [UserExamCredential(exam_key="gate")],
            _post(age_criteria=bad_ac),
        )
        age_check = next(c for c in result.checks if c.rule == "age")
        assert age_check.is_unverifiable is True


def test_unverifiable_flag_not_set_on_hard_age_failure():
    # Hard age-over-max failure is a real disqualification — must NOT be
    # tagged unverifiable.
    result = check_eligibility(
        _profile(date_of_birth="1980-01-01"),  # age 46 at cutoff
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01")),
    )
    age_check = next(c for c in result.checks if c.rule == "age")
    assert age_check.passed is False
    assert age_check.is_unverifiable is False
    assert result.is_conditional is False


def test_unverifiable_flag_set_on_missing_nationality():
    result = check_eligibility(
        _profile(nationality=None),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    nat_check = next(c for c in result.checks if c.rule == "nationality")
    assert nat_check.is_unverifiable is True


def test_unverifiable_flag_not_set_on_non_indian_nationality():
    # Wrong-nationality is a hard fail, NOT a missing-data case.
    result = check_eligibility(
        _profile(nationality="American"),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    nat_check = next(c for c in result.checks if c.rule == "nationality")
    assert nat_check.passed is False
    assert nat_check.is_unverifiable is False
    assert result.is_conditional is False


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
    # Missing legal identity data is a profile gap, not a hard disqualification.
    assert result.is_conditional is True


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
    assert result.is_conditional is True


def test_hard_age_failure_is_not_conditional():
    # Sanity check the opposite path: a candidate who simply exceeds max_age
    # is NOT conditional — they are hard-disqualified. This guards against
    # the unverifiable-rule exemption accidentally swallowing real failures.
    result = check_eligibility(
        _profile(date_of_birth="1980-01-01"),  # 46 at 2026-01-01
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01")),
    )
    age_check = next(c for c in result.checks if c.rule == "age")
    assert age_check.passed is False
    assert "exceeds maximum" in age_check.detail
    assert result.is_eligible is False
    assert result.is_conditional is False


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


@pytest.mark.parametrize(
    "limit_category,user_category",
    [
        # Unknown limit categories MUST NOT silently match anyone — they would
        # previously collapse to "general" via _normalize_category and apply to
        # general candidates.
        ("xyz_unknown", "general"),
        ("obc-ncl", "general"),  # hyphen vs underscore: not in known token set
        ("typo_general", "general"),
        # Unknown USER category must not match a "general" limit either.
        ("general", "xyz_unknown"),
    ],
)
def test_attempt_limits_unknown_category_does_not_collapse_to_general(
    limit_category, user_category
):
    # Only a category-specific limit is supplied (no None-category fallback).
    # With the unknown spelling on either side, no limit should apply, so
    # the candidate must not be hit with an attempt cap they never matched.
    result = check_eligibility(
        _profile(category=user_category),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=3)],
        [UserExamCredential(exam_key="gate")],
        _post(attempt_limits=[AttemptLimit(category=limit_category, max_attempts=3)]),
    )
    assert result.is_eligible is True
    assert all(c.rule != "attempts" for c in result.checks)


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


# ── P1 #1 attempt-identity split (migration 050) ───────────────────────────


def test_attempt_scope_exam_family_lenient_match_when_no_canonical_link():
    # Legacy behaviour: a `aspirant_exam_attempts` row without a canonical
    # exam_id, paired with a recruitment that also has no exam_id, must
    # still register attempts so existing data keeps producing verdicts.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(attempt_scope="exam_family", attempts_used=3)],
        [UserExamCredential(exam_key="gate")],
        _post(attempt_limits=[AttemptLimit(category=None, max_attempts=3, attempt_scope="exam_family")]),
    )
    assert result.is_eligible is False


def test_attempt_scope_exam_family_strict_match_when_both_sides_populated():
    # Two user attempts: one for exam-family "ssc-cgl" (matches the
    # recruitment), one for "upsc-cse" (doesn't). The matched one's
    # count drives the verdict.
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        recruitment_exam_id="exam-ssc-cgl",
        attempt_limits=[AttemptLimit(category=None, max_attempts=3, attempt_scope="exam_family")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [
            UserExamAttempts(attempt_scope="exam_family", exam_id="exam-upsc-cse", attempts_used=10),
            UserExamAttempts(attempt_scope="exam_family", exam_id="exam-ssc-cgl", attempts_used=2),
        ],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    assert result.is_eligible is True


def test_attempt_scope_exam_family_strict_mismatch_treats_attempts_as_zero():
    # User has 10 attempts in a *different* exam family. The engine must
    # NOT borrow that count for this recruitment's exam family.
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        recruitment_exam_id="exam-ssc-cgl",
        attempt_limits=[AttemptLimit(category=None, max_attempts=3, attempt_scope="exam_family")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(attempt_scope="exam_family", exam_id="exam-upsc-cse", attempts_used=10)],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    # No matching exam_family record → attempts_used=0 → eligible.
    assert result.is_eligible is True


def test_attempt_scope_recruitment_strict_match():
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        attempt_limits=[AttemptLimit(category=None, max_attempts=2, attempt_scope="recruitment")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(attempt_scope="recruitment", recruitment_id="r-1", attempts_used=2)],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    # 2 of 2 used → next attempt would exceed cap → not eligible.
    assert result.is_eligible is False


def test_attempt_scope_recruitment_ignores_other_recruitments_attempts():
    # User's attempts on a DIFFERENT recruitment must not count.
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        attempt_limits=[AttemptLimit(category=None, max_attempts=2, attempt_scope="recruitment")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(attempt_scope="recruitment", recruitment_id="r-other", attempts_used=10)],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    assert result.is_eligible is True


def test_attempt_scope_post_strict_match_on_recruitment_and_post():
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        attempt_limits=[AttemptLimit(category=None, max_attempts=2, attempt_scope="post")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [
            # cycle-scope entry shouldn't be picked for a post-scope limit
            UserExamAttempts(attempt_scope="recruitment", recruitment_id="r-1", attempts_used=10),
            UserExamAttempts(attempt_scope="post", recruitment_id="r-1", post_id="p-1", attempts_used=2),
            # different post — must not be picked
            UserExamAttempts(attempt_scope="post", recruitment_id="r-1", post_id="p-2", attempts_used=99),
        ],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    assert result.is_eligible is False  # 2/2 used on this post


def test_attempt_scope_post_no_match_treats_as_zero():
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        attempt_limits=[AttemptLimit(category=None, max_attempts=2, attempt_scope="post")],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        # Only a cycle-scope entry — no post-scope match.
        [UserExamAttempts(attempt_scope="recruitment", recruitment_id="r-1", attempts_used=10)],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    assert result.is_eligible is True


def test_attempt_scope_post_and_recruitment_can_coexist():
    # A post can declare BOTH a cycle cap and a per-post cap; each limit
    # row looks up its own scope's count independently.
    pc = PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        attempt_limits=[
            AttemptLimit(category=None, max_attempts=5, attempt_scope="recruitment"),
            AttemptLimit(category=None, max_attempts=2, attempt_scope="post"),
        ],
    )
    result = check_eligibility(
        _profile(),
        _education(),
        [
            UserExamAttempts(attempt_scope="recruitment", recruitment_id="r-1", attempts_used=3),
            UserExamAttempts(attempt_scope="post", recruitment_id="r-1", post_id="p-1", attempts_used=2),
        ],
        [UserExamCredential(exam_key="gate")],
        pc,
    )
    # Cycle is 3 of 5 (fine). Post is 2 of 2 (cap reached). But the engine
    # picks at most one applicable limit per the (category-canonicalised
    # → category=None fallback) precedence; the first matching None-
    # category limit wins. This test pins that contract.
    attempts_check = next(c for c in result.checks if c.rule == "attempts")
    # The first None-category limit (recruitment scope, max 5) wins; the
    # post-scope limit was not consulted in this configuration.
    assert "3 of 5" in attempts_check.detail or "5 of 5" in attempts_check.detail


def test_attempt_limit_default_scope_is_exam_family():
    # Back-compat: AttemptLimit without explicit attempt_scope keeps the
    # default 'exam_family' so existing canonical rows behave like the
    # pre-migration engine.
    lim = AttemptLimit(category=None, max_attempts=3)
    assert lim.attempt_scope == "exam_family"


# ── P2 #4 certification issuer enforcement ─────────────────────────────────


def _cert_post(*, mandatory: bool = True, name: str = "PMP", issuer: str | None = None,
               aliases=None):
    return PostCriteria(
        post_id="p-1",
        recruitment_id="r-1",
        certification_criteria=[
            CertificationCriteria(
                mandatory=mandatory,
                name=name,
                issuer=issuer,
                aliases=aliases or [],
            )
        ],
    )


def _user_cert(name: str, issuer: str | None = None):
    return UserCertification(certification_name=name, issuing_body=issuer)


def test_certification_no_issuer_required_matches_on_name_alone():
    # Back-compat: when criterion doesn't specify an issuer, the user's
    # issuing_body is irrelevant — name match is enough.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer=None),
        user_certifications=[_user_cert("PMP", issuer="Some Random Body")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is True


def test_certification_issuer_required_passes_when_user_issuer_matches():
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("PMP", issuer="PMI")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is True
    assert "PMI" in cert.detail


def test_certification_issuer_required_fails_when_user_issuer_mismatches():
    # The bug being fixed: previously this passed because only the name
    # was checked. Now must fail.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("PMP", issuer="Unknown Body")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is False
    assert "must be issued by PMI" in cert.detail


def test_certification_issuer_required_fails_when_user_issuer_missing():
    # User cert has no issuing_body. Required issuer cannot be satisfied.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("PMP", issuer=None)],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is False


def test_certification_missing_name_match_takes_precedence_over_issuer_in_detail():
    # When the user simply doesn't hold a cert with the required name, the
    # failure detail says "missing" — not "wrong issuer".
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("Six Sigma", issuer="ASQ")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is False
    assert "missing" in cert.detail.lower()


def test_certification_alias_matches_with_correct_issuer():
    # Aliases participate in the name-match step; the issuer gate applies
    # to the aliased match.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI", aliases=["project management professional"]),
        user_certifications=[_user_cert("Project Management Professional", issuer="PMI")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is True


def test_certification_issuer_match_is_case_insensitive():
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("pmp", issuer="pmi")],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is True


def test_certification_optional_always_passes_even_with_wrong_issuer():
    # Optional certs are never gated. Issuer mismatch on an optional
    # criterion still produces a passing check.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(mandatory=False, name="PMP", issuer="PMI"),
        user_certifications=[_user_cert("PMP", issuer="Unknown")],
    )
    cert = next(c for c in result.checks if c.rule == "certification_optional")
    assert cert.passed is True


def test_certification_picks_correct_issuer_when_user_holds_multiple_same_name():
    # User has two PMPs, one from PMI and one from a fake body. Criterion
    # requires PMI. The PMI one must satisfy the gate.
    result = check_eligibility(
        _profile(),
        _education(),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _cert_post(name="PMP", issuer="PMI"),
        user_certifications=[
            _user_cert("PMP", issuer="Unknown"),
            _user_cert("PMP", issuer="PMI"),
        ],
    )
    cert = next(c for c in result.checks if c.rule == "certification")
    assert cert.passed is True


# ── P2 #3 CGPA → percentage conversion basis ───────────────────────────────


def _edu_with_cgpa(cgpa: float, cgpa_basis: float | None = None):
    return [
        UserEducation(
            level="graduate",
            degree="B.Tech",
            stream="CSE",
            percentage=None,
            cgpa=cgpa,
            cgpa_basis=cgpa_basis,
            is_completed=True,
        )
    ]


def test_cgpa_default_basis_10_assumed_for_legacy_rows():
    # Back-compat: a row without cgpa_basis converts as today
    # (cgpa * 10). 7.0 CGPA → 70%.
    result = check_eligibility(
        _profile(),
        _edu_with_cgpa(cgpa=7.0, cgpa_basis=None),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True
    assert "70.0%" in edu.detail


def test_cgpa_with_explicit_10_basis_matches_default():
    result = check_eligibility(
        _profile(),
        _edu_with_cgpa(cgpa=7.0, cgpa_basis=10.0),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_cgpa_on_4_point_scale_converts_correctly():
    # 3.5/4.0 GPA → 87.5%. The legacy `cgpa * 10` would have given 35%,
    # failing the 60% bar. The new conversion accepts it.
    result = check_eligibility(
        _profile(),
        _edu_with_cgpa(cgpa=3.5, cgpa_basis=4.0),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True
    assert "87.5%" in edu.detail


def test_cgpa_on_7_point_scale_with_low_value_fails_60_pct_bar():
    # 4.0/7.0 → ~57.1%. Should fail a 60% cutoff.
    result = check_eligibility(
        _profile(),
        _edu_with_cgpa(cgpa=4.0, cgpa_basis=7.0),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is False


def test_cgpa_basis_validator_rejects_zero_or_negative():
    import pytest as _pytest

    with _pytest.raises(Exception):
        UserEducation(level="graduate", cgpa=3.5, cgpa_basis=0)
    with _pytest.raises(Exception):
        UserEducation(level="graduate", cgpa=3.5, cgpa_basis=-4)


def test_cgpa_validator_rejects_value_above_basis():
    import pytest as _pytest

    # 5.0 GPA on a 4.0 scale is impossible.
    with _pytest.raises(Exception):
        UserEducation(level="graduate", cgpa=5.0, cgpa_basis=4.0)


def test_cgpa_validator_rejects_above_default_10_when_no_basis():
    import pytest as _pytest

    # No basis given → default 10. 11.0 fails.
    with _pytest.raises(Exception):
        UserEducation(level="graduate", cgpa=11.0)


def test_percentage_wins_over_cgpa_when_both_present():
    # Sanity check: existing precedence preserved.
    edu = [
        UserEducation(
            level="graduate", degree="B.Tech", stream="CSE",
            percentage=95.0, cgpa=3.5, cgpa_basis=4.0, is_completed=True,
        )
    ]
    result = check_eligibility(
        _profile(),
        edu,
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(),
    )
    edu_check = next(c for c in result.checks if c.rule == "education")
    assert edu_check.passed is True
    assert "95.0%" in edu_check.detail


# ── P2 #2 discipline alias registry ─────────────────────────────────────────


def _edu_with_stream(stream: str, degree: str = "B.Tech"):
    return [
        UserEducation(
            level="graduate",
            degree=degree,
            stream=stream,
            percentage=80.0,
            cgpa=None,
            is_completed=True,
        )
    ]


def _post_with_disciplines(allowed):
    return _post(
        education_criteria=EducationCriteria(
            min_qualification_level="graduate",
            min_percentage=60.0,
            allowed_disciplines={"primary": allowed},
        )
    )


def test_discipline_alias_user_full_name_matches_criterion_slug():
    # Criterion: "cse". User stream: "Computer Science and Engineering".
    # Legacy substring `"cse" in "computer science and engineering"` is
    # False; the alias registry now canonicalises both sides and matches.
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Computer Science and Engineering"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["cse"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_discipline_alias_cs_does_not_match_physics():
    # The famous false positive: legacy `d in user_stream` made "cs"
    # a substring of "physics" — physics students would pass CS-only
    # posts. The registry rejects this.
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Physics"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["cs"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is False
    assert "not in the allowed disciplines" in edu.detail


def test_discipline_alias_me_does_not_match_medicine():
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Medicine", degree="MBBS"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["me"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is False


def test_discipline_alias_ece_matches_electronics_and_communication():
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Electronics and Communication"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["ece"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_discipline_word_boundary_fallback_for_unknown_terms():
    # Both sides are unknown to the registry, so the engine falls back
    # to the whole-word match. "Aquatic Crafts" tokens are {"aquatic",
    # "crafts"}, criterion "aquatic crafts" tokens are the same — match.
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Aquatic Crafts"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["aquatic crafts"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_discipline_word_boundary_fallback_rejects_partial_word():
    # User: "Sanskritology" (unknown). Criterion: "sans" (no longer a
    # silent substring match → no whole-word containment).
    result = check_eligibility(
        _profile(),
        _edu_with_stream("Sanskritology"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["sans"]),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is False


def test_discipline_match_combined_user_degree_stream():
    # User has stream null but degree is descriptive enough.
    edu = [
        UserEducation(
            level="postgraduate",
            degree="MBA in Finance",
            stream=None,
            percentage=80.0,
            is_completed=True,
        )
    ]
    result = check_eligibility(
        _profile(),
        edu,
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post_with_disciplines(["mba"]),
    )
    edu_check = next(c for c in result.checks if c.rule == "education")
    assert edu_check.passed is True


# ── P2 #1 education taxonomy ────────────────────────────────────────────────


def _edu_with_level(level: str, percentage: float = 80.0):
    return [
        UserEducation(
            level=level,
            degree="degree",
            stream="CSE",
            percentage=percentage,
            cgpa=None,
            is_completed=True,
        )
    ]


def test_education_alias_matric_satisfies_10th():
    # Legacy engine returned rank 0 for "matric" — every 10th-or-above
    # requirement failed. Taxonomy now resolves it.
    result = check_eligibility(
        _profile(),
        _edu_with_level("Matric"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="10th",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_education_alias_btech_satisfies_graduate():
    result = check_eligibility(
        _profile(),
        _edu_with_level("B.Tech"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="graduate",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_education_alias_mba_satisfies_postgraduate():
    result = check_eligibility(
        _profile(),
        _edu_with_level("MBA"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="postgraduate",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_education_class_10_satisfies_secondary_requirement():
    # Reverse: criterion uses an alias too.
    result = check_eligibility(
        _profile(),
        _edu_with_level("12th"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="Senior Secondary",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_education_unknown_user_level_against_known_requirement_fails():
    # Rank-0 user level cannot satisfy a graduate requirement.
    result = check_eligibility(
        _profile(),
        _edu_with_level("AlienCert"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="graduate",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is False


def test_education_postgraduate_satisfies_graduate_when_higher_allowed():
    # Default `allow_higher_qualification=True`. Real MTech holder
    # should satisfy a "graduate" minimum bar.
    result = check_eligibility(
        _profile(),
        _edu_with_level("M.Tech"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="graduate",
            min_percentage=60.0,
            allowed_disciplines=None,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    assert edu.passed is True


def test_education_strict_level_match_when_higher_disallowed():
    # `allow_higher_qualification=False` keeps strict equality.
    result = check_eligibility(
        _profile(),
        _edu_with_level("M.Tech"),
        [UserExamAttempts(recruitment_id="r-1", attempts_used=1)],
        [UserExamCredential(exam_key="gate")],
        _post(education_criteria=EducationCriteria(
            min_qualification_level="graduate",
            min_percentage=60.0,
            allowed_disciplines=None,
            allow_higher_qualification=False,
        )),
    )
    edu = next(c for c in result.checks if c.rule == "education")
    # M.Tech rank (18) != graduate rank (16) → strict mismatch.
    assert edu.passed is False
