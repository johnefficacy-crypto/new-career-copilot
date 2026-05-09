from app.notifications.recompute_worker import claim_pending_recomputes, drain_recompute_queue
from app.eligibility.recompute_queue import enqueue_eligibility_recompute
from app.api import admin_scrape
from app.core.errors import DatabaseError

class E:
    def __init__(self,data=None,count=None): self.data=data; self.count=count

class Q:
    def __init__(self, name, db): self.n=name; self.db=db; self.f={}
    def _matches(self, r):
        for k, v in self.f.items():
            if isinstance(k, tuple) and k[1] == "neq":
                if r.get(k[0]) == v: return False
            elif isinstance(k, tuple) and k[1] == "is":
                if r.get(k[0]) is not None: return False
            elif r.get(k) != v:
                return False
        return True
    def select(self,*a,count=None,**k): self._count=count; return self
    def eq(self,k,v): self.f[k]=v; return self
    def neq(self,k,v): self.f[(k,'neq')]=v; return self
    def is_(self,k,v): self.f[(k,'is')]=v; return self
    def or_(self,*a,**k): return self
    def order(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def gte(self,*a,**k): return self
    def insert(self,p): self.db.setdefault(self.n,[]).append({**p,"id":p.get("id",f"q-{len(self.db.get(self.n,[]))+1}")}); return self
    def update(self,p):
        for r in self.db.get(self.n,[]):
            if self._matches(r): r.update(p)
        return self
    def delete(self):
        self.db[self.n]=[r for r in self.db.get(self.n,[]) if not self._matches(r)]
        return self
    def execute(self):
        rows=[r for r in self.db.get(self.n,[]) if self._matches(r)]
        c=len(rows) if getattr(self,'_count',None)=='exact' else None
        return E(rows,c)

class SB:
    def __init__(self): self.db={"eligibility_recompute_queue":[], "scrape_queue":[]}
    def table(self,n): return Q(n,self.db)
    def rpc(self, fn, params):
        if fn != "claim_eligibility_queue":
            raise AssertionError(f"unexpected rpc {fn}")
        if "p_limit" not in params:
            raise AssertionError("missing p_limit")
        limit = params["p_limit"]
        claimed = []
        for row in self.db.get("eligibility_recompute_queue", []):
            if len(claimed) >= limit:
                break
            if row.get("status") == "pending":
                row["status"] = "processing"
                row["claimed_at"] = "now"
                row["attempt_count"] = (row.get("attempt_count") or 0) + 1
                claimed.append(dict(row))
        class R:
            def __init__(self, data): self.data = data
            def execute(self): return E(self.data)
        return R(claimed)

def test_enqueue_upserts_pending_row():
    sb=SB(); enqueue_eligibility_recompute(sb,"u1","a"); enqueue_eligibility_recompute(sb,"u1","b")
    assert len(sb.db["eligibility_recompute_queue"])==1
    assert sb.db["eligibility_recompute_queue"][0]["reason"]=="b"

def test_enqueue_recruitment_scope_is_idempotent():
    sb=SB(); enqueue_eligibility_recompute(sb,"u1","a", recruitment_id="r1"); enqueue_eligibility_recompute(sb,"u1","b", recruitment_id="r1")
    assert len(sb.db["eligibility_recompute_queue"])==1
    assert sb.db["eligibility_recompute_queue"][0]["recruitment_id"]=="r1"

def test_enqueue_user_and_recruitment_scope_can_coexist():
    sb=SB(); enqueue_eligibility_recompute(sb,"u1","a"); enqueue_eligibility_recompute(sb,"u1","b", recruitment_id="r1")
    assert len(sb.db["eligibility_recompute_queue"])==2

def test_worker_handles_existing_completed(monkeypatch):
    sb=SB();
    sb.db["eligibility_recompute_queue"]=[
        {"id":"1","user_id":"u1","recruitment_id":"r1","status":"pending","attempt_count":0},
        {"id":"2","user_id":"u1","recruitment_id":"r1","status":"completed"},
        {"id":"3","user_id":"u1","recruitment_id":"r2","status":"completed"},
    ]
    monkeypatch.setattr("app.notifications.recompute_worker.run_eligibility_for_user", lambda *a,**k:{"eligible":1,"conditional":0})
    out=drain_recompute_queue(sb, limit=10)
    assert out["completed"]==1

def test_claim_helper_uses_rpc_p_limit():
    sb = SB()
    sb.db["eligibility_recompute_queue"]=[{"id":"1","user_id":"u1","status":"pending","attempt_count":0}]
    rows = claim_pending_recomputes(sb, 5)
    assert len(rows) == 1
    assert rows[0]["status"] == "processing"

def test_two_workers_do_not_claim_same_row(monkeypatch):
    sb = SB()
    sb.db["eligibility_recompute_queue"]=[{"id":"1","user_id":"u1","status":"pending","attempt_count":0}]
    monkeypatch.setattr("app.notifications.recompute_worker.run_eligibility_for_user", lambda *a,**k:{"eligible":1,"conditional":0})
    out1 = drain_recompute_queue(sb, limit=1)
    out2 = drain_recompute_queue(sb, limit=1)
    assert out1["checked"] == 1
    assert out1["completed"] == 1
    assert out2["checked"] == 0
    assert out2["completed"] == 0

def test_worker_records_failure_metadata_on_database_error(monkeypatch):
    sb = SB()
    sb.db["eligibility_recompute_queue"]=[{"id":"1","user_id":"u1","status":"pending","attempt_count":0}]
    monkeypatch.setattr(
        "app.notifications.recompute_worker.run_eligibility_for_user",
        lambda *_a, **_k: (_ for _ in ()).throw(DatabaseError("db down")),
    )
    out = drain_recompute_queue(sb, limit=1)
    row = sb.db["eligibility_recompute_queue"][0]
    assert out["failed"] == 1
    assert row["status"] == "pending"
    assert row["attempt_count"] == 1
    assert "db down" in (row.get("last_error") or "")
    assert row.get("next_attempt_at")

def test_admin_queue_counts_pending(monkeypatch):
    sb=SB(); sb.db["eligibility_recompute_queue"]=[{"id":"1","status":"pending"},{"id":"2","status":"queued"}]
    monkeypatch.setattr(admin_scrape, "get_supabase_admin", lambda: sb)
    out=admin_scrape.eligibility_queue(_admin={"id":"a"})
    assert out["recompute_backlog"]==1
