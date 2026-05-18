"""PR3 — `/api/library/items/{id}/pages` light-listing tests.

Verifies the additive ``include_text`` / ``limit`` / ``offset`` query
params on the existing pages endpoint without disturbing the default
shape that #328's tests pin byte-for-byte.

Shares the in-memory Supabase + storage stubs from
``test_library_text_extract.py`` rather than duplicating them — the
PR2 stub already implements every operator (``eq``, ``in_``, ``lt``,
``range``, ``order``, ``limit``, ``neq``) the new endpoint uses.
"""
from __future__ import annotations

from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import library as library_api
from app.core.auth import get_current_user

from tests.test_library_text_extract import _SB, USER_A, USER_B, _seed_doc


@pytest.fixture
def sb(monkeypatch):
    fake = _SB()
    monkeypatch.setattr(library_api, "get_supabase_admin", lambda: fake)
    return fake


def _client(sb_: _SB, user: dict) -> TestClient:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _seed_pages(sb_: _SB, doc_id: str, count: int) -> None:
    sb_.db["document_pages"] = [
        {
            "id": str(uuid4()),
            "document_id": doc_id,
            "page_number": i,
            "text_content": f"body of page {i}",
            "char_count": 10 + i,
            "extraction_status": "extracted",
            "metadata": {},
        }
        for i in range(1, count + 1)
    ]


def test_default_get_returns_text_unchanged(sb):
    doc_id = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _seed_pages(sb, doc_id, count=3)

    r = _client(sb, USER_A).get(f"/api/library/items/{doc_id}/pages")
    assert r.status_code == 200
    body = r.json()
    # PR2's tests pinned this exact response shape — text_content present
    # on every page object, page_number ordering preserved.
    assert body["count"] == 3
    assert [p["page_number"] for p in body["pages"]] == [1, 2, 3]
    for page in body["pages"]:
        assert "text_content" in page
        assert page["text_content"].startswith("body of page ")


def test_include_text_false_omits_text_field(sb):
    doc_id = "aaaaaaaa-2222-2222-2222-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _seed_pages(sb, doc_id, count=2)

    r = _client(sb, USER_A).get(
        f"/api/library/items/{doc_id}/pages",
        params={"include_text": "false"},
    )
    assert r.status_code == 200
    pages = r.json()["pages"]
    assert len(pages) == 2
    for page in pages:
        # Critical contract: key is OMITTED, not present-with-None.
        assert "text_content" not in page, page
        # Companion fields stay intact so clients can still render
        # page_number badges, char_count chips, etc.
        assert "page_number" in page
        assert "char_count" in page
        assert "extraction_status" in page


def test_include_text_false_with_limit_and_offset(sb):
    doc_id = "aaaaaaaa-3333-3333-3333-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _seed_pages(sb, doc_id, count=20)

    r = _client(sb, USER_A).get(
        f"/api/library/items/{doc_id}/pages",
        params={"include_text": "false", "limit": 10, "offset": 5},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["count"] == 10
    assert body["limit"] == 10
    assert body["offset"] == 5
    assert [p["page_number"] for p in body["pages"]] == list(range(6, 16))
    for page in body["pages"]:
        assert "text_content" not in page


def test_limit_above_max_rejected(sb):
    doc_id = "aaaaaaaa-4444-4444-4444-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _seed_pages(sb, doc_id, count=1)
    # Pydantic's `le=500` rejects with 422. PR2's own test on this same
    # endpoint asserts 422 for `limit=9999`; we mirror that convention
    # so the validation contract is consistent across the surface.
    r = _client(sb, USER_A).get(
        f"/api/library/items/{doc_id}/pages",
        params={"limit": 501},
    )
    assert r.status_code == 422


def test_offset_negative_rejected(sb):
    doc_id = "aaaaaaaa-5555-5555-5555-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _seed_pages(sb, doc_id, count=1)
    r = _client(sb, USER_A).get(
        f"/api/library/items/{doc_id}/pages",
        params={"offset": -1},
    )
    assert r.status_code == 422


def test_non_owner_404(sb):
    doc_id = "aaaaaaaa-6666-6666-6666-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    _seed_pages(sb, doc_id, count=1)

    r = _client(sb, USER_B).get(
        f"/api/library/items/{doc_id}/pages",
        params={"include_text": "false"},
    )
    # The library API uses 404-not-403 to avoid leaking existence to
    # non-owners (matches PR1/PR2 convention).
    assert r.status_code == 404
