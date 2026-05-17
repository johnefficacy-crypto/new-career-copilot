"""Phase 5 regression guard — fail CI if any (path, method) is registered
by more than one router.

Today, ``app/api/study_os.py`` and ``app/api/canonical.py`` both define
routes under ``/api/study/*``. Phase 5 removed the 5 overlapping
handlers from canonical.py so study_os.py is the single owner of each
overlapping path. This test pins that single-owner invariant so a future
PR that re-adds a duplicate handler fails immediately, not after a
behavioral regression surfaces in production.

The check is intentionally simple: enumerate every route on the mounted
FastAPI app and assert no (path, method) pair appears twice. FastAPI
allows duplicates silently and resolves by registration order, which is
exactly what made the original duplication fragile.
"""
from __future__ import annotations

from collections import Counter


def _collect_routes(app) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    for route in app.routes:
        path = getattr(route, "path", None)
        methods = getattr(route, "methods", None)
        if not path or not methods:
            continue
        # Skip OPTIONS / HEAD — CORS / health pings are not duplicates
        # in any meaningful sense.
        for m in methods:
            if m in {"OPTIONS", "HEAD"}:
                continue
            pairs.append((path, m))
    return pairs


def test_no_duplicate_study_route_registrations():
    """Importing server.py loads every router. Every (path, method) pair
    under ``/api/study/*`` must appear exactly once — Phase 5 consolidated
    the study_os.py ↔ canonical.py overlap to make this true. Future PRs
    that re-introduce a duplicate fail here.

    Scope: ``/api/study/*`` only. Other overlaps elsewhere in the app
    (accountability, community) pre-date Phase 5 and are out of scope for
    this spec; consolidating them belongs in separate workstreams.
    """
    import server  # noqa: PLC0415 — intentional late import

    pairs = [(p, m) for (p, m) in _collect_routes(server.app) if p.startswith("/api/study/")]
    counts = Counter(pairs)
    dupes = sorted([(p, m) for (p, m), n in counts.items() if n > 1])
    assert not dupes, (
        "Duplicate /api/study/* route registrations detected — this is the "
        "failure mode Phase 5 of admin-study-os-operations.md was designed "
        "to prevent. Each (path, method) below is registered by more than "
        "one router; pick one canonical owner and remove the other.\n  "
        + "\n  ".join(f"{method:6s} {path}" for (path, method) in dupes)
    )


def test_phase5_study_os_routes_have_single_owner():
    """Specific guard for the 5 paths Phase 5 consolidated.

    These were the canonical/study_os overlap inventoried in
    docs/engineering/admin-study-os-operations.md §10. Each must now
    appear exactly once across all routers.
    """
    import server  # noqa: PLC0415

    pairs = _collect_routes(server.app)
    counts = Counter(pairs)

    expected_single = [
        ("/api/study/mocks", "GET"),
        ("/api/study/mocks", "POST"),
        ("/api/study/mocks/{mock_id}/correction-tasks", "POST"),
        ("/api/study/subjects", "GET"),
        ("/api/study/weekly-review", "GET"),
    ]
    for path, method in expected_single:
        n = counts.get((path, method), 0)
        assert n == 1, (
            f"Expected {method} {path} to be owned by exactly one router; "
            f"found {n} registrations. Phase 5 invariant violated."
        )
