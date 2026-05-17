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
    def is_(self, k, v):
        self.filters[(k, "is")] = v
        return self

    def order(self, k, desc=False):
        self._order.append((k, desc))
        return self

    def limit(self, n):
        self._limit = n
        return self

    def update(self, payload):
        for row in self.db.get(self.name, []):
            if all((row.get(k[0]) is None if isinstance(k, tuple) and k[1] == "is" else row.get(k) == v) for k, v in self.filters.items()):
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
            rows = [r for r in rows if all((r.get(k[0]) is None if isinstance(k, tuple) and k[1] == "is" else r.get(k) == v) for k, v in self.filters.items())]
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
            "aspirant_location": [],
            "aspirant_reservations": [],
            "aspirant_education": [],
            "aspirant_preferences": [],
            "eligibility_recompute_queue": [],
        }

    def table(self, name):
        return _Q(name, self.db)

    def rpc(self, fn, params):
        # `enqueue_eligibility_recompute` (PR #132) calls supabase.rpc first.
        # This mock has no RPC engine; raise the PGRST202 "function not
        # found" signal so the helper falls through to its legacy Python
        # path, which only needs the table()/select()/insert() calls this
        # mock already supports.
        raise RuntimeError(
            "PGRST202 Could not find the function "
            "public.enqueue_eligibility_recompute in the schema cache"
        )


def _user():
    return {"id": "u1", "email": "u1@example.com", "name": "User"}


def test_put_profile_maps_name_state_to_profiles(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(name="New Name", state="Karnataka")

    out = asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert sb.db["profiles"][0]["full_name"] == "New Name"
    assert sb.db["profiles"][0]["domicile_state"] == "Karnataka"
    assert sb.db["aspirant_location"][0]["state"] == "Karnataka"
    assert out["profile"]["domicile_state"] == "Karnataka"


def test_put_profile_writes_dob_to_canonical_date_of_birth(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(dob="1999-02-03")

    out = asyncio.run(canonical.update_profile(body=body, user=_user()))

    assert sb.db["profiles"][0]["date_of_birth"] == "1999-02-03"
    assert sb.db["profiles"][0].get("dob") is None
    assert out["profile"]["date_of_birth"] == "1999-02-03"


def test_put_profile_mirrors_reservation_fields_to_normalized_table(monkeypatch):
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)
    body = canonical.ProfileUpdate(category="ews", pwbd_status="none", ex_serviceman=True)

    out = asyncio.run(canonical.update_profile(body=body, user=_user()))

    row = sb.db["aspirant_reservations"][0]
    assert row["category"] == "ews"
    assert row["is_pwd"] is False
    assert row["pwd_type"] == "none"
    assert row["is_ex_serviceman"] is True
    assert out["profile"]["category"] == "ews"


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
    sb.db["profiles"][0]["dob"] = "1998-04-05"
    sb.db["profiles"][0]["date_of_birth"] = None
    sb.db["profiles"][0]["category"] = "general"
    sb.db["profiles"][0]["domicile_state"] = None
    sb.db["aspirant_location"].append({"user_id": "u1", "state": "Delhi"})
    sb.db["aspirant_reservations"].append({"user_id": "u1", "category": "obc", "pwd_type": "visual"})
    sb.db["aspirant_education"].append({"id": "e1", "user_id": "u1", "degree": "BA", "level": "graduation", "stream": "arts", "graduation_year": 2021, "percentage": 68, "cgpa": 8.1, "is_completed": True})
    sb.db["aspirant_preferences"].append({"id": "p1", "user_id": "u1", "target_exams": ["upsc"], "preferred_states": ["Delhi"], "preferred_sectors": ["admin"], "study_hours_per_day": 3})
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.get_profile(user=_user()))

    assert out["profile"]["qualification"] == "BA"
    assert out["profile"]["education_level"] == "graduation"
    assert out["profile"]["stream"] == "arts"
    assert out["profile"]["cgpa"] == 8.1
    assert out["profile"]["goal_exams"] == ["upsc"]
    assert out["profile"]["weekly_hours_goal"] == 21
    assert out["profile"]["date_of_birth"] == "1998-04-05"
    assert out["profile"]["domicile_state"] == "Delhi"
    assert out["profile"]["category"] == "obc"
    assert out["profile"]["pwbd_status"] == "visual"


def test_profile_completion_uses_normalized_location_and_reservations(monkeypatch):
    sb = _SB()
    sb.db["profiles"][0]["category"] = None
    sb.db["profiles"][0]["domicile_state"] = None
    sb.db["aspirant_location"].append({"user_id": "u1", "state": "Kerala"})
    sb.db["aspirant_reservations"].append({"user_id": "u1", "category": "ews", "family_income_annual": 250000, "ews_certificate_available": True})
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.profile_completion(user=_user()))

    assert "category" not in out["identity_profile"]["missing_fields"]
    assert "domicile_state" not in out["identity_profile"]["missing_fields"]
    assert out["ews_profile"]["completion_pct"] == 100


def test_profile_completion_fields_are_user_editable(monkeypatch):
    """Every field required by completion must be exposable in the profile form.

    `career_goal` previously sat in the study_profile checklist with no UI
    surface (and no onboarding question writing to it), guaranteeing every
    user a permanent partial study_profile score. Until a UI path exists,
    keep it out of the completion contract.
    """
    sb = _SB()
    monkeypatch.setattr(canonical, "get_supabase_admin", lambda: sb)

    out = asyncio.run(canonical.profile_completion(user=_user()))

    all_required = {
        field
        for section, payload in out.items()
        if isinstance(payload, dict) and "missing_fields" in payload
        for field in payload.get("missing_fields", [])
    } | {
        field
        for section, payload in out.items()
        if isinstance(payload, dict)
        for field in payload.get("fields", [])
    }
    assert "career_goal" not in all_required


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
