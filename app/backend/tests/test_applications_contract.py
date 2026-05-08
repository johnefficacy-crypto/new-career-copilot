import asyncio
from app.api import canonical

class E:
    def __init__(self,data): self.data=data
class Q:
    def __init__(self,name,db): self.name=name; self.db=db; self.filters={}
    def select(self,sel,*a,**k): self.sel=sel; return self
    def eq(self,k,v): self.filters[k]=v; return self
    def order(self,*a,**k): return self
    def execute(self):
        rows=[r for r in self.db.get(self.name,[]) if all(r.get(k)==v for k,v in self.filters.items())]
        return E(rows)
class SB:
    def __init__(self):
        self.last_select=""
        self.db={"user_recruitment_applications":[{"id":"a1","user_id":"u1","recruitment":{"id":"r1","organizations":{"name":"Staff Selection Commission"},"official_notification_url":"https://x"}}]}
    def table(self,name):
        q=Q(name,self.db)
        old=q.select
        def sel(s,*a,**k): self.last_select=s; return old(s,*a,**k)
        q.select=sel
        return q

def test_my_applications_shape_and_select(monkeypatch):
    sb=SB(); monkeypatch.setattr(canonical,"get_supabase_admin",lambda:sb)
    out=asyncio.run(canonical.my_applications({"id":"u1"}))
    assert "organization,organization_code,notification_url" not in sb.last_select
    rec=out["items"][0]["recruitment"]
    assert rec["organization"]=="Staff Selection Commission"
    assert rec["organization_code"]=="STAFF"
    assert rec["notification_url"]=="https://x"
