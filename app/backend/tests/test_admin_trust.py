from app.api import admin_trust

class R:
    def __init__(self, data=None, count=None): self.data=data; self.count=count
class Q:
    def __init__(self, data): self._data=data
    def select(self,*a,**k): return self
    def eq(self,*a,**k): return self
    def limit(self,*a,**k): return self
    def execute(self): return R(self._data)


def _mk_rec(**kw):
    base={"id":"r1","organization_id":"o1","organizations":{"is_verified":True},"source_id":"s1","official_notification_url":"https://x.gov/n","official_apply_url":"https://x.gov/a","status":"open","apply_start_date":"2026-05-01","apply_end_date":"2026-05-10","posts":[{"id":"p"}],"rules_unavailable":True}
    base.update(kw);return base

def _set_sb(monkeypatch, rec, source=None):
    source = {"id":"s1","is_verified":True,"verification_status":"verified"} if source is None else source
    class SB:
        def table(self, name):
            if name=="recruitments":
                return Q([rec])
            if name=="source_registry" and source:
                return Q([source])
            return Q([])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: SB())


def test_missing_notification(monkeypatch):
    _set_sb(monkeypatch,_mk_rec(official_notification_url=None))
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert 'official_notification_url_missing' in out['blocking_issues']

def test_missing_apply_when_open(monkeypatch):
    _set_sb(monkeypatch,_mk_rec(official_apply_url=None,status='open'))
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert 'official_apply_url_missing_while_open' in out['blocking_issues']

def test_unverified_org(monkeypatch):
    _set_sb(monkeypatch,_mk_rec(organizations={"is_verified":False}))
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert 'organization_unverified' in out['blocking_issues']

def test_unverified_source(monkeypatch):
    _set_sb(monkeypatch,_mk_rec(), {"id":"s1","is_verified":False,"verification_status":"needs_review"})
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert 'unverified_source_provenance' in out['blocking_issues']

def test_reversed_dates(monkeypatch):
    _set_sb(monkeypatch,_mk_rec(apply_start_date='2026-05-10',apply_end_date='2026-05-01'))
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert 'apply_dates_reversed' in out['blocking_issues']

def test_publish_ready(monkeypatch):
    _set_sb(monkeypatch,_mk_rec())
    out=admin_trust.validate_recruitment_publish_readiness('r1',{})
    assert out['ready']
