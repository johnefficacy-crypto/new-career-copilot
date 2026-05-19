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


# ───────────────────────────────────────────────────────────────────────────
# Publish → eligibility recompute fan-out (regression for G6)
# ───────────────────────────────────────────────────────────────────────────


class _FanoutSB:
    """Stub that satisfies validate_recruitment_publish_readiness, recruitments
    update, profiles list, and the legacy enqueue path used by
    enqueue_eligibility_recompute when the RPC is unavailable."""

    def __init__(self, rec, source, profiles):
        self.rec = rec
        self.source = source
        self.profiles = profiles
        self.enqueued = []
        self.audits = []
        self.updates = []

    def table(self, name):
        outer = self

        class T:
            def __init__(self, table_name):
                self.name = table_name
                self._filters = {}
                self._payload = None

            def select(self, *a, **k):
                return self

            def order(self, *a, **k):
                return self

            def range(self, *a, **k):
                return self

            def eq(self, k, v):
                self._filters[k] = v
                return self

            def is_(self, k, v):
                self._filters[k] = None
                return self

            def in_(self, *a, **k):
                return self

            def limit(self, *a, **k):
                return self

            def insert(self, payload):
                self._payload = payload
                return self

            def update(self, payload):
                self._payload = payload
                return self

            def execute(self):
                if self.name == "recruitments":
                    if self._payload is not None:
                        outer.updates.append(dict(self._payload))
                        return R([{**outer.rec, **self._payload}])
                    return R([outer.rec])
                if self.name == "source_registry":
                    return R([outer.source])
                if self.name == "profiles":
                    return R(list(outer.profiles))
                if self.name == "eligibility_recompute_queue":
                    if self._payload is not None:
                        outer.enqueued.append(dict(self._payload))
                        return R([dict(self._payload)])
                    return R([])
                if self.name == "admin_audit_logs":
                    if self._payload is not None:
                        outer.audits.append(dict(self._payload))
                    return R([{}])
                return R([])

        return T(name)

    def rpc(self, fn, params):
        # Force the enqueue helper onto its legacy Python fallback so we can
        # observe the writes through this stub.
        raise RuntimeError("PGRST202 schema cache missing")


def test_publish_enqueues_recompute_for_every_onboarded_user(monkeypatch):
    """Publish must enqueue one recompute row per onboarded user; without this
    the recruitment is visible but no user sees an eligibility result. Covers G6."""
    rec = _mk_rec()
    sb = _FanoutSB(rec=rec, source={"id": "s1", "is_verified": True, "verification_status": "verified"},
                   profiles=[{"id": "u1"}, {"id": "u2"}, {"id": "u3"}])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: sb)
    out = admin_trust.publish_recruitment("r1", {"id": "admin-1", "email": "a@example.com"})
    assert out["ok"] is True
    assert out["recompute"]["enqueued"] == 3
    assert out["recompute"]["errors"] == 0
    assert {row["user_id"] for row in sb.enqueued} == {"u1", "u2", "u3"}
    assert all(row.get("recruitment_id") == "r1" for row in sb.enqueued)
    assert any(a.get("action") == "eligibility.recompute.publish_fan_out" for a in sb.audits)


# ───────────────────────────────────────────────────────────────────────────
# eligibility_ops stale_results: derived from rules_version mismatch
# ───────────────────────────────────────────────────────────────────────────


class _StaleSB:
    """Counts rows in eligibility_results matching .eq filters and returns
    .count from execute() — mirrors how the real client exposes count='exact'.
    Other tables (recruitments, eligibility_recompute_queue, profiles) return
    empty so eligibility_ops can run end-to-end."""

    def __init__(self, rows):
        self.rows = rows

    class _Q:
        def __init__(self, rows):
            self._rows = rows
            self._filters: list[tuple[str, str, object]] = []

        def select(self, *_a, **_k):
            return self

        def eq(self, k, v):
            self._filters.append((k, "eq", v))
            return self

        def in_(self, k, vals):
            self._filters.append((k, "in", set(vals)))
            return self

        def order(self, *_a, **_k):
            return self

        def limit(self, *_a, **_k):
            return self

        def execute(self):
            rows = self._rows
            for k, op, v in self._filters:
                if op == "eq":
                    rows = [r for r in rows if r.get(k) == v]
                elif op == "in":
                    rows = [r for r in rows if r.get(k) in v]
            return R(data=rows, count=len(rows))

    def table(self, name):
        if name == "eligibility_results":
            return self._Q(self.rows)
        return self._Q([])


def test_eligibility_ops_stale_counts_rules_version_mismatch(monkeypatch):
    # One row on the current engine version, one on an older bump, one with
    # NULL rules_version (pre-migration-039). Expect stale = 2 — count > 0.
    from app.eligibility.engine import RULES_VERSION
    sb = _StaleSB([
        {"id": "e1", "rules_version": RULES_VERSION},
        {"id": "e2", "rules_version": "2025.01"},
        {"id": "e3", "rules_version": None},
    ])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: sb)
    out = admin_trust.eligibility_ops()
    assert out["stale_results"] == 2
    assert "stale_results_error" not in out


def test_eligibility_ops_stale_zero_when_all_current(monkeypatch):
    from app.eligibility.engine import RULES_VERSION
    sb = _StaleSB([
        {"id": "e1", "rules_version": RULES_VERSION},
        {"id": "e2", "rules_version": RULES_VERSION},
    ])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: sb)
    out = admin_trust.eligibility_ops()
    assert out["stale_results"] == 0


def test_eligibility_ops_surfaces_stale_query_failure(monkeypatch):
    # When the count query blows up, we must surface — not silently return 0.
    class _Boom:
        def table(self, name):
            class _Q:
                def select(self, *a, **k): return self
                def eq(self, *a, **k): return self
                def in_(self, *a, **k): return self
                def order(self, *a, **k): return self
                def limit(self, *a, **k): return self
                def execute(self_inner):
                    if name == "eligibility_results":
                        raise RuntimeError("PGRST200 schema cache missing")
                    return R(data=[], count=0)
            return _Q()
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: _Boom())
    out = admin_trust.eligibility_ops()
    assert out["stale_results"] == 0
    assert "stale_results_error" in out
    assert "PGRST200" in out["stale_results_error"]


def test_publish_with_no_onboarded_users_is_still_ok(monkeypatch):
    """Empty fan-out must succeed (no users to enqueue) and the publish should
    still mark the recruitment published."""
    sb = _FanoutSB(rec=_mk_rec(), source={"id": "s1", "is_verified": True, "verification_status": "verified"}, profiles=[])
    monkeypatch.setattr(admin_trust, "get_supabase_admin", lambda: sb)
    out = admin_trust.publish_recruitment("r1", {"id": "admin-1", "email": "a@example.com"})
    assert out["ok"] is True
    assert out["recompute"]["enqueued"] == 0
    assert sb.enqueued == []
    assert any(u.get("publish_status") == "published" for u in sb.updates)
