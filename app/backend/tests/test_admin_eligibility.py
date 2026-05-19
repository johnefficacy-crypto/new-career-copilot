"""Test coverage for the admin eligibility / publish-impact / audit endpoints
added across Sprints 2 and 3 (PRs #212 #214).

The endpoints under test (all in ``app.api.admin_eligibility``):
    GET    /api/admin/eligibility-recompute-queue
    POST   /api/admin/eligibility-recompute-queue/{queue_id}/retry
    POST   /api/admin/recruitments/{recruitment_id}/recompute-eligibility
    GET    /api/admin/recruitments/{recruitment_id}/publish-impact
    GET    /api/admin/audit

Tests bypass FastAPI and call the endpoint functions directly with a
hand-rolled Supabase mock (same pattern the rest of the admin test suite
uses). The mock returns canned rows for each table; tests assert the
endpoint logic + audit-log writes, not the network layer.
"""
from __future__ import annotations

import pytest

from app.api import admin_eligibility


# ════════════════════════════════════════════════════════════════════════════
#  Mock plumbing
# ════════════════════════════════════════════════════════════════════════════


class R:
    def __init__(self, data=None, count=None):
        self.data = data
        self.count = count


class Q:
    """One chained query builder per ``table(...)`` call.

    Records the filter chain so tests can assert what was sent. Supports
    select/eq/in_/is_/order/limit/range/update/insert/execute. The fake
    Supabase ``SB`` below intercepts ``execute()`` and returns table-
    specific canned rows.
    """

    def __init__(self, table, state):
        self.table = table
        self.state = state
        self.filters = {}
        self.in_filters = {}
        self.is_null = set()
        self.range_args = None
        self.limit_n = None
        self.payload = None
        self.op = "select"
        self.want_count = False

    def select(self, *a, count=None, **k):
        self.op = "select"
        if count == "exact":
            self.want_count = True
        return self

    def eq(self, key, value):
        self.filters[key] = value
        return self

    def in_(self, key, values):
        self.in_filters[key] = list(values)
        return self

    def is_(self, key, value):
        if value == "null":
            self.is_null.add(key)
        return self

    def order(self, *a, **k):
        return self

    def limit(self, n):
        self.limit_n = n
        return self

    def range(self, start, end):
        self.range_args = (start, end)
        return self

    def update(self, payload):
        self.op = "update"
        self.payload = payload
        return self

    def insert(self, payload):
        self.op = "insert"
        self.payload = payload
        return self

    def execute(self):
        return self.state.dispatch(self)


class SB:
    """Stateful fake Supabase admin client.

    ``tables`` is a dict of table_name → list[dict]. Tests mutate it via
    ``seed`` helpers. The ``dispatch`` method routes each ``execute()``
    call to the right slice + applies filters in memory.
    """

    def __init__(self):
        self.tables: dict[str, list[dict]] = {
            "eligibility_recompute_queue": [],
            "recruitments": [],
            "profiles": [],
            "eligibility_results": [],
            "notification_alerts": [],
            "admin_audit_logs": [],
        }
        self.audit_logs: list[dict] = []
        self.rpc_calls: list[tuple[str, dict]] = []
        self.queries: list[Q] = []

    def table(self, name):
        q = Q(name, self)
        self.queries.append(q)
        return q

    def rpc(self, name, params):
        # Match the production code path: the recompute-fan-out endpoint
        # calls enqueue_eligibility_recompute via RPC. We record the call
        # and raise so the helper falls through to the legacy insert
        # branch (which is what an environment without migration 041
        # applied would do), making the test deterministic across both
        # code paths.
        self.rpc_calls.append((name, params))

        class _Failing:
            def execute(self_inner):
                raise RuntimeError(
                    "PGRST202 Could not find the function "
                    f"public.{name} in the schema cache"
                )

        return _Failing()

    # ── routing helpers ────────────────────────────────────────────────
    def dispatch(self, q: Q):
        rows = self.tables.get(q.table, [])
        if q.op == "insert":
            assert isinstance(q.payload, dict)
            row = dict(q.payload)
            row.setdefault("id", f"{q.table}-{len(rows)+1}")
            rows.append(row)
            if q.table == "admin_audit_logs":
                self.audit_logs.append(row)
            return R([row])
        if q.op == "update":
            for row in rows:
                if all(row.get(k) == v for k, v in q.filters.items()):
                    row.update(q.payload or {})
            return R([])
        # SELECT — return *copies* so callers reading from the result
        # aren't reading the live in-memory row. Production Supabase
        # returns deserialised dicts; tests would otherwise see audit
        # writes capture post-update state when the endpoint reads the
        # pre-update value off the SELECT result.
        filtered = [
            dict(row) for row in rows
            if all(row.get(k) == v for k, v in q.filters.items())
            and all(row.get(k) in vs for k, vs in q.in_filters.items())
            and all(row.get(k) is None for k in q.is_null)
        ]
        if q.range_args is not None:
            start, end = q.range_args
            filtered = filtered[start : end + 1]
        elif q.limit_n is not None:
            filtered = filtered[: q.limit_n]
        count = len(filtered) if q.want_count else None
        return R(filtered, count=count)


@pytest.fixture
def sb(monkeypatch):
    fake = SB()
    monkeypatch.setattr(admin_eligibility, "get_supabase_admin", lambda: fake)
    # Patch the recompute helper's supabase fetch too. The fan-out
    # endpoint imports it from a sibling module; route both through the
    # same fake so audit + rpc fall-through stay consistent.
    from app.eligibility import recompute_queue as rq
    if hasattr(rq, "get_supabase_admin"):
        monkeypatch.setattr(rq, "get_supabase_admin", lambda: fake)
    return fake


# Bypass FastAPI permission deps by calling the route functions directly
# with a fake admin user dict. Endpoints with ``Query(default=...)``
# parameters need those passed explicitly when called outside FastAPI;
# the helpers below thread the defaults through so each test stays
# focused on the behaviour it's asserting.
ADMIN_USER = {"id": "admin-1", "email": "admin@example.com"}


def _list_queue(**kwargs):
    defaults = {"status": None, "limit": 50, "offset": 0, "recruitment_id": None, "_admin": ADMIN_USER}
    defaults.update(kwargs)
    return admin_eligibility.list_recompute_queue(**defaults)


def _list_audit(**kwargs):
    defaults = {"entity_id": None, "limit": 50, "offset": 0, "_admin": ADMIN_USER}
    defaults.update(kwargs)
    return admin_eligibility.list_audit_entries(**defaults)


# ════════════════════════════════════════════════════════════════════════════
#  GET /api/admin/eligibility-recompute-queue
# ════════════════════════════════════════════════════════════════════════════


def test_list_recompute_queue_returns_counts_per_status(sb):
    sb.tables["eligibility_recompute_queue"] = [
        {"id": "r1", "user_id": "u1", "recruitment_id": "rec-1", "status": "pending"},
        {"id": "r2", "user_id": "u2", "recruitment_id": "rec-1", "status": "failed", "last_error": "boom", "attempt_count": 2},
        {"id": "r3", "user_id": "u3", "recruitment_id": "rec-2", "status": "processed"},
    ]
    out = _list_queue()
    assert out["total"] == 3
    assert {item["id"] for item in out["items"]} == {"r1", "r2", "r3"}
    # Counts come from a separate query path per status — assert each was
    # tallied independently rather than from the items page.
    assert out["counts"]["pending"] == 1
    assert out["counts"]["failed"] == 1
    assert out["counts"]["processed"] == 1
    assert out["filters"] == {"status": None, "recruitment_id": None}


def test_list_recompute_queue_filters_by_status_and_recruitment(sb):
    sb.tables["eligibility_recompute_queue"] = [
        {"id": "r1", "user_id": "u1", "recruitment_id": "rec-1", "status": "failed"},
        {"id": "r2", "user_id": "u2", "recruitment_id": "rec-2", "status": "failed"},
        {"id": "r3", "user_id": "u3", "recruitment_id": "rec-1", "status": "processed"},
    ]
    out = _list_queue(status="failed", recruitment_id="rec-1")
    assert [item["id"] for item in out["items"]] == ["r1"]
    assert out["filters"]["status"] == "failed"
    assert out["filters"]["recruitment_id"] == "rec-1"


def test_list_recompute_queue_carries_failure_metadata_for_ui(sb):
    """``last_error`` and ``attempt_count`` flow through so the drawer can
    show why a retry might or might not help — sanity check that the
    selection columns aren't accidentally narrowed."""
    sb.tables["eligibility_recompute_queue"] = [{
        "id": "r1", "user_id": "u1", "status": "failed",
        "last_error": "connection refused",
        "attempt_count": 4,
        "next_attempt_at": "2026-05-15T10:00:00+00:00",
    }]
    out = _list_queue()
    row = out["items"][0]
    assert row["last_error"] == "connection refused"
    assert row["attempt_count"] == 4
    assert row["next_attempt_at"] == "2026-05-15T10:00:00+00:00"


# ════════════════════════════════════════════════════════════════════════════
#  POST /api/admin/eligibility-recompute-queue/{id}/retry
# ════════════════════════════════════════════════════════════════════════════


def test_retry_recompute_resets_failed_row_to_pending(sb):
    sb.tables["eligibility_recompute_queue"] = [{
        "id": "r1", "user_id": "u1", "status": "failed",
        "attempt_count": 3, "last_error": "timeout",
    }]
    out = admin_eligibility.retry_recompute_row("r1", admin=ADMIN_USER)
    assert out == {"ok": True, "id": "r1", "status": "pending"}
    row = sb.tables["eligibility_recompute_queue"][0]
    assert row["status"] == "pending"
    # attempt_count cleared so the worker treats this as a fresh attempt,
    # not just another retry of an exhausted row.
    assert row["attempt_count"] == 0
    assert row["last_error"] is None
    # Audit row written with the previous state for forensics.
    assert any(a["action"] == "eligibility.recompute.retry" for a in sb.audit_logs)
    audit = next(a for a in sb.audit_logs if a["action"] == "eligibility.recompute.retry")
    assert audit["new_value"]["previous_status"] == "failed"
    assert audit["new_value"]["previous_attempt_count"] == 3


def test_retry_recompute_refuses_processing_row(sb):
    """Retrying a row that's currently being processed would double-run
    the eligibility engine for that user. The endpoint must reject this
    with 409 rather than silently overwriting state."""
    sb.tables["eligibility_recompute_queue"] = [{
        "id": "r1", "user_id": "u1", "status": "processing", "attempt_count": 1,
    }]
    with pytest.raises(Exception) as exc:
        admin_eligibility.retry_recompute_row("r1", admin=ADMIN_USER)
    assert exc.value.status_code == 409
    # Detail body carries the current status so the UI can render an
    # informative "this is currently running" message.
    assert exc.value.detail["current_status"] == "processing"


def test_retry_recompute_404_on_unknown_id(sb):
    with pytest.raises(Exception) as exc:
        admin_eligibility.retry_recompute_row("missing", admin=ADMIN_USER)
    assert exc.value.status_code == 404


def test_retry_recompute_422_on_bogus_id(sb):
    with pytest.raises(Exception) as exc:
        admin_eligibility.retry_recompute_row("", admin=ADMIN_USER)
    assert exc.value.status_code == 422


# ════════════════════════════════════════════════════════════════════════════
#  POST /api/admin/recruitments/{id}/recompute-eligibility
# ════════════════════════════════════════════════════════════════════════════


def test_recompute_fanout_enqueues_one_row_per_onboarded_user(sb):
    sb.tables["recruitments"] = [{"id": "rec-1", "name": "Test", "publish_status": "published"}]
    sb.tables["profiles"] = [
        {"id": "u1", "onboarding_completed": True},
        {"id": "u2", "onboarding_completed": True},
        {"id": "u3", "onboarding_completed": True},
    ]
    body = admin_eligibility.RecruitmentRecomputeBody(reason="cli_test")
    out = admin_eligibility.recompute_eligibility_for_recruitment(
        "rec-1", body=body, admin=ADMIN_USER,
    )
    assert out["ok"] is True
    assert out["enqueued"] == 3
    assert out["candidate_user_count"] == 3
    assert out["cap_hit"] is False
    # Three RPC calls — one per onboarded user. Each falls through to the
    # legacy python path which inserts into the queue table.
    assert len(sb.rpc_calls) == 3
    assert all(c[0] == "enqueue_eligibility_recompute" for c in sb.rpc_calls)
    # Audit row records the fan-out summary, not each individual enqueue.
    assert any(a["action"] == "eligibility.recompute.fan_out" for a in sb.audit_logs)
    audit = next(a for a in sb.audit_logs if a["action"] == "eligibility.recompute.fan_out")
    assert audit["new_value"]["enqueued"] == 3


def test_recompute_fanout_404_when_recruitment_missing(sb):
    sb.tables["profiles"] = [{"id": "u1", "onboarding_completed": True}]
    with pytest.raises(Exception) as exc:
        admin_eligibility.recompute_eligibility_for_recruitment(
            "missing", body=None, admin=ADMIN_USER,
        )
    assert exc.value.status_code == 404
    # No profiles should have been read — fail-fast on the recruitment lookup.
    assert sb.rpc_calls == []


def test_recompute_fanout_skips_non_onboarded_users(sb):
    """The publish trigger only fans out to onboarded profiles; the manual
    endpoint must mirror that policy so manual fan-out doesn't enqueue
    recomputes the user-facing engine then drops."""
    sb.tables["recruitments"] = [{"id": "rec-1", "name": "T", "publish_status": "published"}]
    sb.tables["profiles"] = [
        {"id": "u1", "onboarding_completed": True},
        {"id": "u2", "onboarding_completed": False},
    ]
    out = admin_eligibility.recompute_eligibility_for_recruitment(
        "rec-1", body=None, admin=ADMIN_USER,
    )
    assert out["enqueued"] == 1
    assert len(sb.rpc_calls) == 1


def test_recompute_fanout_respects_max_users_cap(sb):
    """``max_users`` is a per-call safety bound. The endpoint must surface
    ``cap_hit=True`` whenever the candidate set was sliced."""
    sb.tables["recruitments"] = [{"id": "rec-1", "name": "T", "publish_status": "published"}]
    sb.tables["profiles"] = [
        {"id": f"u{i}", "onboarding_completed": True} for i in range(10)
    ]
    body = admin_eligibility.RecruitmentRecomputeBody(max_users=3)
    out = admin_eligibility.recompute_eligibility_for_recruitment(
        "rec-1", body=body, admin=ADMIN_USER,
    )
    assert out["enqueued"] == 3
    assert out["cap_hit"] is True


# ════════════════════════════════════════════════════════════════════════════
#  GET /api/admin/recruitments/{id}/publish-impact
# ════════════════════════════════════════════════════════════════════════════


def test_publish_impact_returns_zero_state_for_unpublished_recruitment(sb):
    sb.tables["recruitments"] = [{
        "id": "rec-1", "name": "Draft", "publish_status": "needs_review",
        "apply_end_date": None,
    }]
    sb.tables["profiles"] = [
        {"id": "u1", "onboarding_completed": True, "dob": "2000-01-01"},
        {"id": "u2", "onboarding_completed": True, "dob": None},
    ]
    out = admin_eligibility.publish_impact("rec-1", _admin=ADMIN_USER)
    assert out["recruitment_id"] == "rec-1"
    assert out["user_base"]["onboarded_count"] == 2
    assert out["user_base"]["missing_dob_count"] == 1
    # No prior results — the recruitment has never been recomputed.
    assert out["current_verdicts"]["has_prior_results"] is False
    assert out["current_verdicts"]["eligible"] == 0
    assert out["current_verdicts"]["conditional"] == 0
    assert out["current_verdicts"]["ineligible"] == 0
    assert out["expected_recompute_fanout"] == 2


def test_publish_impact_counts_eligibility_results_split(sb):
    """The split between eligible / conditional / ineligible is computed
    by inspecting ``reasons`` for an ``is_unverifiable`` flag — conditional
    rows look eligible if you only check ``is_eligible``. Guard against
    that regression."""
    sb.tables["recruitments"] = [{"id": "rec-1", "name": "Published"}]
    sb.tables["profiles"] = []
    sb.tables["eligibility_results"] = [
        # Two clearly eligible.
        {"recruitment_id": "rec-1", "is_eligible": True, "reasons": []},
        {"recruitment_id": "rec-1", "is_eligible": True, "reasons": [{"is_unverifiable": False}]},
        # One conditional (eligible-ish but has an unverifiable check).
        {"recruitment_id": "rec-1", "is_eligible": True, "reasons": [{"is_unverifiable": True}]},
        # Two ineligible.
        {"recruitment_id": "rec-1", "is_eligible": False, "reasons": [{"rule": "age"}]},
        {"recruitment_id": "rec-1", "is_eligible": False, "reasons": []},
    ]
    out = admin_eligibility.publish_impact("rec-1", _admin=ADMIN_USER)
    assert out["current_verdicts"]["has_prior_results"] is True
    assert out["current_verdicts"]["eligible"] == 2
    assert out["current_verdicts"]["conditional"] == 1
    assert out["current_verdicts"]["ineligible"] == 2


def test_publish_impact_404_when_recruitment_missing(sb):
    with pytest.raises(Exception) as exc:
        admin_eligibility.publish_impact("missing", _admin=ADMIN_USER)
    assert exc.value.status_code == 404


def test_publish_impact_422_on_bogus_id(sb):
    with pytest.raises(Exception) as exc:
        admin_eligibility.publish_impact("", _admin=ADMIN_USER)
    assert exc.value.status_code == 422


def test_publish_impact_computes_days_to_deadline(sb):
    """Tight deadlines (≤ 3 days) drive a UI warning. The backend
    computes the day delta against the apply_end_date — bug here would
    surface as wrong urgency framing in the admin drawer."""
    from datetime import datetime, timedelta, timezone

    future = (datetime.now(timezone.utc) + timedelta(days=5)).isoformat()
    sb.tables["recruitments"] = [{
        "id": "rec-1", "name": "T", "publish_status": "verified",
        "apply_end_date": future,
    }]
    out = admin_eligibility.publish_impact("rec-1", _admin=ADMIN_USER)
    assert out["deadline"]["apply_end_date"] == future
    # Allow ±1 day to absorb clock drift across test runs.
    assert 4 <= out["deadline"]["days_to_deadline"] <= 5


# ════════════════════════════════════════════════════════════════════════════
#  GET /api/admin/audit
# ════════════════════════════════════════════════════════════════════════════


def test_list_audit_entries_filters_by_entity(sb):
    sb.tables["admin_audit_logs"] = [
        {"id": "a1", "action": "source.create", "entity_type": "source", "entity_id": "s1"},
        {"id": "a2", "action": "recruitment.publish", "entity_type": "recruitment", "entity_id": "r1"},
        {"id": "a3", "action": "source.verify", "entity_type": "source", "entity_id": "s1"},
        {"id": "a4", "action": "source.update", "entity_type": "source", "entity_id": "s2"},
    ]
    out = _list_audit(entity_type="source", entity_id="s1")
    assert {item["id"] for item in out["items"]} == {"a1", "a3"}
    assert out["total"] == 2


def test_list_audit_entries_unknown_entity_type_rejected(sb):
    with pytest.raises(Exception) as exc:
        _list_audit(entity_type="not_a_real_entity")
    assert exc.value.status_code == 422


def test_list_audit_entries_returns_all_for_entity_type_when_id_omitted(sb):
    sb.tables["admin_audit_logs"] = [
        {"id": "a1", "action": "source.create", "entity_type": "source", "entity_id": "s1"},
        {"id": "a2", "action": "source.create", "entity_type": "source", "entity_id": "s2"},
    ]
    out = _list_audit(entity_type="source")
    assert out["total"] == 2
