import asyncio
import pytest
from app.profile.eligibility_mapper import build_user_eligibility_profile
from app.db.utils import safe_select
from app.api import canonical
from app.core.errors import DatabaseError

class _Exec:
    def __init__(self,data): self.data=data
class _Q:
    def __init__(self,name,db): self.name=name; self.db=db; self.filters={}
    def select(self,*a,**k): return self
    def eq(self,k,v): self.filters[k]=v; return self
    def execute(self):
        rows=[r for r in self.db.get(self.name,[]) if all(r.get(k)==v for k,v in self.filters.items())]
        return _Exec(rows)
class _SB:
    def __init__(self):
        self.db={
            "profiles":[{"id":"u1","full_name":"A","domicile_state":"x","category":"OBC","pwbd_status":"visual","ex_serviceman":False,"govt_employee":True,"date_of_birth":"2000-01-01","nationality":"Indian"}],
            "aspirant_location":[{"user_id":"u1","state":"y","district":"d"}],
            "aspirant_reservations":[{"user_id":"u1","category":"sc","is_pwd":True,"pwd_type":"visual","disability_code":"blindness","is_ex_serviceman":True,"family_income_annual":100000,"ews_assets":{"land": False},"ews_certificate_available":True}],
            "aspirant_education":[{"user_id":"u1","level":"graduation","degree":"BA","stream":"arts","percentage":70,"cgpa":8.0,"is_completed":True}],
            "aspirant_certifications":[{"user_id":"u1","certification_name":" GATE ","is_active":True},{"user_id":"u1","certification_name":"old","is_active":False}],
            "aspirant_experience":[{"user_id":"u1","organization":"Org","years_experience":2}],
            "aspirant_preferences":[{"user_id":"u1","target_exams":["ssc"],"preferred_states":["delhi"],"preferred_sectors":["banking"],"languages_known":["marathi"],"preferred_language":"hindi"}],
            "aspirant_exam_attempts":[{"user_id":"u1","exam_id":"e1","attempts_used":2}],
            "aspirant_exam_credentials":[{"user_id":"u1","exam_key":"gate"}],
            "certifications":[{"id":"c1","name":"GATE","issuer":"IIT","is_active":True}],
        }
    def table(self,name): return _Q(name,self.db)

def test_mapper_contract_and_precedence():
    out = build_user_eligibility_profile(_SB(), "u1").model_dump()
    assert out["location"]["state"] == "y"
    assert out["reservations"]["category"] == "sc"
    assert out["reservations"]["disability_code"] == "blindness"
    assert out["reservations"]["ews_certificate_available"] is True
    assert out["education"][0]["cgpa"] == 8.0
    assert len(out["certifications"]) == 1 and out["certifications"][0]["certification_name"] == "gate"
    assert out["attempts"][0]["attempts_used"] == 2
    assert out["preferences"]["preferred_states"] == ["delhi"]
    assert out["preferences"]["languages_known"] == ["marathi"]

def test_debug_endpoint(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out = asyncio.run(canonical.eligibility_input_me(user={"id":"u1"}))
    assert out["user_id"] == "u1" and "education" in out and "credentials" in out


def test_metadata_certifications_endpoint(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out = asyncio.run(canonical.metadata_certifications())
    assert out["items"][0]["name"] == "GATE"


class _ErrSB:
    def table(self, _name):
        raise RuntimeError("db unavailable")


def test_safe_select_returns_empty_on_failure():
    assert safe_select(_ErrSB(), "profiles", "*", id="u1") == []


def test_mapper_raises_database_error_on_critical_read_failure():
    with pytest.raises(DatabaseError):
        build_user_eligibility_profile(_ErrSB(), "u1")


def test_mapper_optional_tables_fallback_to_empty_lists():
    sb = _SB()
    del sb.db["aspirant_certifications"]
    del sb.db["aspirant_experience"]
    del sb.db["aspirant_exam_attempts"]
    del sb.db["aspirant_exam_credentials"]
    out = build_user_eligibility_profile(sb, "u1").model_dump()
    assert out["certifications"] == []
    assert out["experience"] == []
    assert out["attempts"] == []
    assert out["credentials"] == []


def test_mapper_deduplicates_certifications_and_attempts_and_credentials():
    sb = _SB()
    sb.db["aspirant_certifications"].append({"user_id":"u1","certification_name":"gate","issuing_body":None,"is_active":True})
    sb.db["aspirant_exam_attempts"].append({"user_id":"u1","exam_id":"e1","attempts_used":3})
    sb.db["aspirant_exam_credentials"].append({"user_id":"u1","exam_key":"gate"})
    out = build_user_eligibility_profile(sb, "u1").model_dump()
    assert len(out["certifications"]) == 1
    assert len(out["attempts"]) == 1
    assert len(out["credentials"]) == 1


def test_invalid_numeric_rows_skipped():
    sb = _SB()
    sb.db["aspirant_education"].append({"user_id":"u1","level":"x","percentage":120})
    sb.db["aspirant_exam_attempts"].append({"user_id":"u1","exam_id":"e2","attempts_used":-1})
    out = build_user_eligibility_profile(sb, "u1").model_dump()
    assert all((e.get("percentage") or 0) <= 100 for e in out["education"])
    assert all(a["attempts_used"] >= 0 for a in out["attempts"])
