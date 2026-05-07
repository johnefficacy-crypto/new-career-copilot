"""Engine unit tests — pure rule-engine, no Supabase.

Covers the exact scenarios from the reference TS engine doc-comments.
Run with:  pytest /app/app/backend/tests/test_engine.py -v
"""
from datetime import datetime, timedelta, timezone

from app.eligibility.engine import check_eligibility, check_eligibility_batch
from app.eligibility.schemas import (
    AgeCriteria,
    AttemptLimit,
    EducationCriteria,
    PostCriteria,
    CertificationCriteria,
    UserEducation,
    UserExamAttempts,
    UserExamCredential,
    UserProfile,
)


def _profile(**kw):
    base = dict(
        id="u-1",
        dob="2000-01-01",
        category="general",
        pwbd_status=None,
        ex_serviceman=False,
        service_years=None,
        govt_employee=False,
        domicile_state=None,
        nationality="indian",
    )
    base.update(kw)
    return UserProfile(**base)


def _grad(level="graduate", pct=70.0, completed=True, stream="B.A."):
    return UserEducation(
        level=level,
        degree=stream,
        stream=stream,
        percentage=pct,
        cgpa=None,
        is_completed=completed,
    )


def _post(rec_id="r-1", post_id="p-1", **overrides):
    base = dict(
        post_id=post_id,
        recruitment_id=rec_id,
        age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date="2026-01-01"),
        education_criteria=EducationCriteria(min_qualification_level="graduate", min_percentage=None, allowed_disciplines=None),
        attempt_limits=[],
        org_state=None,
        required_exam_keys=[],
    )
    base.update(overrides)
    return PostCriteria(**base)


def test_eligible_basic():
    res = check_eligibility(_profile(), [_grad()], [], [], _post())
    assert res.is_eligible is True
    assert res.is_conditional is False


def test_age_below_minimum():
    today = datetime.now(timezone.utc).date().isoformat()
    res = check_eligibility(
        _profile(dob=(datetime.now(timezone.utc) - timedelta(days=15 * 365)).date().isoformat()),
        [_grad()], [], [],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date=today)),
    )
    assert res.is_eligible is False
    assert any("below minimum" in r for r in res.fail_reasons)


def test_obc_max_age_relaxation():
    # 33 years old, OBC -> +3 years -> effective 30 -> within 32
    dob = (datetime.now(timezone.utc) - timedelta(days=int(33 * 365.25))).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    res = check_eligibility(
        _profile(dob=dob, category="obc"),
        [_grad()], [], [],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date=today)),
    )
    assert res.is_eligible is True


def test_pwbd_replaces_not_stacks():
    # 41 years old, OBC + PwBD -> 13 yr total (not 3 + 13 = 16) -> 41-13=28 ≤ 32 ✓
    dob = (datetime.now(timezone.utc) - timedelta(days=int(41 * 365.25))).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    res = check_eligibility(
        _profile(dob=dob, category="obc", pwbd_status="orthopedic"),
        [_grad()], [], [],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date=today)),
    )
    assert res.is_eligible is True


def test_ex_serviceman_formula():
    # 38 years, 8 years service -> effective 38-8-3 = 27 ≤ 32 ✓
    dob = (datetime.now(timezone.utc) - timedelta(days=int(38 * 365.25))).date().isoformat()
    today = datetime.now(timezone.utc).date().isoformat()
    res = check_eligibility(
        _profile(dob=dob, ex_serviceman=True, service_years=8),
        [_grad()], [], [],
        _post(age_criteria=AgeCriteria(min_age=18, max_age=32, cutoff_date=today)),
    )
    assert res.is_eligible is True
    assert any("ex-serviceman formula" in c.detail for c in res.checks if c.rule == "age")


def test_appearing_candidate_is_conditional():
    edu = [_grad(completed=False, pct=None)]
    res = check_eligibility(_profile(), edu, [], [], _post())
    assert res.is_eligible is False
    assert res.is_conditional is True


def test_education_below_required():
    edu = [_grad(level="12th")]
    res = check_eligibility(_profile(), edu, [], [], _post())
    assert res.is_eligible is False
    assert res.is_conditional is False


def test_percentage_below_minimum():
    edu = [_grad(pct=55.0)]
    res = check_eligibility(
        _profile(), edu, [], [],
        _post(education_criteria=EducationCriteria(min_qualification_level="graduate", min_percentage=60.0, allowed_disciplines=None)),
    )
    assert res.is_eligible is False


def test_cgpa_to_percentage_fallback():
    # cgpa 7.5 -> 75% -> >= 60%
    edu = [UserEducation(level="graduate", degree="B.Tech", stream="CSE", percentage=None, cgpa=7.5, is_completed=True)]
    res = check_eligibility(
        _profile(), edu, [], [],
        _post(education_criteria=EducationCriteria(min_qualification_level="graduate", min_percentage=60.0, allowed_disciplines=None)),
    )
    assert res.is_eligible is True


def test_attempts_exceeded():
    res = check_eligibility(
        _profile(category="general"), [_grad()],
        [UserExamAttempts(recruitment_id="r-1", attempts_used=6)],
        [],
        _post(attempt_limits=[AttemptLimit(category=None, max_attempts=6)]),
    )
    assert res.is_eligible is False
    assert any("Attempt limit reached" in r for r in res.fail_reasons)


def test_required_exam_credential_missing():
    res = check_eligibility(
        _profile(), [_grad()], [], [],
        _post(required_exam_keys=["jee_advanced"]),
    )
    assert res.is_eligible is False
    assert any("jee_advanced" in r for r in res.fail_reasons)


def test_state_psc_domicile_match():
    res = check_eligibility(
        _profile(domicile_state="Maharashtra"),
        [_grad()], [], [],
        _post(org_state="Maharashtra"),
    )
    assert res.is_eligible is True


def test_state_psc_domicile_mismatch():
    res = check_eligibility(
        _profile(domicile_state="Karnataka"),
        [_grad()], [], [],
        _post(org_state="Maharashtra"),
    )
    assert res.is_eligible is False


def test_central_post_skips_domicile():
    res = check_eligibility(
        _profile(domicile_state=None),
        [_grad()], [], [],
        _post(org_state=None),
    )
    assert res.is_eligible is True


def test_non_indian_nationality():
    res = check_eligibility(
        _profile(nationality="Bhutanese"),
        [_grad()], [], [],
        _post(),
    )
    assert res.is_eligible is False


def test_batch():
    posts = [_post(rec_id="a", post_id="a-1"), _post(rec_id="b", post_id="b-1", org_state="Tamil Nadu")]
    res = check_eligibility_batch(_profile(domicile_state=None), [_grad()], [], [], posts)
    assert len(res) == 2
    assert res[0].result.is_eligible is True
    assert res[1].result.is_eligible is False  # missing domicile


def test_mandatory_certification_present_passes():
    p = _profile()
    p.__dict__["_user_certifications"] = [{"certification_name": "gate"}]
    res = check_eligibility(p, [_grad()], [], [], _post(certification_criteria=[CertificationCriteria(mandatory=True, name="gate", aliases=[])]))
    assert res.is_eligible is True


def test_mandatory_certification_missing_fails():
    p = _profile()
    p.__dict__["_user_certifications"] = []
    res = check_eligibility(p, [_grad()], [], [], _post(certification_criteria=[CertificationCriteria(mandatory=True, name="gate", aliases=[])]))
    assert res.is_eligible is False


def test_certification_alias_matching():
    p = _profile()
    p.__dict__["_user_certifications"] = [{"certification_name": "computer_certificate"}]
    res = check_eligibility(p, [_grad()], [], [], _post(certification_criteria=[CertificationCriteria(mandatory=True, name="ccc", aliases=["computer_certificate"])]))
    assert res.is_eligible is True


def test_optional_certification_does_not_fail():
    p = _profile()
    p.__dict__["_user_certifications"] = []
    res = check_eligibility(p, [_grad()], [], [], _post(certification_criteria=[CertificationCriteria(mandatory=False, name="gate", aliases=[])]))
    assert res.is_eligible is True
