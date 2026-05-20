import pytest
import asyncio
from app.api import canonical

class Resp:
    def __init__(self,data): self.data=data

class Query:
    def __init__(self, rows): self.rows=rows; self.filters={}; self.ilike_calls=[]
    def select(self,*a,**k): return self
    def in_(self,k,v): self.filters[k]=set(v); return self
    def eq(self,k,v): self.filters[k]=v; return self
    def ilike(self,*a,**k): self.ilike_calls.append((a,k)); return self
    def order(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def execute(self):
        out=self.rows
        if 'publish_status' in self.filters and isinstance(self.filters['publish_status'], set):
            out=[r for r in out if r.get('publish_status') in self.filters['publish_status']]
        for key, value in self.filters.items():
            if isinstance(value, set):
                continue
            out=[r for r in out if r.get(key)==value]
        return Resp(out)

class SB:
    def __init__(self, rows): self.rows=rows
    def table(self,name):
        return Query(self.rows if name=='recruitments' else [])

ROWS=[
 {"id":"11111111-1111-1111-1111-111111111111","slug":"a-draft","name":"A","publish_status":"draft","status":"open","organizations":{"name":"Org"}},
 {"id":"22222222-2222-2222-2222-222222222222","slug":"b-needs-review","name":"B","publish_status":"needs_review","status":"open","organizations":{"name":"Org"}},
 {"id":"33333333-3333-3333-3333-333333333333","slug":"c-verified","name":"C","publish_status":"verified","status":"open","organizations":{"name":"Org"}},
 {"id":"44444444-4444-4444-4444-444444444444","slug":"d-published","name":"D","publish_status":"published","status":"open","organizations":{"name":"Org"}},
]

def test_public_list_only_published(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    out=asyncio.run(canonical.list_recruitments(status=None, q=None, user=None))
    assert [i['id'] for i in out['items']]==['44444444-4444-4444-4444-444444444444']
    assert out["items"][0]["slug"] == "d-published"

def test_public_detail_excludes_unpublished(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    fake_user = {"id": "u1", "is_anonymous": False}
    with pytest.raises(Exception):
        asyncio.run(canonical.get_recruitment('a-draft', user=fake_user))
    ok=asyncio.run(canonical.get_recruitment('d-published', user=fake_user))
    assert ok['id']=='44444444-4444-4444-4444-444444444444'
    assert ok["slug"] == "d-published"
    for f in ['raw_html','extracted_data','field_evidence','raw_snapshot_url','raw_snapshot_hash','reviewer_notes']:
        assert f not in ok


def test_admin_list_can_see_all_statuses(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    # canonical public list filters; admin trust endpoint should not
    from app.api import admin_trust
    monkeypatch.setattr(admin_trust, 'get_supabase_admin', lambda: SB(ROWS))
    out=admin_trust.admin_recruitments(_admin={'id':'a','permissions':['recruitments.manage']})
    assert len(out['items'])==4

def test_resolver_does_not_use_uuid_ilike(monkeypatch):
    called={'ilike':False}
    class Q2(Query):
        def ilike(self,*a,**k): called['ilike']=True; return self
    class SB2(SB):
        def table(self,name): return Q2(self.rows if name=='recruitments' else [])
    monkeypatch.setattr(canonical,'get_supabase_admin',lambda:SB2(ROWS))
    try:
        canonical._resolve_rec_id(SB2(ROWS), '11111111-1111-1111-1111-111111111111')
    except Exception:
        pass
    assert called['ilike'] is False


def test_fake_generated_trailing_id_slug_does_not_resolve(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    with pytest.raises(Exception):
        canonical._resolve_rec_id(SB(ROWS), "d-published-44444444")


def test_partial_uuid_does_not_resolve(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    with pytest.raises(Exception):
        canonical._resolve_rec_id(SB(ROWS), "44444444")

def test_list_recruitments_without_q_does_not_ilike(monkeypatch):
    q = Query(ROWS)
    class SB3(SB):
        def table(self, name): return q if name=="recruitments" else Query([])
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB3(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    asyncio.run(canonical.list_recruitments(status=None, q=None, user=None))
    assert q.ilike_calls == []

def test_list_recruitments_with_q_uses_trimmed_string(monkeypatch):
    q = Query(ROWS)
    class SB3(SB):
        def table(self, name): return q if name=="recruitments" else Query([])
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB3(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    asyncio.run(canonical.list_recruitments(status=None, q=" ssc ", user=None))
    assert q.ilike_calls and q.ilike_calls[0][0][1] == "%ssc%"
