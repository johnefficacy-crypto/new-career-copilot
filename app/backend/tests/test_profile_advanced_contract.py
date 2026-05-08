import asyncio
import pytest
from app.api import canonical

class _Exec:
    def __init__(self,data): self.data=data
class _Q:
    def __init__(self,name,db): self.name=name; self.db=db; self.filters={}
    def select(self,*a,**k): return self
    def eq(self,k,v): self.filters[k]=v; return self
    def is_(self,k,v): self.filters[(k,"is")]=v; return self
    def order(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def upsert(self,p,**k): return self.insert(p)
    def insert(self,p):
        row={**p,"id":p.get("id",f"{self.name}-{len(self.db.get(self.name,[]))+1}")}
        self.db.setdefault(self.name,[]).append(row); return self
    def update(self,p):
        for r in self.db.get(self.name,[]):
            if all((r.get(k[0]) is None if isinstance(k, tuple) and k[1]=="is" else r.get(k)==v) for k,v in self.filters.items()): r.update(p)
        return self
    def delete(self):
        keep=[]; removed=[]
        for r in self.db.get(self.name,[]):
            if all((r.get(k[0]) is None if isinstance(k, tuple) and k[1]=="is" else r.get(k)==v) for k,v in self.filters.items()): removed.append(r)
            else: keep.append(r)
        self.db[self.name]=keep
        return self
    def execute(self):
        rows=[r for r in self.db.get(self.name,[]) if all((r.get(k[0]) is None if isinstance(k, tuple) and k[1]=="is" else r.get(k)==v) for k,v in self.filters.items())]
        return _Exec(rows)
class _SB:
    def __init__(self):
        self.db={"profiles":[{"id":"u1","full_name":"U","date_of_birth":"2000-01-01","category":"general","domicile_state":"x","phone":"1","nationality":"Indian"}],"aspirant_certifications":[],"aspirant_experience":[],"aspirant_exam_attempts":[],"eligibility_recompute_queue":[]}
    def table(self,name): return _Q(name,self.db)

def _u(id="u1"): return {"id":id,"email":"a@a.com"}

def test_certifications_crud_and_isolation(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out=asyncio.run(canonical.create_certification(canonical.CertificationIn(certification_name="gate",year_completed=2020,is_active=True),_u()))
    cid=out["item"]["id"]
    assert len(asyncio.run(canonical.list_certifications(_u()))["items"])==1
    asyncio.run(canonical.update_certification(cid, canonical.CertificationIn(certification_name="net",year_completed=2021,is_active=True), _u()))
    assert sb.db["aspirant_certifications"][0]["certification_name"]=="net"
    with pytest.raises(Exception): asyncio.run(canonical.update_certification(cid, canonical.CertificationIn(certification_name="x"), _u("u2")))
    asyncio.run(canonical.delete_certification(cid,_u()))
    assert sb.db["aspirant_certifications"][0]["is_active"] is False
    assert len(sb.db["eligibility_recompute_queue"]) == 1

def test_experience_crud_validation(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    with pytest.raises(Exception): asyncio.run(canonical.create_experience(canonical.ExperienceIn(start_date="2025-01-02",end_date="2025-01-01"),_u()))
    item=asyncio.run(canonical.create_experience(canonical.ExperienceIn(organization="Acme",role="Analyst",start_date="2024-01-01"),_u()))["item"]
    eid=item["id"]
    asyncio.run(canonical.update_experience(eid, canonical.ExperienceIn(organization="Acme",role="Senior",start_date="2024-01-01",end_date="2025-01-01"),_u()))
    assert sb.db["aspirant_experience"][0]["role"]=="Senior"
    asyncio.run(canonical.delete_experience(eid,_u()))
    assert sb.db["aspirant_experience"]==[]
    assert len(sb.db["eligibility_recompute_queue"]) == 1

def test_exam_attempt_crud_and_validation(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    item=asyncio.run(canonical.create_exam_attempt(canonical.ExamAttemptIn(exam_id="e1",attempts_used=1),_u()))["item"]
    aid=item["id"]
    asyncio.run(canonical.update_exam_attempt(aid, canonical.ExamAttemptIn(exam_id="e1",attempts_used=2), _u()))
    assert sb.db["aspirant_exam_attempts"][0]["attempts_used"]==2
    asyncio.run(canonical.delete_exam_attempt(aid,_u()))
    assert sb.db["aspirant_exam_attempts"]==[]
    assert len(sb.db["eligibility_recompute_queue"]) == 1

def test_profile_update_enqueues_only_eligibility_changes(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    asyncio.run(canonical.update_profile(canonical.ProfileUpdate(qualification="B.Tech"), _u()))
    assert len(sb.db["eligibility_recompute_queue"]) == 1
    asyncio.run(canonical.update_profile(canonical.ProfileUpdate(avatar_url="x"), _u()))
    assert len(sb.db["eligibility_recompute_queue"]) == 1

def test_manual_recompute_endpoint(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out = asyncio.run(canonical.enqueue_recompute(_u()))
    assert out["status"] == "pending"

def test_completion_includes_advanced_groups(monkeypatch):
    sb=_SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out=asyncio.run(canonical.profile_completion(_u()))
    assert "certification_profile" in out and "experience_profile" in out and "attempts_profile" in out
