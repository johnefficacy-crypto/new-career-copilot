import asyncio

from app.api import canonical


class _Exec:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, name, db):
        self.name = name
        self.db = db
        self.filters = {}
        self._limit = None
        self._order = []

    def select(self, *_a, **_k):
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def order(self, k, desc=False):
        self._order.append((k, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, payload):
        for row in self.db.get(self.name, []):
            if all(row.get(k) == v for k, v in self.filters.items()):
                row.update(payload)
        return self

    def insert(self, payload):
        row = dict(payload)
        if "id" not in row:
            row["id"] = f"{self.name}-{len(self.db.get(self.name, [])) + 1}"
        self.db.setdefault(self.name, []).append(row)
        return self

    def upsert(self, payload, on_conflict=None):
        if self.name == "aspirant_preferences" and on_conflict == "user_id":
            uid = payload["user_id"]
            for row in self.db.get(self.name, []):
                if row.get("user_id") == uid:
                    row.update(payload)
                    return self
        return self.insert(payload)

    def execute(self):
        rows = list(self.db.get(self.name, []))
        if self.filters:
            rows = [r for r in rows if all(r.get(k) == v for k, v in self.filters.items())]
        for key, desc in reversed(self._order):
            rows.sort(key=lambda r: (r.get(key) is None, r.get(key)), reverse=desc)
        if self._limit is not None:
            rows = rows[: self._limit]
        return _Exec(rows)


class _SB:
    def __init__(self):
        self.db = {
            "profiles": [
                {
                    "id": "u1",
                    "full_name": "Old Name",
                    "phone": None,
                    "gender": None,
                    "category": "general",
                    "pwbd_status": None,
                    "domicile_state": None,
                    "nationality": None,
                    "ex_serviceman": False,
                    "govt_employee": False,
                    "dob": None,
                    "date_of_birth": "2000-01-01",
                    "service_years": None,
                    "graduation_year": None,
                    "target_type": None,
                    "target_exam": None,
                    "career_stage": None,
                    "career_goal": None,
                    "onboarding_step": 0,
                    "onboarding_completed": False,
                    "is_admin": False,
                    "plan_id": "free",
                    "avatar_url": None,
                }
            ],
            "aspirant_education": [],
            "aspirant_preferences": [],
        }

    def table(self, name):
        return _Q(name, self.db)


def _user():
    return {"id": "u1", "email": "u1@example.com", "name": "User"}


def test_put_profile_maps_name_state_to_profiles(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(name="New Name", state="Karnataka")

    out = asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert sb.db["profiles"][0]["full_name"] == "New Name"
    assert sb.db["profiles"][0]["domicile_state"] == "Karnataka"
    assert out["profile"]["domicile_state"] == "Karnataka"


def test_put_profile_upserts_education(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(qualification="BSc", qualification_year=2022, percentage=77.5)

    asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert len(sb.db["aspirant_education"]) == 1
    row = sb.db["aspirant_education"][0]
    assert row["degree"] == "BSc"
    assert row["graduation_year"] == 2022
    assert row["percentage"] == 77.5


def test_put_profile_maps_cgpa(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(qualification="BSc", cgpa=8.2)

    asyncio.run(canonical.update_profile(body=body, user=_user()))

    row = sb.db["aspirant_education"][0]
    assert row["cgpa"] == 8.2


def test_put_profile_maps_education_level(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(education_level="graduation")

    asyncio.run(canonical.update_profile(body=body, user=_user()))

    row = sb.db["aspirant_education"][0]
    assert row["level"] == "graduation"


def test_put_profile_maps_stream(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(qualification="BSc", stream="science")

    asyncio.run(canonical.update_profile(body=body, user=_user()))

    row = sb.db["aspirant_education"][0]
    assert row["stream"] == "science"


def test_put_profile_writes_goal_exams_preferences(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(goal_exams=["ssc-cgl", "ibps-po"], weekly_hours_goal=28)

    asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert len(sb.db["aspirant_preferences"]) == 1
    prefs = sb.db["aspirant_preferences"][0]
    assert prefs["target_exams"] == ["ssc-cgl", "ibps-po"]
    assert prefs["study_hours_per_day"] == 4.0


def test_get_profile_returns_assembled_profile(monkeypatch):
    sb = _SB()
    sb.db["aspirant_education"].append({"id": "e1", "user_id": "u1", "degree": "BA", "level": "graduation", "graduation_year": 2021, "percentage": 68, "is_completed": True})
    sb.db["aspirant_preferences"].append({"id": "p1", "user_id": "u1", "target_exams": ["upsc"], "preferred_states": ["Delhi"], "preferred_sectors": ["admin"], "study_hours_per_day": 3})
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.get_profile(user=_user()))

    assert out["profile"]["qualification"] == "BA"
    assert out["profile"]["goal_exams"] == ["upsc"]
    assert out["profile"]["weekly_hours_goal"] == 21


def test_profile_completion_detects_missing_education(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.profile_completion(user=_user()))

    assert "qualification" in out["education_profile"]["missing_fields"]
    assert out["education_profile"]["completion_pct"] == 0
    assert "why_it_matters" in out["education_profile"]


def test_unsupported_fields_do_not_break_profile_update(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(target_exam_year=2028)

    out = asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert out["id"] == "u1"
    assert sb.db["profiles"][0]["full_name"] == "Old Name"
