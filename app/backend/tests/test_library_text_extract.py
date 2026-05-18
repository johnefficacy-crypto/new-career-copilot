"""PR2 — Document Text Extraction tests.

Builds on the in-memory stub style from `test_library.py` but extends it
to cover the supabase-py ops the extraction service uses (`in_`,
`range`, `rpc`). The PDF parser is monkeypatched at its import location
(`app.library.text_extract.parse_pdf_pages`) so no real PDF bytes are
needed for most cases.
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
from app.library import text_extract as text_extract_svc


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


# ── Extended Supabase stub ────────────────────────────────────────────────


class _R:
    def __init__(self, data):
        self.data = data


class _Q:
    def __init__(self, table: str, db: dict[str, list[dict]]):
        self.table = table
        self.db = db
        self._filters: list[tuple[str, str, Any]] = []
        self._order_key: str | None = None
        self._desc = False
        self._limit: int | None = None
        self._range: tuple[int, int] | None = None
        self._op = "select"
        self._payload: Any = None

    def select(self, *a, **kw):
        self._op = "select"
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

    def eq(self, key, val):
        self._filters.append((key, "eq", val))
        return self

    def neq(self, key, val):
        self._filters.append((key, "neq", val))
        return self

    def lt(self, key, val):
        self._filters.append((key, "lt", val))
        return self

    def in_(self, key, vals):
        self._filters.append((key, "in", list(vals)))
        return self

    def order(self, key, desc=False, **kw):
        self._order_key = key
        self._desc = desc
        return self

    def limit(self, n):
        self._limit = n
        return self

    def range(self, start: int, end: int):
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
            payloads = self._payload if isinstance(self._payload, list) else [self._payload]
            inserted = []
            for p in payloads:
                r = dict(p)
                r.setdefault("id", str(uuid4()))
                r.setdefault("created_at", f"2026-05-18T00:00:{len(rows):02d}Z")
                r.setdefault("updated_at", r["created_at"])
                rows.append(r)
                inserted.append(r)
            return _R(inserted)
        if self._op == "update":
            updated = []
            for r in rows:
                if self._match(r):
                    r.update(self._payload or {})
                    updated.append(r)
            return _R(updated)
        if self._op == "delete":
            keep, removed = [], []
            for r in rows:
                (removed if self._match(r) else keep).append(r)
            self.db[self.table] = keep
            return _R(removed)
        matched = [dict(r) for r in rows if self._match(r)]
        if self._order_key:
            matched.sort(key=lambda x: x.get(self._order_key) or "", reverse=self._desc)
        if self._range is not None:
            start, end = self._range
            matched = matched[start : end + 1]
        elif self._limit is not None:
            matched = matched[: self._limit]
        return _R(matched)


class _RpcCall:
    def __init__(self, fn):
        self._fn = fn

    def execute(self):
        return _R(self._fn())


class _FakeStorageObject:
    def __init__(self, bucket: str, parent: "_FakeStorage"):
        self.bucket = bucket
        self.parent = parent

    def create_signed_upload_url(self, path: str) -> dict:
        return {"signed_url": f"https://fake/{self.bucket}/{path}", "token": "t"}

    def create_signed_url(self, path: str, ttl: int) -> dict:
        return {"signed_url": f"https://fake/{self.bucket}/{path}?ttl={ttl}"}

    def download(self, path: str) -> bytes | None:
        key = (self.bucket, path)
        if key not in self.parent.objects:
            raise RuntimeError(f"object missing: {key}")
        return self.parent.objects[key]


class _FakeStorage:
    def __init__(self):
        self.objects: dict[tuple[str, str], bytes] = {}

    def from_(self, bucket: str) -> _FakeStorageObject:
        return _FakeStorageObject(bucket, self)


class _SB:
    def __init__(self):
        self.db: dict[str, list[dict]] = {}
        self.storage = _FakeStorage()

    def table(self, name: str) -> _Q:
        return _Q(name, self.db)

    def rpc(self, name: str, params: dict) -> _RpcCall:
        if name == "replace_document_pages":
            def _run():
                doc_id = params["p_document_id"]
                pages = params["p_pages"] or []
                self.db["document_pages"] = [
                    r for r in self.db.get("document_pages", [])
                    if r.get("document_id") != doc_id
                ]
                for p in pages:
                    self.db.setdefault("document_pages", []).append({
                        "id": str(uuid4()),
                        "document_id": doc_id,
                        "page_number": p["page_number"],
                        "text_content": p.get("text_content", ""),
                        "char_count": p.get("char_count", 0),
                        "extraction_status": p.get("extraction_status", "extracted"),
                        "parser_engine": params["p_parser_engine"],
                        "parser_version": params["p_parser_version"],
                        "metadata": p.get("metadata") or {},
                    })
                return len(pages)
            return _RpcCall(_run)
        return _RpcCall(lambda: None)


# ── Fixtures ──────────────────────────────────────────────────────────────


@pytest.fixture
def sb(monkeypatch):
    fake = _SB()
    monkeypatch.setattr(library_api, "get_supabase_admin", lambda: fake)
    return fake


def _app(sb: _SB, user: dict) -> TestClient:
    app = FastAPI()
    app.include_router(library_api.router, prefix="/api")
    app.dependency_overrides[get_current_user] = lambda: user
    return TestClient(app, raise_server_exceptions=False)


def _seed_doc(
    sb: _SB,
    *,
    doc_id: str,
    owner: dict = USER_A,
    mime: str = "application/pdf",
    kind: str = "note_pdf",
    status: str = "uploaded",
    size: int = 12,
    bucket: str = "library",
    path: str | None = None,
    body: bytes = b"%PDF-1.4 fake",
) -> dict:
    path = path or f"{owner['id']}/2026/05/18/{doc_id}/n.pdf"
    sb.storage.objects[(bucket, path)] = body
    row = {
        "id": doc_id,
        "owner_user_id": owner["id"],
        "scope": "personal_library",
        "document_kind": kind,
        "original_filename": "n.pdf",
        "mime_type": mime,
        "file_size_bytes": size,
        "storage_bucket": bucket,
        "storage_path": path,
        "content_hash": "h",
        "status": status,
        "metadata": {},
        "processing_policy": "store_only",
        "visibility": "private",
        "created_at": "2026-05-18T10:00:00Z",
        "updated_at": "2026-05-18T10:00:00Z",
    }
    sb.db.setdefault("document_assets", []).append(row)
    return row


def _patch_parser(monkeypatch, pages: list[str], page_count: int | None = None):
    monkeypatch.setattr(text_extract_svc, "parse_pdf_pages", lambda _b: list(pages))
    if page_count is not None:
        monkeypatch.setattr(text_extract_svc, "_count_pdf_pages", lambda _b: page_count)


# ── Tests ─────────────────────────────────────────────────────────────────


def test_pdf_complete_upload_enqueues_text_extract_job(sb):
    path = f"{USER_A['id']}/2026/05/18/abc/n.pdf"
    sb.storage.objects[("library", path)] = b"%PDF-1.4 hi"
    r = _app(sb, USER_A).post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "n.pdf",
            "mime_type": "application/pdf",
            "size_bytes": len(b"%PDF-1.4 hi"),
            "document_kind": "note_pdf",
        },
    )
    assert r.status_code == 200, r.text
    jobs = sb.db.get("document_processing_jobs", [])
    assert len(jobs) == 1
    assert jobs[0]["job_type"] == "text_extract"
    assert jobs[0]["status"] == "queued"


@pytest.mark.parametrize("mime,kind,filename", [
    ("text/plain", "text_file", "n.txt"),
    ("image/png", "image", "n.png"),
])
def test_non_pdf_does_not_enqueue(sb, mime, kind, filename):
    path = f"{USER_A['id']}/2026/05/18/abc/{filename}"
    sb.storage.objects[("library", path)] = b"hello"
    r = _app(sb, USER_A).post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": filename,
            "mime_type": mime,
            "size_bytes": 5,
            "document_kind": kind,
        },
    )
    assert r.status_code == 200
    assert sb.db.get("document_processing_jobs", []) == []


def test_other_kind_with_non_pdf_does_not_enqueue(sb):
    path = f"{USER_A['id']}/2026/05/18/abc/n.txt"
    sb.storage.objects[("library", path)] = b"hello"
    r = _app(sb, USER_A).post(
        "/api/library/complete-upload",
        json={
            "storage_path": path,
            "original_filename": "n.txt",
            "mime_type": "text/plain",
            "size_bytes": 5,
            "document_kind": "other",
        },
    )
    assert r.status_code == 200
    assert sb.db.get("document_processing_jobs", []) == []


def test_duplicate_enqueue_returns_existing_job(sb):
    _seed_doc(sb, doc_id="aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    first = text_extract_svc.enqueue_text_extract_job(sb, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    second = text_extract_svc.enqueue_text_extract_job(sb, "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa")
    assert first["enqueued"] is True
    assert second["enqueued"] is False
    assert second["job"]["id"] == first["job"]["id"]


def test_owner_can_process_text(sb, monkeypatch):
    doc_id = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb"
    _seed_doc(sb, doc_id=doc_id)
    _patch_parser(monkeypatch, ["hello world", "page two"], page_count=2)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    assert body["document"]["status"] == "processed"
    assert body["job"]["metrics"]["extracted_page_count"] == 2


def test_non_owner_gets_404_on_process_text(sb, monkeypatch):
    doc_id = "cccccccc-cccc-cccc-cccc-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    _patch_parser(monkeypatch, ["x"], page_count=1)
    r = _app(sb, USER_B).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 404


def test_archived_doc_returns_409(sb, monkeypatch):
    doc_id = "dddddddd-dddd-dddd-dddd-dddddddddddd"
    _seed_doc(sb, doc_id=doc_id, status="archived")
    _patch_parser(monkeypatch, ["x"], page_count=1)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 409


def test_atomic_claim_race_second_caller_gets_conflict(sb):
    _seed_doc(sb, doc_id="eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
    enq = text_extract_svc.enqueue_text_extract_job(sb, "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee")
    job_id = enq["job"]["id"]
    first = text_extract_svc._claim_job(sb, job_id)
    second = text_extract_svc._claim_job(sb, job_id)
    assert first is not None and first["status"] == "running"
    assert second is None


def test_success_path_writes_pages_and_flips_status(sb, monkeypatch):
    doc_id = "ffffffff-ffff-ffff-ffff-ffffffffffff"
    _seed_doc(sb, doc_id=doc_id)
    _patch_parser(monkeypatch, ["alpha", "beta gamma"], page_count=2)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    assert body["document"]["status"] == "processed"
    pages = [p for p in sb.db["document_pages"] if p["document_id"] == doc_id]
    assert len(pages) == 2
    assert {p["page_number"] for p in pages} == {1, 2}
    assert all(p["extraction_status"] == "extracted" for p in pages)
    assert sb.db["document_assets"][0]["status"] == "processed"


def test_all_empty_pdf_marks_likely_needs_ocr(sb, monkeypatch):
    doc_id = "aaaaaaaa-1111-1111-1111-aaaaaaaaaaaa"
    _seed_doc(sb, doc_id=doc_id)
    _patch_parser(monkeypatch, [], page_count=5)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["status"] == "succeeded"
    assert body["document"]["status"] == "processed"
    assert body["job"]["metrics"]["likely_needs_ocr"] is True
    assert body["job"]["metrics"]["page_count"] == 5
    assert body["job"]["metrics"]["extracted_page_count"] == 0
    assert sb.db.get("document_pages", []) == []


def test_parser_exception_marks_failed(sb, monkeypatch):
    doc_id = "bbbbbbbb-2222-2222-2222-bbbbbbbbbbbb"
    _seed_doc(sb, doc_id=doc_id)

    def _boom(_b):
        raise RuntimeError("kaboom")
    monkeypatch.setattr(text_extract_svc, "parse_pdf_pages", _boom)
    monkeypatch.setattr(text_extract_svc, "_count_pdf_pages", lambda _b: 3)

    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 400
    job = sb.db["document_processing_jobs"][0]
    assert job["status"] == "failed"
    assert sb.db["document_assets"][0]["status"] == "failed"


def test_rerun_replaces_page_ids(sb, monkeypatch):
    doc_id = "cccccccc-3333-3333-3333-cccccccccccc"
    _seed_doc(sb, doc_id=doc_id)
    _patch_parser(monkeypatch, ["first run page"], page_count=1)
    r1 = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r1.status_code == 200
    first_ids = {p["id"] for p in sb.db["document_pages"] if p["document_id"] == doc_id}
    assert len(first_ids) == 1

    # Re-run: re-enqueue happens lazily because previous job is succeeded.
    _patch_parser(monkeypatch, ["second run a", "second run b"], page_count=2)
    r2 = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r2.status_code == 200, r2.text
    second_ids = {p["id"] for p in sb.db["document_pages"] if p["document_id"] == doc_id}
    assert len(second_ids) == 2
    assert first_ids.isdisjoint(second_ids)


def test_pages_endpoint_owner_only(sb):
    doc_id = "dddddddd-4444-4444-4444-dddddddddddd"
    _seed_doc(sb, doc_id=doc_id, owner=USER_A)
    sb.db["document_pages"] = [
        {"id": str(uuid4()), "document_id": doc_id, "page_number": 1,
         "text_content": "owner-only", "char_count": 10, "extraction_status": "extracted",
         "metadata": {}},
    ]
    ok = _app(sb, USER_A).get(f"/api/library/items/{doc_id}/pages")
    assert ok.status_code == 200
    assert len(ok.json()["pages"]) == 1
    deny = _app(sb, USER_B).get(f"/api/library/items/{doc_id}/pages")
    assert deny.status_code == 404


def test_pages_pagination_respects_limit_offset(sb):
    doc_id = "eeeeeeee-5555-5555-5555-eeeeeeeeeeee"
    _seed_doc(sb, doc_id=doc_id)
    sb.db["document_pages"] = [
        {"id": str(uuid4()), "document_id": doc_id, "page_number": i,
         "text_content": f"p{i}", "char_count": 2, "extraction_status": "extracted",
         "metadata": {}}
        for i in range(1, 11)
    ]
    r = _app(sb, USER_A).get(f"/api/library/items/{doc_id}/pages", params={"limit": 3, "offset": 5})
    assert r.status_code == 200
    body = r.json()
    assert body["limit"] == 3
    assert body["offset"] == 5
    assert [p["page_number"] for p in body["pages"]] == [6, 7, 8]

    # Caps at 200.
    over = _app(sb, USER_A).get(
        f"/api/library/items/{doc_id}/pages", params={"limit": 9999},
    )
    assert over.status_code == 422  # fastapi Query(le=200) returns 422


def test_page_cap_truncates_to_constant(sb, monkeypatch):
    doc_id = "ffffffff-6666-6666-6666-ffffffffffff"
    _seed_doc(sb, doc_id=doc_id)
    monkeypatch.setattr(text_extract_svc, "MAX_EXTRACT_PAGES", 3)
    _patch_parser(monkeypatch, [f"page-{i}" for i in range(1, 6)], page_count=5)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200, r.text
    body = r.json()
    assert body["job"]["metrics"]["truncated"] is True
    assert body["job"]["metrics"]["page_cap"] == 3
    assert body["job"]["metrics"]["stored_page_count"] == 3
    stored = [p for p in sb.db["document_pages"] if p["document_id"] == doc_id]
    assert {p["page_number"] for p in stored} == {1, 2, 3}


def test_size_recheck_rejects_oversize_doc(sb, monkeypatch):
    doc_id = "11111111-aaaa-aaaa-aaaa-111111111111"
    _seed_doc(sb, doc_id=doc_id, size=99 * 1024 * 1024)  # >> 25 MB default
    _patch_parser(monkeypatch, ["x"], page_count=1)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 400
    detail = r.json()["detail"]
    assert detail["code"] == "file_too_large_for_extract"
    job = sb.db["document_processing_jobs"][0]
    assert job["status"] == "failed"
    assert job["error_code"] == "file_too_large_for_extract"


def test_lazy_enqueue_when_no_existing_job(sb, monkeypatch):
    """Simulates a PR1-era upload (doc exists, no job row). Calling
    process-text should lazily enqueue and then run."""
    doc_id = "22222222-bbbb-bbbb-bbbb-222222222222"
    _seed_doc(sb, doc_id=doc_id)
    assert sb.db.get("document_processing_jobs", []) == []
    _patch_parser(monkeypatch, ["only page"], page_count=1)
    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200, r.text
    jobs = sb.db["document_processing_jobs"]
    assert len(jobs) == 1
    assert jobs[0]["status"] == "succeeded"


def test_timeout_marks_timed_out_and_failed(sb, monkeypatch):
    doc_id = "33333333-cccc-cccc-cccc-333333333333"
    _seed_doc(sb, doc_id=doc_id)

    def _slow(_b):
        time.sleep(0.05)
        return ["a", "b", "c"]
    monkeypatch.setattr(text_extract_svc, "parse_pdf_pages", _slow)
    monkeypatch.setattr(text_extract_svc, "_count_pdf_pages", lambda _b: 3)
    monkeypatch.setattr(text_extract_svc, "EXTRACT_TIMEOUT_SECONDS", 0.01)

    r = _app(sb, USER_A).post(f"/api/library/items/{doc_id}/process-text")
    assert r.status_code == 200
    body = r.json()
    assert body["job"]["status"] == "failed"
    assert body["job"]["metrics"]["timed_out"] is True
    assert body["document"]["status"] == "failed"
