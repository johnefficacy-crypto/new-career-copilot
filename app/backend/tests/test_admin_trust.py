from app.api import admin_trust


def test_verify_url_flags_suspicious_and_non_https(monkeypatch):
    class Resp:
        history = []
        url = "http://example.com"
        headers = {"content-type": "text/html"}
    monkeypatch.setattr(admin_trust.requests, "get", lambda *a, **k: Resp())
    checks, warnings, errors, ctype, _ = admin_trust._verify_url("http://tinyurl.com/x")
    assert "reachable" in checks
    assert "non_https_official_url" in warnings
    assert "suspicious_domain" in warnings
    assert not errors
    assert ctype == "html"


def test_verify_url_unreachable(monkeypatch):
    def bad(*_a, **_k):
        raise RuntimeError("boom")
    monkeypatch.setattr(admin_trust.requests, "get", bad)
    checks, warnings, errors, _, _ = admin_trust._verify_url("https://good.gov")
    assert not checks
    assert errors


def test_publish_readiness_blocks_reversed_dates(monkeypatch):
    class R:
        def __init__(self, data): self.data=data
    class Q:
        def __init__(self, data): self._data=data
        def select(self,*a,**k): return self
        def eq(self,*a,**k): return self
        def limit(self,*a,**k): return self
        def execute(self): return R(self._data)
    class SB:
        def table(self, name):
            if name=="recruitments":
                return Q([{"id":"r1","organization_id":"o1","organizations":{"is_verified":True},"official_notification_url":"https://x.gov/n","official_apply_url":"https://x.gov/a","status":"open","apply_start_date":"2026-05-10","apply_end_date":"2026-05-01","posts":[{"id":"p"}],"rules_unavailable":True,"recruitment_sources":[{"source_registry":{"is_verified":True}}]}])
            return Q([])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: SB())
    out = admin_trust.validate_recruitment_publish_readiness("r1", {"id":"a"})
    assert not out["ready"]
    assert "apply_dates_reversed" in out["blocking_issues"]
