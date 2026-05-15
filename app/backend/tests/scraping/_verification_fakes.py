"""In-memory fake Supabase client for verification_reports tests.

Simulates just enough of the supabase-py client surface to exercise
``app.scraping.verification_reports``:

* ``.table(name).select(...).is_(...).eq(...).limit(...).execute()``
* ``.table(name).update({...}).eq("id", id).execute()``
* ``.table(name).insert({...}).execute()``
* ``.rpc(name, args).execute()`` — implements the two PR1 RPCs.

The point is to test the service's correctness, not the supabase-py
wire format. We don't try to be a general fake — just sound enough for
the contracts the spec calls out (noop on hash match, supersession
chain, version monotonicity, partial-unique-index races).
"""
from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any


class _ExecResult:
    def __init__(self, data: Any) -> None:
        self.data = data


class _Query:
    """Filter chain for a single ``table(name)`` call.

    Records filters as a list of (op, col, val) and applies them to the
    in-memory rows when ``.execute()`` runs. Supports the chain shapes
    used by ``verification_reports.py``.
    """

    def __init__(self, store: "FakeSupabase", table: str) -> None:
        self._store = store
        self._table = table
        self._filters: list[tuple[str, str, Any]] = []
        self._limit: int | None = None
        self._mode: str = "select"
        self._update_payload: dict[str, Any] | None = None
        self._insert_payload: dict[str, Any] | None = None

    # ── builder mutations ─────────────────────────────────────────────

    def select(self, *_args: Any, **_kw: Any) -> "_Query":
        self._mode = "select"
        return self

    def update(self, payload: dict[str, Any]) -> "_Query":
        self._mode = "update"
        self._update_payload = payload
        return self

    def insert(self, payload: dict[str, Any]) -> "_Query":
        self._mode = "insert"
        self._insert_payload = payload
        return self

    def eq(self, col: str, val: Any) -> "_Query":
        self._filters.append(("eq", col, val))
        return self

    def is_(self, col: str, val: Any) -> "_Query":
        self._filters.append(("is", col, val))
        return self

    def limit(self, n: int) -> "_Query":
        self._limit = n
        return self

    # ── runner ────────────────────────────────────────────────────────

    def _matches(self, row: dict[str, Any]) -> bool:
        for op, col, val in self._filters:
            if op == "eq":
                if row.get(col) != val:
                    return False
            elif op == "is":
                if val is None:
                    if row.get(col) is not None:
                        return False
                else:
                    if row.get(col) != val:
                        return False
            else:
                raise NotImplementedError(op)
        return True

    def execute(self) -> _ExecResult:
        rows = self._store._tables.setdefault(self._table, [])
        if self._mode == "select":
            out = [deepcopy(r) for r in rows if self._matches(r)]
            if self._limit is not None:
                out = out[: self._limit]
            return _ExecResult(out)
        if self._mode == "update":
            updated: list[dict[str, Any]] = []
            for r in rows:
                if self._matches(r):
                    r.update(self._update_payload or {})
                    self._store._enforce_constraints(self._table, r)
                    updated.append(deepcopy(r))
            return _ExecResult(updated)
        if self._mode == "insert":
            payload = dict(self._insert_payload or {})
            payload.setdefault("id", str(uuid.uuid4()))
            rows.append(payload)
            self._store._enforce_constraints(self._table, payload)
            return _ExecResult([deepcopy(payload)])
        raise NotImplementedError(self._mode)


class _RpcCall:
    def __init__(self, store: "FakeSupabase", name: str, args: dict[str, Any]) -> None:
        self._store = store
        self._name = name
        self._args = args

    def execute(self) -> _ExecResult:
        if self._name == "create_verification_report":
            return _ExecResult(self._store._rpc_create(self._args["payload"]))
        if self._name == "supersede_and_create_verification_report":
            return _ExecResult(
                self._store._rpc_supersede(self._args["old_id"], self._args["payload"])
            )
        raise NotImplementedError(self._name)


class FakeSupabase:
    """Tiny in-memory supabase double.

    Use directly as the ``supabase`` argument to verification_reports
    helpers. Inspect state via :attr:`rows` or :meth:`get_table`.
    """

    TABLE = "recruitment_verification_reports"

    def __init__(self) -> None:
        self._tables: dict[str, list[dict[str, Any]]] = {self.TABLE: []}
        # Toggle on a test that wants to assert the service surfaces
        # an RPC outage cleanly.
        self.rpc_disabled: set[str] = set()

    # ── public test helpers ───────────────────────────────────────────

    @property
    def rows(self) -> list[dict[str, Any]]:
        return self._tables[self.TABLE]

    def get_table(self, name: str) -> list[dict[str, Any]]:
        return self._tables.setdefault(name, [])

    # ── client surface ────────────────────────────────────────────────

    def table(self, name: str) -> _Query:
        return _Query(self, name)

    def rpc(self, name: str, args: dict[str, Any]) -> _RpcCall:
        if name in self.rpc_disabled:
            raise RuntimeError(f"PGRST202: {name} not found in schema cache")
        return _RpcCall(self, name, args)

    # ── RPC implementations ───────────────────────────────────────────

    def _rpc_create(self, payload: dict[str, Any]) -> dict[str, Any]:
        row = dict(payload)
        row.setdefault("id", str(uuid.uuid4()))
        row.setdefault("report_version", 1)
        # Chain root bootstrap.
        if not row.get("chain_root_id"):
            row["chain_root_id"] = row["id"]
        row.setdefault("created_at", "2026-01-01T00:00:00+00:00")
        row.setdefault("updated_at", row["created_at"])
        self._enforce_constraints(self.TABLE, row)
        self._enforce_active_uniqueness(row)
        self._tables[self.TABLE].append(row)
        return deepcopy(row)

    def _rpc_supersede(self, old_id: str, payload: dict[str, Any]) -> dict[str, Any]:
        old = self._find_by_id(self.TABLE, old_id)
        if old is None:
            raise RuntimeError(f"verification_report {old_id} not found")
        if old.get("superseded_by") is not None:
            raise RuntimeError(f"verification_report {old_id} already superseded")
        # Free the active slot first.
        old["superseded_by"] = "__placeholder__"
        old["lifecycle_status"] = "superseded"

        new_row = dict(payload)
        new_row.setdefault("id", str(uuid.uuid4()))
        if not new_row.get("report_version"):
            new_row["report_version"] = old["report_version"] + 1
        if not new_row.get("chain_root_id"):
            new_row["chain_root_id"] = old.get("chain_root_id") or new_row["id"]
        new_row.setdefault("created_at", "2026-01-01T00:00:00+00:00")
        new_row.setdefault("updated_at", new_row["created_at"])
        self._enforce_constraints(self.TABLE, new_row)
        self._enforce_active_uniqueness(new_row)
        self._tables[self.TABLE].append(new_row)

        old["superseded_by"] = new_row["id"]
        return deepcopy(new_row)

    # ── invariants ────────────────────────────────────────────────────

    def _enforce_constraints(self, table: str, row: dict[str, Any]) -> None:
        """Mirror the DB CHECK constraints declared in migration 075.

        Catches service-level bugs that would otherwise only surface in
        a live DB integration test.
        """
        if table != self.TABLE:
            return
        if not row.get("scrape_queue_id") and not row.get("recruitment_id"):
            raise ValueError("chk_verification_report_owner")
        lifecycle = row.get("lifecycle_status")
        if lifecycle not in {"classified", "backfilled_needs_review", "superseded", "rejected"}:
            raise ValueError(f"chk_lifecycle_status: {lifecycle!r}")
        tier = row.get("criticality_tier")
        if tier not in {"A_HIGH_STAKES", "B_TECHNICAL_CONDITIONAL", "C_STANDARD_LONG_TAIL"}:
            raise ValueError(f"chk_criticality_tier: {tier!r}")
        rec_action = row.get("recommended_action")
        if rec_action not in {
            "await_official_proof", "request_admin_review",
            "promote_eligible", "block_publish", "no_action",
        }:
            raise ValueError(f"chk_recommended_action: {rec_action!r}")
        trig = row.get("trigger_reason")
        if trig not in {
            "initial_scrape", "resubmission", "backfill_existing_recruitment",
            "corrigendum_detected", "source_hash_changed", "admin_requested",
            "canonical_field_edited", "source_trust_changed",
        }:
            raise ValueError(f"chk_trigger_reason: {trig!r}")
        if not row.get("exam_family_id") and not row.get("exam_family_key") and tier != "C_STANDARD_LONG_TAIL":
            raise ValueError("chk_exam_family_present")
        if (row.get("report_version") or 0) < 1:
            raise ValueError("chk_report_version_positive")
        if row.get("superseded_by") and row["superseded_by"] != "__placeholder__":
            if row["superseded_by"] == row.get("id"):
                raise ValueError("chk_no_self_supersede")

    def _enforce_active_uniqueness(self, new_row: dict[str, Any]) -> None:
        """Mirror the two partial-unique indexes from migration 075.

        ``uq_active_verification_report_queue`` and
        ``uq_active_verification_report_recruitment``.
        """
        if new_row.get("superseded_by"):
            return
        rows = self._tables[self.TABLE]
        qid = new_row.get("scrape_queue_id")
        rid = new_row.get("recruitment_id")
        for other in rows:
            if other is new_row or other.get("id") == new_row.get("id"):
                continue
            if other.get("superseded_by"):
                continue
            if qid is not None and other.get("scrape_queue_id") == qid:
                raise ValueError("uq_active_verification_report_queue")
            if (
                qid is None
                and rid is not None
                and other.get("scrape_queue_id") is None
                and other.get("recruitment_id") == rid
            ):
                raise ValueError("uq_active_verification_report_recruitment")

    def _find_by_id(self, table: str, id_: str) -> dict[str, Any] | None:
        for r in self._tables.setdefault(table, []):
            if r.get("id") == id_:
                return r
        return None
