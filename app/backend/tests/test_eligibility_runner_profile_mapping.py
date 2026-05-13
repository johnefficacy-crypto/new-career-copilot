"""Runner-level regression tests for UserProfile field wiring.

These tests guard the data path between the eligibility mapper and the
deterministic engine. The engine itself has good coverage in
``tests/eligibility/test_engine.py``; what's covered here is whether the
runner actually delivers PwBD / ex-serviceman / service_years values to
the engine when the user only set them on one of the two source tables
(``profiles`` or ``aspirant_reservations``).

The mock shape mirrors ``test_eligibility_incremental_hash.py``: a tiny
in-memory Supabase stub that supports the chained select / eq / in_ /
order / upsert / execute calls the runner makes.
"""
from __future__ import annotations

from app.eligibility import runner


class E:
    def __init__(self, data):
        self.data = data


class Q:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.f = {}
        self.in_filters = {}

    def select(self, *a, **k):
        return self

    def eq(self, k, v):
        self.f[k] = v
        return self

    def in_(self, k, v):
        self.in_filters[k] = set(v)
        return self

    def or_(self, *a, **k):
        return self

    def order(self, *a, **k):
        return self

    def execute(self):
        rows = [
            r
            for r in self.db.get(self.name, [])
            if all(r.get(k) == v for k, v in self.f.items())
        ]
        for key, values in self.in_filters.items():
            if self.name == "posts" and key.startswith("recruitments."):
                field = key.split(".", 1)[1]
                rows = [r for r in rows if (r.get("recruitments") or {}).get(field) in values]
            else:
                rows = [r for r in rows if r.get(key) in values]
        return E(rows)

    def upsert(self, payload, on_conflict=None):
        rows = payload if isinstance(payload, list) else [payload]
        if self.name == "eligibility_results":
            for row in rows:
                existing = next(
                    (
                        r
                        for r in self.db[self.name]
                        if r.get("user_id") == row.get("user_id")
                        and r.get("post_id") == row.get("post_id")
                    ),
                    None,
                )
                if existing:
                    existing.update(row)
                else:
                    self.db[self.name].append(dict(row))
        elif self.name == "notification_alerts":
            self.db[self.name].extend(rows)
        return self


def _sb_with(profiles_row: dict, reservations_row: dict):
    class _SB:
        def __init__(self):
            self.queried_tables: list[str] = []
            self.db = {
                "profiles": [profiles_row],
                "aspirant_location": [{"user_id": "u1", "state": "MH"}],
                "aspirant_reservations": [reservations_row],
                "aspirant_education": [
                    {"user_id": "u1", "level": "graduate", "percentage": 75, "is_completed": True}
                ],
                "aspirant_certifications": [],
                "aspirant_experience": [],
                "aspirant_preferences": [],
                "aspirant_exam_attempts": [],
                "aspirant_exam_credentials": [],
                "tracked_recruitments": [],
                "posts": [
                    {
                        "id": "p1",
                        "recruitment_id": "r1",
                        "age_criteria": [],
                        "education_criteria": [],
                        "attempt_limits": [],
                        "certification_criteria": [],
                        "recruitments": {
                            "status": "open",
                            "publish_status": "verified",
                            "organizations": {"state": "MH"},
                        },
                    }
                ],
                "eligibility_results": [],
                "notification_alerts": [],
                "recruitments": [],
            }

        def table(self, n):
            self.queried_tables.append(n)
            return Q(n, self.db)

    return _SB()


def _capture_profile(sb, monkeypatch):
    captured: dict = {}

    def _batch(profile, _education, _attempts, _credentials, _post_criteria, **_kwargs):
        captured["profile"] = profile
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    return captured["profile"]


def test_runner_propagates_pwbd_from_aspirant_reservations_when_profiles_default(monkeypatch):
    # Most common real-world case: user filled in the reservation form but
    # legacy `profiles.pwbd_status` is still the default 'none'. The engine
    # must see a truthy pwbd_status so PwBD relaxation actually applies.
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "2000-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "pwbd_status": "none",
            "ex_serviceman": False,
            "service_years": None,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_pwd": True,
            "pwd_type": "orthopedic",
            "disability_code": "orthopedic",
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    assert profile.pwbd_status
    assert profile.pwbd_status.lower() != "none"
    assert profile.disability_code == "orthopedic"


def test_runner_propagates_pwbd_from_profiles_when_aspirant_reservations_empty(monkeypatch):
    # Legacy users who only set `profiles.pwbd_status` should still register
    # as PwD on the engine side.
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "2000-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "pwbd_status": "visual",
            "ex_serviceman": False,
            "service_years": None,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_pwd": False,
            "pwd_type": None,
            "disability_code": None,
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    assert profile.pwbd_status
    assert profile.pwbd_status.lower() != "none"


def test_runner_default_pwbd_stays_none(monkeypatch):
    # Sanity check: neither source carries PwBD info → engine sees no relaxation.
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "2000-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "pwbd_status": "none",
            "ex_serviceman": False,
            "service_years": None,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_pwd": False,
            "pwd_type": None,
            "disability_code": None,
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    # Either None or "none" is acceptable — both are falsy at the engine gate.
    assert not (profile.pwbd_status and profile.pwbd_status.lower() != "none")


def test_runner_propagates_ex_serviceman_from_aspirant_reservations(monkeypatch):
    # `aspirant_reservations.is_ex_serviceman` is the canonical source; legacy
    # `profiles.ex_serviceman` may still be False for users who never visited
    # that screen.
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "1990-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "ex_serviceman": False,
            "service_years": None,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_ex_serviceman": True,
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    assert profile.ex_serviceman is True


def test_runner_propagates_service_years_from_profiles(monkeypatch):
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "1985-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "ex_serviceman": True,
            "service_years": 9,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_ex_serviceman": True,
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    assert profile.ex_serviceman is True
    assert profile.service_years == 9


def test_runner_service_years_missing_when_neither_source_set(monkeypatch):
    sb = _sb_with(
        profiles_row={
            "id": "u1",
            "date_of_birth": "1985-01-01",
            "nationality": "Indian",
            "category": "general",
            "domicile_state": "MH",
            "ex_serviceman": True,
            "service_years": None,
        },
        reservations_row={
            "user_id": "u1",
            "category": "general",
            "is_ex_serviceman": True,
        },
    )
    profile = _capture_profile(sb, monkeypatch)
    # service_years missing — engine should now surface this as unverifiable
    # rather than silently apply a 3yr fallback.
    assert profile.ex_serviceman is True
    assert profile.service_years is None


# ── P1 #1 attempt-identity split: runner reads both attempt tables ─────────


def _sb_with_attempts(*, exam_family_rows: list, recruitment_rows: list, recruitment_exam_id: str | None = None):
    """SB stub seeded with both attempt tables AND a `recruitments.exam_id`."""
    class _SB:
        def __init__(self):
            self.queried_tables: list[str] = []
            self.db = {
                "profiles": [{
                    "id": "u1",
                    "date_of_birth": "2000-01-01",
                    "nationality": "Indian",
                    "category": "general",
                    "domicile_state": "MH",
                }],
                "aspirant_location": [{"user_id": "u1", "state": "MH"}],
                "aspirant_reservations": [{"user_id": "u1", "category": "general"}],
                "aspirant_education": [
                    {"user_id": "u1", "level": "graduate", "percentage": 75, "is_completed": True}
                ],
                "aspirant_certifications": [],
                "aspirant_experience": [],
                "aspirant_preferences": [],
                "aspirant_exam_attempts": exam_family_rows,
                "aspirant_recruitment_attempts": recruitment_rows,
                "aspirant_exam_credentials": [],
                "tracked_recruitments": [],
                "posts": [
                    {
                        "id": "p1",
                        "recruitment_id": "r1",
                        "age_criteria": [],
                        "education_criteria": [],
                        "attempt_limits": [],
                        "certification_criteria": [],
                        "recruitments": {
                            "status": "open",
                            "publish_status": "verified",
                            "exam_id": recruitment_exam_id,
                            "organizations": {"state": "MH"},
                        },
                    }
                ],
                "eligibility_results": [],
                "notification_alerts": [],
                "recruitments": [],
            }

        def table(self, n):
            self.queried_tables.append(n)
            return Q(n, self.db)

    return _SB()


def _capture_attempts_and_criteria(sb, monkeypatch):
    captured: dict = {}

    def _batch(_profile, _education, attempts, _credentials, post_criteria, **_kwargs):
        captured["attempts"] = attempts
        captured["post_criteria"] = post_criteria
        return []

    monkeypatch.setattr(runner, "check_eligibility_batch", _batch)
    runner.run_eligibility_for_user("u1", sb)
    return captured


def test_runner_constructs_exam_family_attempts_from_aspirant_exam_attempts(monkeypatch):
    sb = _sb_with_attempts(
        exam_family_rows=[
            {"user_id": "u1", "exam_id": "ssc-cgl", "exam_ref_id": "exam-uuid-ssc-cgl", "attempts_used": 4},
        ],
        recruitment_rows=[],
    )
    captured = _capture_attempts_and_criteria(sb, monkeypatch)
    family_attempts = [a for a in captured["attempts"] if a.attempt_scope == "exam_family"]
    assert len(family_attempts) == 1
    # Canonical exam_ref_id wins over the legacy free-form exam_id.
    assert family_attempts[0].exam_id == "exam-uuid-ssc-cgl"
    assert family_attempts[0].attempts_used == 4


def test_runner_constructs_recruitment_attempts_from_new_table(monkeypatch):
    sb = _sb_with_attempts(
        exam_family_rows=[],
        recruitment_rows=[
            {"user_id": "u1", "recruitment_id": "r1", "post_id": None, "attempts_used": 2},
        ],
    )
    captured = _capture_attempts_and_criteria(sb, monkeypatch)
    rec_attempts = [a for a in captured["attempts"] if a.attempt_scope == "recruitment"]
    assert len(rec_attempts) == 1
    assert rec_attempts[0].recruitment_id == "r1"
    assert rec_attempts[0].post_id is None
    assert rec_attempts[0].attempts_used == 2


def test_runner_constructs_post_attempts_when_post_id_present(monkeypatch):
    sb = _sb_with_attempts(
        exam_family_rows=[],
        recruitment_rows=[
            {"user_id": "u1", "recruitment_id": "r1", "post_id": "p1", "attempts_used": 1},
        ],
    )
    captured = _capture_attempts_and_criteria(sb, monkeypatch)
    post_attempts = [a for a in captured["attempts"] if a.attempt_scope == "post"]
    assert len(post_attempts) == 1
    assert post_attempts[0].post_id == "p1"
    assert post_attempts[0].recruitment_id == "r1"


def test_runner_surfaces_recruitment_exam_id_on_post_criteria(monkeypatch):
    sb = _sb_with_attempts(
        exam_family_rows=[],
        recruitment_rows=[],
        recruitment_exam_id="exam-uuid-ssc-cgl",
    )
    captured = _capture_attempts_and_criteria(sb, monkeypatch)
    assert captured["post_criteria"][0].recruitment_exam_id == "exam-uuid-ssc-cgl"


def test_runner_recruitment_exam_id_defaults_to_none_for_unlinked_recruitments(monkeypatch):
    sb = _sb_with_attempts(
        exam_family_rows=[],
        recruitment_rows=[],
        recruitment_exam_id=None,
    )
    captured = _capture_attempts_and_criteria(sb, monkeypatch)
    assert captured["post_criteria"][0].recruitment_exam_id is None
