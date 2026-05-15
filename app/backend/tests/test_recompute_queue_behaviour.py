import asyncio

from app.notifications.recompute_worker import claim_pending_recomputes, drain_recompute_queue, drain_recompute_queue_async
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
        if fn == "claim_eligibility_queue":
            if "p_limit" not in params:
                raise AssertionError("missing p_limit")
            limit = params["p_limit"]
            claimed = []
            for row in self.db.get("eligibility_recompute_queue", []):
                if len(claimed) >= limit:
                    break
                if row.get("status") in {"pending", "queued"}:
                    row["status"] = "processing"
                    row["claimed_at"] = "now"
                    row["attempt_count"] = (row.get("attempt_count") or 0) + 1
                    claimed.append(dict(row))

            class R:
                def __init__(self, data): self.data = data
                def execute(self): return E(self.data)

            return R(claimed)
        if fn == "enqueue_eligibility_recompute":
            return _EnqueueRpcSimulator(self.db, params)
        raise AssertionError(f"unexpected rpc {fn}")


class _EnqueueRpcSimulator:
    """Mirrors the SQL contract of `enqueue_eligibility_recompute` in
    migration 041. Kept in the test file so changes to the SQL contract
    must be reflected here intentionally.
    """

    def __init__(self, db, params):
        self.db = db
        self.params = params

    def execute(self):
        rows = self.db.setdefault("eligibility_recompute_queue", [])
        user_id = self.params["p_user_id"]
        recruitment_id = self.params.get("p_recruitment_id")
        reason = self.params.get("p_reason")
        metadata = self.params.get("p_metadata") or {}

        def _same_scope(r):
            return r.get("user_id") == user_id and r.get("recruitment_id") == recruitment_id

        # 1. Active row → return unchanged.
        active = next(
            (r for r in rows if _same_scope(r) and r.get("status") in {"pending", "queued", "processing"}),
            None,
        )
        if active is not None:
            return E(dict(active))

        # 2. Failed row → requeue, preserve attempt_count and last_error.
        failed = next(
            (r for r in rows if _same_scope(r) and r.get("status") == "failed"),
            None,
        )
        if failed is not None:
            failed["status"] = "pending"
            failed["queued_at"] = "now"
            failed["next_attempt_at"] = "now"
            failed["reason"] = reason
            failed["metadata"] = metadata
            failed["claimed_at"] = None
            failed["processed_at"] = None
            return E(dict(failed))

        # 3. Fresh insert.
        new_row = {
            "id": f"q-{len(rows) + 1}",
            "user_id": user_id,
            "recruitment_id": recruitment_id,
            "status": "pending",
            "queued_at": "now",
            "next_attempt_at": None,
            "attempt_count": 0,
            "last_error": None,
            "reason": reason,
            "metadata": metadata,
        }
        rows.append(new_row)
        return E(dict(new_row))


class SBFailRpc(SB):
    def rpc(self, fn, params):
        if fn == "enqueue_eligibility_recompute":
            # Falls through to legacy Python path in the unit under test.
            raise RuntimeError("PGRST202 Could not find the function public.enqueue_eligibility_recompute")
        raise RuntimeError("rpc unavailable")


class SBRpcMissing(SB):
    """Simulates a deploy that hasn't applied migration 041 yet."""

    def rpc(self, fn, params):
        if fn == "enqueue_eligibility_recompute":
            raise RuntimeError("PGRST202 Could not find the function public.enqueue_eligibility_recompute")
        return super().rpc(fn, params)

class QLegacyQueue(Q):
    def insert(self, p):
        if "attempt_count" in p:
            raise RuntimeError("PGRST204 Could not find the 'attempt_count' column of 'eligibility_recompute_queue' in the schema cache")
        return super().insert(p)

    def update(self, p):
        if "attempt_count" in p:
            raise RuntimeError("PGRST204 Could not find the 'attempt_count' column of 'eligibility_recompute_queue' in the schema cache")
        return super().update(p)

class SBLegacyQueue(SB):
    """Pre-migration-041 deploy: no RPC AND no migration 009 columns."""

    def table(self, n):
        if n == "eligibility_recompute_queue":
            return QLegacyQueue(n, self.db)
        return super().table(n)

    def rpc(self, fn, params):
        if fn == "enqueue_eligibility_recompute":
            raise RuntimeError("PGRST202 Could not find the function public.enqueue_eligibility_recompute")
        return super().rpc(fn, params)


def test_enqueue_active_row_returns_unchanged():
    # Migration 041 contract: a second enqueue against an existing active
    # row must be a no-op return — NOT a row update. The previous Python
    # path overwrote `reason` and reset retry metadata, which erased the
    # audit trail of any in-flight worker pass.
    sb = SB()
    enqueue_eligibility_recompute(sb, "u1", "a")
    enqueue_eligibility_recompute(sb, "u1", "b")
    assert len(sb.db["eligibility_recompute_queue"]) == 1
    assert sb.db["eligibility_recompute_queue"][0]["reason"] == "a"


def test_enqueue_dedupes_against_queued_status():
    # The OLD Python path only deduped against status='pending'. The new
    # contract treats `queued` and `processing` as active too, so a seeded
    # queued row must not create a duplicate.
    sb = SB()
    sb.db["eligibility_recompute_queue"] = [
        {"id": "q-existing", "user_id": "u1", "recruitment_id": None,
         "status": "queued", "attempt_count": 0, "reason": "seeded"},
    ]
    enqueue_eligibility_recompute(sb, "u1", "fresh-event")
    rows = sb.db["eligibility_recompute_queue"]
    assert len(rows) == 1
    assert rows[0]["status"] == "queued"
    assert rows[0]["reason"] == "seeded"


def test_enqueue_dedupes_against_processing_status():
    # Mid-flight workers must not have their row mutated under them.
    sb = SB()
    sb.db["eligibility_recompute_queue"] = [
        {"id": "q-existing", "user_id": "u1", "recruitment_id": None,
         "status": "processing", "attempt_count": 1, "claimed_at": "earlier",
         "reason": "seeded"},
    ]
    enqueue_eligibility_recompute(sb, "u1", "fresh-event")
    row = sb.db["eligibility_recompute_queue"][0]
    assert row["status"] == "processing"
    assert row["reason"] == "seeded"
    assert row["claimed_at"] == "earlier"
    assert row["attempt_count"] == 1


def test_enqueue_failed_row_requeues_and_preserves_retry_metadata():
    # A failed row must be reopened with `status=pending` and an immediate
    # next_attempt_at, but `attempt_count` and `last_error` are part of the
    # retry audit trail and must be preserved.
    sb = SB()
    sb.db["eligibility_recompute_queue"] = [
        {"id": "q-failed", "user_id": "u1", "recruitment_id": None,
         "status": "failed", "attempt_count": 3, "last_error": "boom",
         "reason": "stale", "metadata": {"old": True}},
    ]
    enqueue_eligibility_recompute(sb, "u1", "fresh-event", metadata={"new": True})
    rows = sb.db["eligibility_recompute_queue"]
    assert len(rows) == 1
    row = rows[0]
    assert row["status"] == "pending"
    assert row["next_attempt_at"] == "now"
    assert row["reason"] == "fresh-event"
    assert row["metadata"] == {"new": True}
    # Retry history preserved:
    assert row["attempt_count"] == 3
    assert row["last_error"] == "boom"


def test_enqueue_falls_back_when_rpc_missing():
    # Pre-migration-041 deploy: RPC raises PGRST202. The Python helper
    # must catch that and fall through to the legacy Python path so old
    # callers do not break during a rolling deploy.
    sb = SBRpcMissing()
    enqueue_eligibility_recompute(sb, "u1", "a")
    assert len(sb.db["eligibility_recompute_queue"]) == 1
    assert sb.db["eligibility_recompute_queue"][0]["reason"] == "a"


def test_enqueue_falls_back_when_queue_hardening_columns_missing():
    # Pre-migration-041 deploy AND missing migration 009 columns. The legacy
    # Python path uses _legacy_payload() to drop unknown columns on
    # schema-cache misses.
    sb = SBLegacyQueue()
    enqueue_eligibility_recompute(sb, "u1", "a", metadata={"x": 1})
    row = sb.db["eligibility_recompute_queue"][0]
    assert row["reason"] == "a"
    assert "attempt_count" not in row
    assert "metadata" not in row


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


def test_claim_helper_accepts_queued_status_for_legacy_callers():
    sb = SB()
    sb.db["eligibility_recompute_queue"]=[{"id":"1","user_id":"u1","status":"queued","attempt_count":0}]
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


def test_claim_batches_are_disjoint_across_workers():
    sb = SB()
    sb.db["eligibility_recompute_queue"]=[
        {"id":"1","user_id":"u1","status":"pending","attempt_count":0},
        {"id":"2","user_id":"u2","status":"pending","attempt_count":0},
    ]
    first = claim_pending_recomputes(sb, 1)
    second = claim_pending_recomputes(sb, 1)
    assert {r["id"] for r in first}.isdisjoint({r["id"] for r in second})


def test_claim_failure_returns_structured_error():
    out = drain_recompute_queue(SBFailRpc(), limit=1)
    assert out["checked"] == 0
    assert "claim_error" in out

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


def test_async_worker_blocked_without_safe_runner():
    sb = SB()
    out = asyncio.run(drain_recompute_queue_async(sb, limit=1))
    assert out["blocked"] is True
    assert out["checked"] == 0


def test_async_worker_processes_multiple_rows_with_limit():
    sb = SB()
    sb.db["eligibility_recompute_queue"] = [
        {"id": "1", "user_id": "u1", "status": "pending", "attempt_count": 0},
        {"id": "2", "user_id": "u2", "status": "pending", "attempt_count": 0},
    ]
    active = {"n": 0, "max": 0}

    async def _runner(*_a, **_k):
        active["n"] += 1
        active["max"] = max(active["max"], active["n"])
        await asyncio.sleep(0)
        active["n"] -= 1
        return {"eligible": 1, "conditional": 0}

    out = asyncio.run(drain_recompute_queue_async(sb, limit=10, concurrency_limit=1, recompute_runner=_runner))
    assert out["checked"] == 2
    assert out["completed"] == 2
    assert active["max"] <= 1
