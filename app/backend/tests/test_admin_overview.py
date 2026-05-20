"""Coverage for GET /api/admin/overview.

The overview KPIs intentionally compose several counts in Python rather
than relying on a server-side aggregate. The fix in this PR collapses
duplicate-keyed counts so we issue one Supabase call per distinct
(table, filters) tuple instead of repeating ``moderation_items
status=open`` and ``copyright_claims status=received`` queries.

These tests pin both behaviours:
    * the response shape stays identical for the same DB state;
    * the number of Supabase queries drops by at least 2 per request.
"""
from __future__ import annotations

import pytest

from app.api import admin_overview


class R:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class Q:
    def __init__(self, table, state):
        self.table = table
        self.state = state
        self.filters: dict = {}
        self.gte_filters: dict = {}
        self.limit_n = None
        self.order_calls: list = []
        self.want_count = False

    def select(self, *a, count=None, **k):
        if count == "exact":
            self.want_count = True
        return self

    def eq(self, k, v):
        self.filters[k] = v
        return self

    def gte(self, k, v):
        self.gte_filters[k] = v
        return self

    def order(self, *a, **k):
        self.order_calls.append((a, k))
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def execute(self):
        return self.state.dispatch(self)


class SB:
    def __init__(self):
        self.tables: dict[str, list[dict]] = {}
        self.queries: list[Q] = []

    def table(self, name):
        q = Q(name, self)
        self.queries.append(q)
        return q

    def dispatch(self, q):
        rows = self.tables.get(q.table, [])
        filtered = [
            row for row in rows
            if all(row.get(k) == v for k, v in q.filters.items())
        ]
        if q.gte_filters:
            for k, v in q.gte_filters.items():
                filtered = [r for r in filtered if (r.get(k) or "") >= v]
        if q.limit_n is not None:
            filtered = filtered[: q.limit_n]
        return R([dict(r) for r in filtered], count=len(filtered) if q.want_count else None)


ADMIN_USER = {"id": "admin-1", "email": "a@b.c", "role": "admin"}


@pytest.fixture
def sb(monkeypatch):
    fake = SB()
    monkeypatch.setattr(admin_overview, "get_supabase_admin", lambda: fake)
    return fake


def _seed(sb):
    sb.tables["profiles"] = [{"id": f"u{i}"} for i in range(7)]
    sb.tables["recruitments"] = [
        {"id": "r1", "status": "active"},
        {"id": "r2", "status": "active"},
        {"id": "r3", "status": "archived"},
    ]
    sb.tables["forum_posts"] = [{"id": "p1"}, {"id": "p2"}]
    sb.tables["moderation_items"] = [
        {"id": "m1", "status": "open", "severity": "p0"},
        {"id": "m2", "status": "open", "severity": "p1"},
        {"id": "m3", "status": "resolved", "severity": "p0"},
    ]
    sb.tables["copyright_claims"] = [
        {"id": "c1", "status": "received"},
        {"id": "c2", "status": "received"},
        {"id": "c3", "status": "triage"},
        {"id": "c4", "status": "resolved"},
    ]
    sb.tables["scrape_runs"] = []
    sb.tables["admin_audit_logs"] = []


def test_overview_response_shape_stable(sb):
    _seed(sb)
    out = admin_overview.overview(user=ADMIN_USER)
    assert set(out.keys()) == {"kpis", "recent_audit"}
    assert set(out["kpis"].keys()) == {
        "users", "recruitments", "threads", "open_flags",
        "scrape_runs_today", "queue_depth", "moderation_p0_open",
        "copyright_open",
    }


def test_overview_kpi_values_match_seeded_state(sb):
    _seed(sb)
    out = admin_overview.overview(user=ADMIN_USER)
    kpis = out["kpis"]
    assert kpis["users"] == 7
    assert kpis["recruitments"] == 2  # only active
    assert kpis["threads"] == 2
    # 2 open moderation items
    assert kpis["open_flags"] == 2
    # open moderation (2) + received copyright (2)
    assert kpis["queue_depth"] == 4
    # severity=p0 AND status=open => 1
    assert kpis["moderation_p0_open"] == 1
    # received (2) + triage (1)
    assert kpis["copyright_open"] == 3


def test_overview_does_not_repeat_open_moderation_or_received_copyright(sb):
    _seed(sb)
    admin_overview.overview(user=ADMIN_USER)
    mod_open = [
        q for q in sb.queries
        if q.table == "moderation_items"
        and q.filters == {"status": "open"}
    ]
    cp_received = [
        q for q in sb.queries
        if q.table == "copyright_claims"
        and q.filters == {"status": "received"}
    ]
    # The dedupe collapses each duplicate-keyed count to exactly one
    # Supabase call.
    assert len(mod_open) == 1, "expected one moderation_items status=open query"
    assert len(cp_received) == 1, "expected one copyright_claims status=received query"


def test_overview_call_count_drops_versus_legacy(sb):
    """The legacy code path issued 8 distinct count queries for the
    duplicate-counted KPIs (open_flags x1, queue_depth x2,
    moderation_p0_open x1, copyright_open x2 = 6 for those, plus users,
    recruitments, threads, scrape_runs_today). The dedupe drops that by
    at least 2 — concretely, we now issue 3 queries that hit
    (moderation_items+open, copyright_claims+received, copyright_claims+
    triage) plus the same 4 base counts and the audit-log fetch.
    """
    _seed(sb)
    admin_overview.overview(user=ADMIN_USER)
    # Count only the count-style queries (those that asked for
    # count="exact"). The audit-log fetch is `order(...).limit(10)`.
    count_queries = [q for q in sb.queries if q.want_count]
    # users, recruitments, threads, moderation_items(open),
    # moderation_items(open,severity=p0), copyright(received),
    # copyright(triage), scrape_runs gte
    assert len(count_queries) <= 8, count_queries
    # Lower bound: must be at least 7 (all KPIs derived). Legacy was 10.
    assert 7 <= len(count_queries) <= 8