"""Tests for PR2 — synchronous document text extraction.

Pattern mirrors PR1's `test_library.py`: in-memory Supabase stub +
in-memory storage facade, FastAPI sub-app mounted at `/api`,
`get_current_user` overridden per test. The stub from PR1 is extended
here to cover `in_`, `range`, `not_`, and the `rpc("replace_document_pages",
...)` call used by the extract service.

There is no `conftest.py` in the backend test tree, and the test stub does
not touch a real database. New migrations therefore need no fixture
plumbing — they are applied by the existing Supabase tooling outside
pytest. See PR2 README notes for migration order.

Patching policy: tests patch
`app.library.text_extract.parse_pdf_pages` (the symbol used by the
service module), never `app.scraping.fetcher.parse_pdf_pages`.
"""
from __future__ import annotations

import time
from typing import Any
from uuid import uuid4

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api import library as library_api
from app.core.auth import get_current_user
from app.library import text_extract as text_extract_mod


USER_A = {
    "id": "11111111-1111-1111-1111-111111111111",
    "email": "a@example.com",
    "role": "user",
    "plan": "free",
}
USER_B = {
    "id": "22222222-2222-2222-2222-222222222222",
    "email": "b@example.com",
    "role": "user",
    "plan": "free",
}


# ── Supabase stub (extended PR1 stub) ─────────────────────────────────────


class _R:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, table, db):
        self.table = table
        self.db = db
        self._filters: list[tuple[str, str, Any]] = []
        self._order_key: str | None = None
        self._desc = False
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._op = "select"
        self._payload: Any = None
        self._select_cols: tuple[str, ...] | None = None

    def select(self, *cols, **kw):
        self._op = "select"
        if cols:
            self._select_cols = cols
        return self

    def insert(self, payload):
        self._op = "insert"
        self._payload = payload
        return self

    def update(self, patch):
        self._op = "update"
        self._payload = patch
        return self

    def delete(self):
        self._op = "delete"
        return self

    def eq(self, k, v):
        self._filters.append((k, "eq", v))
        return self

    def neq(self, k, v):
        self._filters.append((k, "neq", v))
        return self

    def lt(self, k, v):
        self._filters.append((k, "lt", v))
        return self

    def in_(self, k, vs):
        self._filters.append((k, "in", list(vs)))
        return self

    def order(self, k, desc=False, **kw):
        self._order_key = k
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start, end):
        self._range = (start, end)
        return self

    def _match(self, row) -> bool:
        for k, op, v in self._filters:
            cell = row.get(k)
            if op == "eq" and cell != v:
                return False
            if op == "neq" and cell == v:
                return False
            if op == "lt" and not (cell is not None and cell < v):
                return False
            if op == "in" and cell not in v:
                return False
        return True

    def execute(self):
        rows = self.db.setdefault(self.table, [])
        if self._op == "insert":
            payloads = (
                self._payload if isinstance(self._payload, list) else [self._payload]
            )
            inserted = []
            for p in payloads:
                r = dict(p)
                r.setdefault("id", str(uuid4()))
                r.setdefault(
                    "created_at", f"2026-05-18T00:00:{len(rows):02d}Z"
                )
                r.setdefault("updated_at", r["created_at"])
                rows.append(r)
                inserted.append(dict(r))
            return _R(inserted)
        if self._op == "update":
            updated = []
            for r in rows:
                if self._match(r):
                    # `"now()"` is a Supabase sentinel; tests don't care
                    # about its actual value, just that it lands as a key.
                    r.update(self._payload or {})
                    updated.append(dict(r))
            return _R(updated)
        if self._op == "delete":
            keep, removed = [], []
            for r in rows:
                (removed if self._match(r) else keep).append(r)
            self.db[self.table] = keep
            return _R([dict(r) for r in removed])
        matched = [dict(r) for r in rows if self._match(r)]
        if self._order_key:
            matched.sort(
                key=lambda x: x.get(self._order_key) or 0, reverse=self._desc
            )
        if self._range is not None:
            start, end = self._range
            matched = matched[start : end + 1]
        elif self._limit is not None:
            matched = matched[: self._limit]
        return _R(matched)


class _Rpc:
    def __init__(self, parent: "_SB", name: str, params: dict):
        self.parent = parent
        self.name = name
        self.params = params or {}

    def execute(self):
        if self.name == "replace_document_pages":
            return self.parent._rpc_replace_document_pages(self.params)
        return _R(None)


class _FakeStorageObject:
    def __init__(self, bucket: str, parent: "_FakeStorage"):
        self.bucket = bucket
        self.parent = parent

    def create_signed_upload_url(self, path):
        return {
            "signed_url": f"https://fake-storage.local/{self.bucket}/{path}?upload=1",
            "token": f"token-{path}",
        }

    def create_signed_url(self, path, expires_in):
        return {"signed_url": f"https://fake-storage.local/{self.bucket}/{path}"}

    def download(self, path):
        return self.parent.objects.get((self.bucket, path))


class _FakeStorage:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def from_(self, bucket):
        return _FakeStorageObject(bucket, self)


class _SB:
    def __init__(self):
        self.db: dict[str, list[dict]] = {}
        self.storage = _FakeStorage()
        self.rpc_calls: list[tuple[str, dict]] = []

    def table(self, name):
        return _Q(name, self.db)

    def rpc(self, name, params):
        self.rpc_calls.append((name, dict(params or {})))
        return _Rpc(self, name, params)

    def _rpc_replace_document_pages(self, params):
        # Mirror the SQL function in migration 113: delete then insert.
        doc_id = params["p_document_id"]
        pages = params.get("p_pages") or []
        engine = params.get("p_parser_engine")
        version = params.get("p_parser_version")
        table = self.db.setdefault("document_pages", [])
        self.db["document_pages"] = [r for r in table if r.get("document_id") != doc_id]
        inserted = 0
        for p in pages:
            row = {
                "id": str(uuid4()),
                "document_id": doc_id,
                "page_number": int(p.get("page_number") or 0),
                "text_content": p.get("text_content") or "",
                "char_count": int(p.get("char_count") or 0),
                "extraction_status": p.get("extraction_status") or "extracted",
                "parser_engine": engine,
                "parser_version": version,
                "metadata": p.get("metadata") or {},
                "created_at": "2026-05-18T00:00:00Z",
                "updated_at": "2026-05-18T00:00:00Z",
            }
            self.db["document_pages"].append(row)
            inserted += 1
        return _R(inserted)


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def sb(monkeypatch):
    fake = _SB()
    # The service reaches both into library_api (download helper) and into
    # text_extract_mod (everything else) — patch both binding sites.
    monkeypatch.setattr(library_api, "get_supabase_admin", lambda: fake)
    return fake


def _app(user: dict) -> TestClient:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _seed_pdf(
    sb: _SB,
    *,
    owner_id: str,
    data: bytes = b"%PDF-1.4 hi",
    kind: str = "note_pdf",
    mime: str = "application/pdf",
    status: str = "uploaded",
    size: int | None = None,
) -> dict:
    """Insert a document_assets row + matching storage object and return it."""
    if size is None:
        size = len(data)
    path = f"{owner_id}/2026/05/18/{uuid4()}/file.pdf"
    sb.storage.objects[("library", path)] = data
    row = {
        "id": str(uuid4()),
        "owner_user_id": owner_id,
        "uploaded_by": owner_id,
        "scope": "personal_library",
        "document_kind": kind,
        "title": "Doc",
        "original_filename": "file.pdf",
        "mime_type": mime,
        "file_size_bytes": size,
        "storage_bucket": "library",
        "storage_path": path,
        "content_hash": "abc",
        "language_hint": None,
        "page_count": None,
        "processing_policy": "store_only",
        "visibility": "private",
        "status": status,
        "metadata": {},
        "created_at": "2026-05-18T00:00:00Z",
        "updated_at": "2026-05-18T00:00:00Z",
    }
    sb.db.setdefault("document_assets", []).append(row)
    return row


def _patch_parser(monkeypatch, pages: list[str] | Exception):
    """Replace the bound `parse_pdf_pages` symbol in the service module."""

    def _fn(_raw):
        if isinstance(pages, Exception):
            raise pages
        return list(pages)

    monkeypatch.setattr(text_extract_mod, "parse_pdf_pages", _fn)


# ── Tests ─────────────────────────────────────────────────────────────────


def test_pdf_complete_upload_enqueues_exactly_one_job(sb, monkeypatch):
    _patch_parser(monkeypatch, ["page one text"])
    client = _app(USER_A)
    path = f"{USER_A['id']}/2026/05/18/staging/file.pdf"
    sb.storage.objects[("library", path)] = b"%PDF-1.4 hi"
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "file.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(b"%PDF-1.4 hi"),
            "document_kind": "note_pdf",
        },
    )
    assert r.status_code == 200, r.text
    doc_id = r.json()["id"]
    jobs = [
        j for j in sb.db.get("document_processing_jobs", [])
        if j["document_id"] == doc_id and j["job_type"] == "text_extract"
    ]
    assert len(jobs) == 1
    assert jobs[0]["status"] == "queued"


@pytest.mark.parametrize(
    "filename,mime,kind",
    [
        ("note.txt", "text/plain", "text_file"),
        ("img.png", "image/png", "image"),
    ],
)
def test_non_pdf_does_not_enqueue(sb, filename, mime, kind):
    client = _app(USER_A)
    path = f"{USER_A['id']}/2026/05/18/x/{filename}"
    sb.storage.objects[("library", path)] = b"hello world"
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": filename,
            "mime_type": mime,
            "size_bytes": len(b"hello world"),
            "document_kind": kind,
        },
    )
    assert r.status_code == 200
    assert sb.db.get("document_processing_jobs", []) == []


def test_document_kind_other_with_non_pdf_does_not_enqueue(sb):
    # `other` kind is allowed under personal_library but only auto-enqueues
    # when the MIME is application/pdf. A .txt with kind=other must not.
    client = _app(USER_A)
    path = f"{USER_A['id']}/2026/05/18/x/notes.txt"
    sb.storage.objects[("library", path)] = b"hello"
    r = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "notes.txt",
            "mime_type": "text/plain",
            "size_bytes": 5,
            "document_kind": "other",
        },
    )
    assert r.status_code == 200
    assert sb.db.get("document_processing_jobs", []) == []


def test_duplicate_enqueue_returns_existing(sb):
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    first = text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    second = text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    assert first["enqueued"] is True
    assert second["enqueued"] is False
    assert first["job"]["id"] == second["job"]["id"]
    jobs = sb.db.get("document_processing_jobs", [])
    assert len(jobs) == 1


def test_owner_can_post_process_text(sb, monkeypatch):
    _patch_parser(monkeypatch, ["alpha", "beta"])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    assert body["document"]["status"] == "processed"
    assert body["job"]["metrics"]["extracted_page_count"] == 2


def test_non_owner_gets_404_on_process_text(sb):
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_B).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 404


def test_archived_doc_returns_409(sb, monkeypatch):
    _patch_parser(monkeypatch, ["a"])
    doc = _seed_pdf(sb, owner_id=USER_A["id"], status="archived")
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 409


def test_atomic_claim_race(sb):
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    enq = text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    job_id = enq["job"]["id"]
    first = text_extract_mod._atomic_claim_job(sb, job_id)
    second = text_extract_mod._atomic_claim_job(sb, job_id)
    assert first is not None and first["status"] == "running"
    assert second is None  # second claim fails — first wins


def test_success_writes_pages_and_marks_processed(sb, monkeypatch):
    _patch_parser(monkeypatch, ["page one", "page two"])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    pages = [
        p for p in sb.db.get("document_pages", []) if p["document_id"] == doc["id"]
    ]
    assert len(pages) == 2
    assert {p["page_number"] for p in pages} == {1, 2}
    job = sb.db["document_processing_jobs"][0]
    assert job["status"] == "succeeded"
    doc_after = next(d for d in sb.db["document_assets"] if d["id"] == doc["id"])
    assert doc_after["status"] == "processed"


def test_all_empty_pdf_marks_likely_needs_ocr(sb, monkeypatch):
    # Parser yields no usable text (empty strings filtered by parse_pdf_pages,
    # so the wrapper returns []; the service treats len==0 as a clean run
    # with no extractable text and sets `likely_needs_ocr` only when there
    # was text-bearing content (>=50% empty). Empty list → no OCR hint, no
    # pages, succeeded. We exercise the "all empty but pages seen" path by
    # returning a list with empty strings — the service classifies them as
    # `empty` and flips the OCR hint.
    _patch_parser(monkeypatch, ["", "", ""])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    job = sb.db["document_processing_jobs"][0]
    assert job["status"] == "succeeded"
    assert job["metrics"]["likely_needs_ocr"] is True
    pages = [p for p in sb.db["document_pages"] if p["document_id"] == doc["id"]]
    assert len(pages) == 3
    assert all(p["extraction_status"] == "empty" for p in pages)


def test_parser_exception_marks_failed(sb, monkeypatch):
    _patch_parser(monkeypatch, RuntimeError("pypdf boom"))
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    job = sb.db["document_processing_jobs"][0]
    assert job["status"] == "failed"
    assert job["error_code"] == "parser_crash"
    doc_after = next(d for d in sb.db["document_assets"] if d["id"] == doc["id"])
    assert doc_after["status"] == "failed"


def test_rerun_replaces_page_rows(sb, monkeypatch):
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])

    _patch_parser(monkeypatch, ["one"])
    _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    first_ids = {p["id"] for p in sb.db["document_pages"] if p["document_id"] == doc["id"]}
    assert len(first_ids) == 1

    # Re-run: the previous succeeded job stays; we lazily enqueue a fresh
    # job and re-run. Pages from the first run must be deleted, not merged.
    _patch_parser(monkeypatch, ["new one", "new two"])
    _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    second_ids = {p["id"] for p in sb.db["document_pages"] if p["document_id"] == doc["id"]}
    assert len(second_ids) == 2
    assert first_ids.isdisjoint(second_ids), "old page ids must be gone"


def test_pages_endpoint_owner_only(sb, monkeypatch):
    _patch_parser(monkeypatch, ["alpha"])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")

    ok = _app(USER_A).get(f"/api/library/items/{doc['id']}/pages").json()
    assert ok["count"] == 1
    assert ok["pages"][0]["text_content"] == "alpha"

    deny = _app(USER_B).get(f"/api/library/items/{doc['id']}/pages")
    assert deny.status_code == 404


def test_pages_pagination_respects_limits(sb, monkeypatch):
    _patch_parser(monkeypatch, [f"page {i}" for i in range(1, 8)])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")

    client = _app(USER_A)
    page1 = client.get(
        f"/api/library/items/{doc['id']}/pages", params={"limit": 3, "offset": 0}
    ).json()
    page2 = client.get(
        f"/api/library/items/{doc['id']}/pages", params={"limit": 3, "offset": 3}
    ).json()
    assert [p["page_number"] for p in page1["pages"]] == [1, 2, 3]
    assert [p["page_number"] for p in page2["pages"]] == [4, 5, 6]

    too_big = client.get(
        f"/api/library/items/{doc['id']}/pages", params={"limit": 999}
    )
    assert too_big.status_code == 422  # pydantic rejects > 200


def test_page_cap_truncates(sb, monkeypatch):
    monkeypatch.setattr(text_extract_mod, "MAX_EXTRACT_PAGES", 3)
    _patch_parser(monkeypatch, [f"p{i}" for i in range(1, 6)])  # 5 pages
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    assert body["job"]["metrics"]["truncated"] is True
    assert body["job"]["metrics"]["stored_page_count"] == 3
    pages = [p for p in sb.db["document_pages"] if p["document_id"] == doc["id"]]
    assert len(pages) == 3


def test_size_recheck_rejects_oversize(sb, monkeypatch):
    # Force the doc's size above the configured cap (default 25 MB).
    from app.core.config import get_settings as _gs

    cap_bytes = _gs().LIBRARY_MAX_UPLOAD_MB * 1024 * 1024
    doc = _seed_pdf(sb, owner_id=USER_A["id"], size=cap_bytes + 1)
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["status"] == "failed"
    assert body["job"]["error_code"] == "file_too_large_for_extract"


def test_lazy_enqueue_for_pr1_uploads(sb, monkeypatch):
    """A PR1-era PDF row has no existing job; /process-text must enqueue
    one and then run it."""
    _patch_parser(monkeypatch, ["lazy"])
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    assert sb.db.get("document_processing_jobs", []) == []
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    jobs = sb.db.get("document_processing_jobs", [])
    assert len(jobs) == 1
    assert jobs[0]["status"] == "succeeded"


def test_timeout_marks_failed(sb, monkeypatch):
    # Cap the wall-clock at 0s and stage two pages — the between-page check
    # fires before the first page is processed, leaving the parser's output
    # unused and the job failed.
    monkeypatch.setattr(text_extract_mod, "EXTRACT_TIMEOUT_SECONDS", 0)

    # Slow yield: parse_pdf_pages itself takes a measurable instant so the
    # subsequent monotonic check trips. We don't need to be subtle — the
    # cap is 0 so any forward motion at all is "over".
    def _slow(_raw):
        time.sleep(0.01)
        return ["one", "two"]

    monkeypatch.setattr(text_extract_mod, "parse_pdf_pages", _slow)

    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).post(f"/api/library/items/{doc['id']}/process-text")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["status"] == "failed"
    assert body["job"]["metrics"]["timed_out"] is True
    doc_after = next(d for d in sb.db["document_assets"] if d["id"] == doc["id"])
    assert doc_after["status"] == "failed"


def test_non_pdf_process_text_rejected(sb):
    # complete-upload for text/plain leaves the doc as `uploaded` with no
    # job. /process-text must reject MIME != application/pdf with 400.
    client = _app(USER_A)
    path = f"{USER_A['id']}/2026/05/18/x/n.txt"
    sb.storage.objects[("library", path)] = b"hi"
    created = client.post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "n.txt",
            "mime_type": "text/plain",
            "size_bytes": 2,
            "document_kind": "text_file",
        },
    ).json()
    r = client.post(f"/api/library/items/{created['id']}/process-text")
    assert r.status_code == 400


def test_jobs_endpoint_surfaces_text_extract(sb):
    doc = _seed_pdf(sb, owner_id=USER_A["id"])
    text_extract_mod.enqueue_text_extract_job(sb, doc["id"])
    r = _app(USER_A).get(f"/api/library/items/{doc['id']}/jobs")
    assert r.status_code == 200
    jobs = r.json()["jobs"]
    assert any(j["job_type"] == "text_extract" for j in jobs)
