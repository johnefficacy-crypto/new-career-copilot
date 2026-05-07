import pytest
import asyncio
from app.api import canonical

class Resp:
    def __init__(self,data): self.data=data

class Query:
    def __init__(self, rows): self.rows=rows; self.filters={}
    def select(self,*a,**k): return self
    def in_(self,k,v): self.filters[k]=set(v); return self
    def eq(self,k,v): self.filters[k]=v; return self
    def ilike(self,*a,**k): return self
    def order(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def execute(self):
        out=self.rows
        if 'publish_status' in self.filters and isinstance(self.filters['publish_status'], set):
            out=[r for r in out if r.get('publish_status') in self.filters['publish_status']]
        if 'id' in self.filters and isinstance(self.filters['id'], str):
            out=[r for r in out if r.get('id')==self.filters['id']]
        return Resp(out)

class SB:
    def __init__(self, rows): self.rows=rows
    def table(self,name):
        return Query(self.rows if name=='recruitments' else [])

ROWS=[
 {"id":"1","name":"A","publish_status":"draft","status":"open","organizations":{"name":"Org"}},
 {"id":"2","name":"B","publish_status":"needs_review","status":"open","organizations":{"name":"Org"}},
 {"id":"3","name":"C","publish_status":"verified","status":"open","organizations":{"name":"Org"}},
 {"id":"4","name":"D","publish_status":"published","status":"open","organizations":{"name":"Org"}},
]

def test_public_list_only_published(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    out=asyncio.run(canonical.list_recruitments(status=None, q=None, user=None))
    assert [i['id'] for i in out['items']]==['4']

def test_public_detail_excludes_unpublished(monkeypatch):
    monkeypatch.setattr(canonical, 'get_supabase_admin', lambda: SB(ROWS))
    monkeypatch.setattr(canonical, '_safe', lambda call, default=None: call())
    monkeypatch.setattr(canonical, '_resolve_rec_id', lambda _sb,ref: ref)
    with pytest.raises(Exception):
        asyncio.run(canonical.get_recruitment('1', user=None))
    ok=asyncio.run(canonical.get_recruitment('4', user=None))
    assert ok['id']=='4'
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
