from app.notifications.recompute_worker import drain_recompute_queue
from app.eligibility.recompute_queue import enqueue_eligibility_recompute
from app.api import admin_scrape

class E:
    def __init__(self,data=None,count=None): self.data=data; self.count=count

class Q:
    def __init__(self, name, db): self.n=name; self.db=db; self.f={}
    def select(self,*a,count=None,**k): self._count=count; return self
    def eq(self,k,v): self.f[k]=v; return self
    def neq(self,k,v): self.f[(k,'neq')]=v; return self
    def or_(self,*a,**k): return self
    def order(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def gte(self,*a,**k): return self
    def insert(self,p): self.db.setdefault(self.n,[]).append({**p,"id":p.get("id",f"q-{len(self.db.get(self.n,[]))+1}")}); return self
    def update(self,p):
        for r in self.db.get(self.n,[]):
            if all((r.get(k[0])!=v if isinstance(k,tuple) else r.get(k)==v) for k,v in self.f.items()): r.update(p)
        return self
    def delete(self):
        self.db[self.n]=[r for r in self.db.get(self.n,[]) if not all((r.get(k[0])!=v if isinstance(k,tuple) else r.get(k)==v) for k,v in self.f.items())]
        return self
    def execute(self):
        rows=[r for r in self.db.get(self.n,[]) if all((r.get(k[0])!=v if isinstance(k,tuple) else r.get(k)==v) for k,v in self.f.items())]
        c=len(rows) if getattr(self,'_count',None)=='exact' else None
        return E(rows,c)

class SB:
    def __init__(self): self.db={"eligibility_recompute_queue":[], "scrape_queue":[]}
    def table(self,n): return Q(n,self.db)

def test_enqueue_upserts_pending_row():
    sb=SB(); enqueue_eligibility_recompute(sb,"u1","a"); enqueue_eligibility_recompute(sb,"u1","b")
    assert len(sb.db["eligibility_recompute_queue"])==1
    assert sb.db["eligibility_recompute_queue"][0]["reason"]=="b"

def test_worker_handles_existing_completed(monkeypatch):
    sb=SB();
    sb.db["eligibility_recompute_queue"]=[{"id":"1","user_id":"u1","status":"pending","attempt_count":0},{"id":"2","user_id":"u1","status":"completed"}]
    monkeypatch.setattr("app.notifications.recompute_worker.run_eligibility_for_user", lambda *a,**k:{"eligible":1,"conditional":0})
    out=drain_recompute_queue(sb, limit=10)
    assert out["completed"]==1
    assert len([r for r in sb.db["eligibility_recompute_queue"] if r.get("status")=="completed"]) <= 1

def test_admin_queue_counts_pending(monkeypatch):
    sb=SB(); sb.db["eligibility_recompute_queue"]=[{"id":"1","status":"pending"},{"id":"2","status":"queued"}]
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: sb)
    out=admin_scrape.eligibility_queue(_admin={"id":"a"})
    assert out["recompute_backlog"]==1
