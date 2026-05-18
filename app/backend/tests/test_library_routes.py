"""Hot-fix regression tests for PR #328.

PR2's review-round commit accidentally appended a second copy of the
`/process-text` and `/pages` route handlers (the dupes also imported a
non-existent `TextExtractError` symbol). FastAPI silently kept the first
copy via route-resolution order, but the import would have blown up the
first time anyone hit the dupe. These tests pin both invariants so the
regression cannot land again.

We mount `library_api.router` under `/api` — the exact prefix `server.py`
uses — instead of importing the composed app, because the production
`server.py` pulls in optional deps (`apscheduler`, etc.) that aren't
installed in the test image. The duplication lived in the router itself,
so testing the router catches the bug end-to-end.
"""
from __future__ import annotations

from fastapi import FastAPI

from app.api import library as library_api


def _build_app() -> FastAPI:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    return app


def _count(app: FastAPI, path: str, method: str) -> int:
    return sum(
        1
        for r in app.routes
        if getattr(r, "path", None) == path
        and method in (getattr(r, "methods", None) or set())
    )


def test_no_duplicate_library_routes():
    app = _build_app()
    assert _count(app, "/api/library/items/{item_id}/process-text", "POST") == 1
    assert _count(app, "/api/library/items/{item_id}/pages", "GET") == 1


def test_openapi_no_duplicate_library_paths():
    app = _build_app()
    spec = app.openapi()
    assert "post" in spec["paths"]["/api/library/items/{item_id}/process-text"]
    assert "get" in spec["paths"]["/api/library/items/{item_id}/pages"]
