import pytest
from fastapi import HTTPException
from app.api import admin_trust

class R:
    def __init__(self,data=None,count=None): self.data=data; self.count=count
class Q:
    def __init__(self, table, store): self.table=table; self.store=store; self._id=None; self._payload=None
    def select(self,*a,**k): return self
    def eq(self,k,v):
        if k=='id': self._id=v
        if k=='official_url': self._payload=('official_url',v)
        return self
    def in_(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def insert(self,p): self._payload=p; return self
    def update(self,p): self._payload=p; return self
    def execute(self):
        if self.table=='source_registry' and self._payload and isinstance(self._payload, tuple):
            return R([])
        if self.table=='admin_audit_logs': return R([{}])
        if self.table in self.store:
            if self._payload and isinstance(self._payload, dict) and self._id:
                self.store[self.table][0].update(self._payload)
            if self._payload and self.table=='source_registry' and not self._id:
                row={"id":"s2",**self._payload}; self.store[self.table].append(row); return R([row])
            return R(self.store[self.table])
        return R([])
class SB:
    def __init__(self):
        self.store={"source_registry":[{"id":"s1","official_url":"https://a","is_active":True,"trust_score":0.5}],"recruitments":[{"id":"r1","publish_status":"published","status":"open","apply_start_date":"2026-05-01","apply_end_date":"2026-05-10"}],"organizations":[{"id":"o1","website_url":"https://x","official_domain":"x","is_verified":True}]}
    def table(self,name): return Q(name,self.store)


def test_invalid_trust_score(monkeypatch):
    monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:SB())
    with pytest.raises(HTTPException): admin_trust.create_source({"official_url":"https://n","source_type":"official_html","trust_score":2},{"id":"a","email":"e"})

def test_create_source_requires_explicit_source_type(monkeypatch):
    monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:SB())
    with pytest.raises(HTTPException) as exc:
        admin_trust.create_source({"official_url":"https://n","source_name":"No type"},{"id":"a","email":"e"})
    assert exc.value.status_code == 400
    assert "source_type" in str(exc.value.detail)

def test_create_source_accepts_aggregator_and_sets_discovery_policy(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:sb)
    out = admin_trust.create_source(
        {
            "official_url":"https://jobs.example/listing",
            "source_name":"Aggregator",
            "source_type":"aggregator",
            "is_verified":True,
            "trust_config":{"auto_promote":True},
        },
        {"id":"a","email":"e"},
    )
    item = out["item"]
    assert item["source_type"] == "aggregator"
    assert item["is_verified"] is False
    assert item["discovery_only"] is True
    assert item["requires_official_confirmation"] is True
    assert item["can_publish_directly"] is False
    assert item["trust_config"]["auto_promote"] is False

def test_create_source_accepts_official_html_without_html_default(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:sb)
    out = admin_trust.create_source({"official_url":"https://ssc.gov.in","source_name":"SSC","source_type":"official_html"},{"id":"a","email":"e"})
    assert out["item"]["source_type"] == "official_html"

def test_source_deactivate(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:sb)
    admin_trust.deactivate_source('s1', {"id":"a","email":"e"})
    assert sb.store['source_registry'][0]['is_active'] is False

def test_recruitment_update_moves_needs_review(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:sb)
    admin_trust.update_recruitment('r1', {"official_apply_url":"https://new"}, {"id":"a","email":"e"})
    assert sb.store['recruitments'][0]['publish_status']=='needs_review'

def test_org_update_clears_verified(monkeypatch):
    sb=SB(); monkeypatch.setattr(admin_trust,'get_supabase_admin',lambda:sb)
    admin_trust.update_organization('o1', {"website_url":"https://y"}, {"id":"a","email":"e"})
    assert sb.store['organizations'][0]['is_verified'] is False
