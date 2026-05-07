import asyncio
from app.profile.eligibility_mapper import build_user_eligibility_profile
from app.api import canonical

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
            "aspirant_reservations":[{"user_id":"u1","category":"sc","is_pwd":True,"pwd_type":"visual","is_ex_serviceman":True}],
            "aspirant_education":[{"user_id":"u1","level":"graduation","degree":"BA","stream":"arts","percentage":70,"cgpa":8.0,"is_completed":True}],
            "aspirant_certifications":[{"user_id":"u1","certification_name":" GATE ","is_active":True},{"user_id":"u1","certification_name":"old","is_active":False}],
            "aspirant_experience":[{"user_id":"u1","organization":"Org","years_experience":2}],
            "aspirant_preferences":[{"user_id":"u1","target_exams":["ssc"],"preferred_states":["delhi"],"preferred_sectors":["banking"]}],
            "aspirant_exam_attempts":[{"user_id":"u1","exam_id":"e1","attempts_used":2}],
            "aspirant_exam_credentials":[{"user_id":"u1","exam_key":"gate"}],
        }
    def table(self,name): return _Q(name,self.db)

def test_mapper_contract_and_precedence():
    out = build_user_eligibility_profile(_SB(), "u1")
    assert out["location"]["state"] == "y"
    assert out["reservations"]["category"] == "sc"
    assert out["education"][0]["cgpa"] == 8.0
    assert len(out["certifications"]) == 1 and out["certifications"][0]["certification_name"] == "gate"
    assert out["attempts"][0]["attempts_used"] == 2
    assert out["preferences"]["preferred_states"] == ["delhi"]

def test_debug_endpoint(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out = asyncio.run(canonical.eligibility_input_me(user={"id":"u1"}))
    assert out["user_id"] == "u1" and "education" in out and "credentials" in out
